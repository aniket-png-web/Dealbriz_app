import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import {
  MapPin,
  Navigation,
  Maximize2,
  Minimize2,
  Plus,
  Minus,
  RotateCcw,
  Layers,
  Lock,
  Sparkles,
} from 'lucide-react';
import { Listing } from '../types';
import {
  detectUserCity,
  DB_AREAS,
  bareCityName,
  listingMatchesCity,
  locationsApi,
} from '../services/dealbrizApi';

interface ListingsNearYouMapProps {
  listings: Listing[];
  selectedCity: string;
  /** The city on the user's profile. Used whenever no filter is applied. */
  profileCity?: string;
  onSelectCity: (city: string) => void;
  onSelectListing: (listing: Listing) => void;
}

type MapLayerType = 'street' | 'satellite';

export const ListingsNearYouMap: React.FC<ListingsNearYouMapProps> = ({
  listings,
  selectedCity,
  profileCity,
  onSelectCity,
  onSelectListing,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const isExpandedRef = useRef<boolean>(false);
  // Coordinates for a city that isn't one of the 14 in DB_AREAS, so the map
  // stops falling back to Chandigarh for everywhere else in India.
  const [resolvedCoords, setResolvedCoords] = useState<{
    name: string;
    lat: number;
    lon: number;
  } | null>(null);
  const [mapLayer, setMapLayer] = useState<MapLayerType>('street');
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [detectedToast, setDetectedToast] = useState<string | null>(null);

  /**
   * Gesture lock. While locked, Leaflet's pan/zoom handlers are off, so a
   * finger dragged across the map scrolls the page instead of moving the map
   * (and a stray tap can't zoom it out). Double-tap unlocks it; it re-locks
   * itself after a few idle seconds.
   */
  const [isMapUnlocked, setIsMapUnlocked] = useState<boolean>(false);
  const lastTapRef = useRef<number>(0);
  const relockTimerRef = useRef<number | null>(null);

  // Where the map centres: the selected city, else the user's detected
  // position, else the middle of the covered region. It used to hard-default
  // to Chandigarh, which is why the map opened there wherever you were.
  const [detectedCoords, setDetectedCoords] = useState<{ lat: number; lon: number } | null>(null);

  isExpandedRef.current = isExpanded;

  // "All Cities" is a filter choice, not a statement about where the user is.
  const effectiveCity =
    selectedCity && selectedCity !== 'All Cities'
      ? selectedCity
      : (profileCity || '').trim() || selectedCity;

  const currentArea =
    DB_AREAS.find((a) => bareCityName(a.name) === bareCityName(effectiveCity)) ||
    (resolvedCoords && bareCityName(resolvedCoords.name) === bareCityName(effectiveCity)
      ? resolvedCoords
      : null) ||
    (detectedCoords
      ? { name: selectedCity || 'Your area', lat: detectedCoords.lat, lon: detectedCoords.lon }
      : DB_AREAS.find((a) => a.name === 'Chandigarh')!);

  // True when we're showing a fallback centre rather than the chosen area, so
  // the header can say so instead of implying the map is on that city.
  const centreIsFallback =
    Boolean(effectiveCity) &&
    effectiveCity !== 'All Cities' &&
    bareCityName(currentArea.name) !== bareCityName(effectiveCity);

  // Switch Tile Layer between Street (CartoDB Voyager) and Satellite (Esri Imagery)
  const applyTileLayer = useCallback((map: L.Map, layerType: MapLayerType) => {
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    if (layerType === 'satellite') {
      const satLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 19,
          crossOrigin: true,
          attribution: '&copy; Esri World Imagery',
        }
      );
      satLayer.addTo(map);
      tileLayerRef.current = satLayer;
    } else {
      // CartoDB's basemaps now require an API key and stamp "KEY REQUIRED"
      // across unkeyed tiles, which is what was showing over Chandigarh.
      // Standard OSM tiles need no key.
      const streetLayer = L.tileLayer(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          maxZoom: 19,
          crossOrigin: true,
          attribution: '&copy; OpenStreetMap contributors',
        }
      );
      streetLayer.addTo(map);
      tileLayerRef.current = streetLayer;
    }
  }, []);

  // Initialize and manage Leaflet map with safe teardown and React StrictMode isolation
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    // 1. Clean up previous map instance
    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.remove();
      } catch (err) {
        console.warn('Map cleanup error:', err);
      }
      mapInstanceRef.current = null;
    }

    // 2. Clear any leftover Leaflet ID or nodes to avoid "Map container is already initialized"
    if ((container as unknown as { _leaflet_id?: unknown })._leaflet_id) {
      delete (container as unknown as { _leaflet_id?: unknown })._leaflet_id;
    }
    container.innerHTML = '';

    // 3. Create Leaflet map bound to DOM node
    const map = L.map(container, {
      center: [currentArea.lat, currentArea.lon],
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
      fadeAnimation: true,
      zoomAnimation: true,
      // Locked by default - see isMapUnlocked. Marker taps still work.
      dragging: false,
      touchZoom: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
    });

    // 4. Attach base tiles
    applyTileLayer(map, mapLayer);

    // 5. Attach markers layer
    const markersLayer = L.layerGroup().addTo(map);
    markersLayerRef.current = markersLayer;
    mapInstanceRef.current = map;

    // 6. Invalidate size repeatedly to guarantee tiles render when DOM settles
    const triggerInvalidate = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    };

    triggerInvalidate();
    const t1 = setTimeout(triggerInvalidate, 60);
    const t2 = setTimeout(triggerInvalidate, 250);
    const t3 = setTimeout(triggerInvalidate, 600);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        triggerInvalidate();
      });
      ro.observe(container);
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      if (ro) ro.disconnect();
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch {
          // ignore
        }
        mapInstanceRef.current = null;
        markersLayerRef.current = null;
        tileLayerRef.current = null;
      }
      if ((container as unknown as { _leaflet_id?: unknown })._leaflet_id) {
        delete (container as unknown as { _leaflet_id?: unknown })._leaflet_id;
      }
    };
  }, []);

  // Update tile layer if user toggles Street / Satellite
  useEffect(() => {
    if (mapInstanceRef.current) {
      applyTileLayer(mapInstanceRef.current, mapLayer);
    }
  }, [mapLayer, applyTileLayer]);

  // Ask the server for coordinates when the area isn't one we know.
  useEffect(() => {
    if (!effectiveCity || effectiveCity === 'All Cities') return;
    if (DB_AREAS.some((a) => bareCityName(a.name) === bareCityName(effectiveCity))) return;
    if (resolvedCoords && bareCityName(resolvedCoords.name) === bareCityName(effectiveCity)) return;

    let cancelled = false;
    locationsApi.search(effectiveCity).then((hits) => {
      if (cancelled) return;
      const withCoords = hits.filter(
        (h) => typeof h.lat === 'number' && typeof h.lon === 'number'
      );
      // Prefer an exact name match, but fall back to the first result that has
      // coordinates - we searched for this city, so the top hit is it. The old
      // exact-match-only rule failed on "Mandi" vs "Mandi (HP)" and on
      // district-level results, which is why the map stayed on Chandigarh.
      const hit =
        withCoords.find((h) => bareCityName(h.name) === bareCityName(effectiveCity)) ||
        withCoords[0];
      if (hit && typeof hit.lat === 'number' && typeof hit.lon === 'number') {
        // Stored under the name we searched for, so the guard above matches
        // next time and we don't re-query on every render.
        setResolvedCoords({ name: effectiveCity, lat: hit.lat, lon: hit.lon });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [effectiveCity, resolvedCoords]);

  // Pan smoothly to new city
  useEffect(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([currentArea.lat, currentArea.lon], 12, {
        duration: 0.9,
      });
      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 300);
    }
  }, [currentArea.lat, currentArea.lon]);

  // Update Markers when listings or city change
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;

    markersLayerRef.current.clearLayers();

    // Only this area's listings. The map used to draw whatever the feed held,
    // so listings from other cities appeared as pins around this one's centre.
    const areaListings =
      effectiveCity && effectiveCity !== 'All Cities'
        ? listings.filter((l) => listingMatchesCity(effectiveCity, l))
        : listings;

    const displayedListings = areaListings.slice(0, 18);

    displayedListings.forEach((item, idx) => {
      const angle = (idx * (360 / Math.max(1, displayedListings.length)) * Math.PI) / 180;
      const radius = 0.015 + (idx % 5) * 0.007;
      const lat = currentArea.lat + Math.sin(angle) * radius;
      const lon = currentArea.lon + Math.cos(angle) * radius;

      const formatPrice = (p: number) => {
        return p >= 100000 ? `₹${(p / 100000).toFixed(1)}L` : `₹${(p / 1000).toFixed(0)}k`;
      };

      // Custom Android Pill Marker
      const customIcon = L.divIcon({
        className: 'dealbriz-map-marker',
        html: `
          <div style="
            background: #2563EB;
            color: #FFFFFF;
            font-weight: 800;
            font-size: 11px;
            font-family: sans-serif;
            padding: 3px 8px;
            border-radius: 9999px;
            box-shadow: 0 4px 14px rgba(0,0,0,0.6);
            border: 2px solid #FFFFFF;
            white-space: nowrap;
            display: inline-flex;
            align-items: center;
            gap: 3px;
            cursor: pointer;
            transform: translate(-50%, -50%);
            user-select: none;
          ">
            <span>${formatPrice(item.price)}</span>
          </div>
        `,
        iconSize: [60, 26],
        iconAnchor: [30, 13],
      });

      const marker = L.marker([lat, lon], { icon: customIcon });

      const popupContent = document.createElement('div');
      popupContent.style.fontFamily = 'sans-serif';
      popupContent.style.minWidth = '170px';
      popupContent.style.color = '#f8fafc';
      popupContent.style.padding = '4px';

      const imgTag = item.image_url && item.image_url.trim()
        ? `<img src="${item.image_url.trim()}" style="width: 100%; height: 85px; object-fit: cover; border-radius: 8px; margin-bottom: 6px; display: block;" onerror="this.style.display='none'" />`
        : '';

      popupContent.innerHTML = `
        ${imgTag}
        <div style="font-size: 12px; font-weight: 700; line-height: 1.3; color: #ffffff;">${item.title}</div>
        <div style="font-size: 13px; font-weight: 900; color: #60a5fa; margin-top: 3px;">₹${item.price.toLocaleString('en-IN')}</div>
        <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">📍 ${item.location}</div>
        <button id="view-btn-${item.id}" style="margin-top: 8px; width: 100%; background: #2563eb; color: #fff; border: none; border-radius: 6px; padding: 6px; font-size: 11px; font-weight: 700; cursor: pointer; display: block; text-align: center;">
          View Details
        </button>
      `;

      marker.bindPopup(popupContent);

      marker.on('popupopen', () => {
        const btn = document.getElementById(`view-btn-${item.id}`);
        if (btn) {
          btn.onclick = () => {
            onSelectListing(item);
          };
        }
      });

      markersLayerRef.current?.addLayer(marker);
    });

    mapInstanceRef.current.invalidateSize();
  }, [listings, currentArea, onSelectListing]);

  // Handle Detect Location (Browser Geolocation API)
  const handleDetectLocation = async () => {
    setIsDetecting(true);
    try {
      const { city, coords } = await detectUserCity();
      if (coords) setDetectedCoords(coords);

      if (city) {
        onSelectCity(city);
        setDetectedToast(`Location detected: ${city}`);
      } else if (coords) {
        // We know where they are, just not which covered city that is.
        setDetectedToast('Centred on your location. Pick a city to filter listings.');
      } else {
        setDetectedToast('Could not detect location. Please select city manually.');
      }
      setTimeout(() => setDetectedToast(null), 3500);
    } catch {
      setDetectedToast('Could not detect location. Please select city manually.');
      setTimeout(() => setDetectedToast(null), 3500);
    } finally {
      setIsDetecting(false);
    }
  };

  // --- Gesture lock ------------------------------------------------------
  const setMapInteractive = useCallback((enabled: boolean) => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const handlers = ['dragging', 'touchZoom', 'scrollWheelZoom', 'doubleClickZoom'] as const;
    handlers.forEach((name) => {
      const handler = (map as any)[name];
      if (handler) enabled ? handler.enable() : handler.disable();
    });
  }, []);

  // Auto-relock stops a map you brushed past while scrolling staying live.
  // Expanding is deliberate, so the timer is off while expanded.
  const scheduleRelock = useCallback(() => {
    if (relockTimerRef.current) window.clearTimeout(relockTimerRef.current);
    if (isExpandedRef.current) return;
    relockTimerRef.current = window.setTimeout(() => {
      setIsMapUnlocked(false);
    }, 6000);
  }, []);

  const lockMap = useCallback(() => {
    if (relockTimerRef.current) window.clearTimeout(relockTimerRef.current);
    setIsMapUnlocked(false);
  }, []);

  const unlockMap = useCallback(() => {
    setIsMapUnlocked(true);
    scheduleRelock();
  }, [scheduleRelock]);

  // Apply the lock state to Leaflet, and keep the re-lock timer fed while the
  // user is actually moving the map.
  useEffect(() => {
    setMapInteractive(isMapUnlocked);
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!isMapUnlocked) return;

    const bump = () => scheduleRelock();
    map.on('movestart', bump);
    map.on('zoomstart', bump);
    map.on('moveend', bump);

    return () => {
      map.off('movestart', bump);
      map.off('zoomstart', bump);
      map.off('moveend', bump);
    };
  }, [isMapUnlocked, setMapInteractive, scheduleRelock]);

  useEffect(() => {
    return () => {
      if (relockTimerRef.current) window.clearTimeout(relockTimerRef.current);
    };
  }, []);

  // Two taps within 400ms unlocks. A single tap does nothing, so scrolling
  // past the map can't grab it.
  const handleMapPointerDown = () => {
    if (isMapUnlocked) {
      scheduleRelock();
      return;
    }
    const now = Date.now();
    if (now - lastTapRef.current < 400) {
      lastTapRef.current = 0;
      unlockMap();
    } else {
      lastTapRef.current = now;
    }
  };

  const handleZoomIn = () => {
    mapInstanceRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapInstanceRef.current?.zoomOut();
  };

  const handleRecenter = () => {
    mapInstanceRef.current?.flyTo([currentArea.lat, currentArea.lon], 12, {
      duration: 0.8,
    });
  };

  const toggleExpand = () => {
    setIsExpanded((prev) => !prev);
    setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 200);
  };

  const toggleMapLayer = () => {
    setMapLayer((prev) => (prev === 'street' ? 'satellite' : 'street'));
  };

  const currentHeightPx = isExpanded ? 280 : 180;

  return (
    <div id="dealbriz-live-map" className="px-3.5 pt-1 pb-2 dealbriz-map-wrapper">
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-md relative isolate">
        {/* Map Header Bar */}
        <div className="px-3 py-2 bg-white border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 shrink-0 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center">
              <MapPin className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-slate-900 leading-tight truncate">Listings Near You</h4>
              <p className="text-[10px] text-slate-500 leading-tight">
                {!effectiveCity || effectiveCity === 'All Cities'
                  ? `${listings.length} nearby`
                  : centreIsFallback
                    ? `${effectiveCity} · exact map position unavailable`
                    : `${effectiveCity} · approximate positions`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={toggleMapLayer}
              className={`w-7 h-7 rounded-lg border flex items-center justify-center active:scale-95 transition-all ${
                mapLayer === 'satellite'
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-slate-100 text-slate-600 border-slate-300'
              }`}
              title={mapLayer === 'satellite' ? 'Switch to street view' : 'Switch to satellite view'}
            >
              <Layers className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleDetectLocation}
              disabled={isDetecting}
              className="w-7 h-7 rounded-lg bg-slate-100 text-blue-700 border border-slate-300 flex items-center justify-center active:scale-95 transition-all disabled:opacity-60"
              title="Detect my location"
            >
              <Navigation className={`w-3.5 h-3.5 ${isDetecting ? 'animate-spin text-amber-600' : ''}`} />
            </button>

            <button
              onClick={handleRecenter}
              className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 border border-slate-300 flex items-center justify-center active:scale-95 transition-colors"
              title="Recenter map"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={toggleExpand}
              className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 border border-slate-300 flex items-center justify-center active:scale-95 transition-colors"
              title={isExpanded ? 'Collapse map' : 'Expand map'}
            >
              {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Leaflet Map Canvas - Compact explicit dimensions */}
        <div
          className={`relative isolate overflow-hidden w-full transition-all duration-300 ${
            isMapUnlocked ? 'ring-2 ring-blue-500 ring-inset' : ''
          }`}
          style={{ height: `${currentHeightPx}px`, minHeight: '160px' }}
          onPointerDown={handleMapPointerDown}
        >
          <div
            ref={mapContainerRef}
            className="w-full h-full"
            style={{ height: `${currentHeightPx}px`, width: '100%', minHeight: '160px' }}
          />

          {/* Map Overlay Floating Controls (Zoom + / -) */}
          <div
            className="absolute top-2 right-2 z-[900] flex flex-col gap-1"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleZoomIn}
              className="w-7 h-7 rounded-lg bg-white hover:bg-white border border-slate-300 text-slate-900 flex items-center justify-center shadow-lg active:scale-90 transition-all font-bold"
              title="Zoom In"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomOut}
              className="w-7 h-7 rounded-lg bg-white hover:bg-white border border-slate-300 text-slate-900 flex items-center justify-center shadow-lg active:scale-90 transition-all font-bold"
              title="Zoom Out"
            >
              <Minus className="w-4 h-4" />
            </button>
          </div>

          {/* Location Toast notification */}
          {detectedToast && (
            <div className="absolute top-2 left-2 right-12 z-[920] bg-white text-slate-900 text-[11px] font-semibold py-1.5 px-3 rounded-xl border border-blue-500 shadow-xl backdrop-blur-xs text-center animate-in fade-in">
              {detectedToast}
            </div>
          )}

          {/* Gesture-lock hint */}
          {isMapUnlocked ? (
            <div className="absolute bottom-2 left-2 right-2 z-[900] flex items-center justify-between gap-2">
              <span className="bg-blue-600/95 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow flex items-center gap-1.5">
                <Lock className="w-3 h-3" />
                Map unlocked — drag to explore
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  lockMap();
                }}
                className="bg-white text-slate-800 text-[10px] font-bold px-2.5 py-1 rounded-md border border-slate-600 active:scale-95"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="absolute bottom-2 left-2 right-2 z-[900] pointer-events-none flex items-center justify-between gap-2">
              <span className="bg-white backdrop-blur-xs text-slate-700 text-[10px] font-bold px-2 py-1 rounded-md border border-slate-300 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                {selectedCity}
              </span>
              <span className="bg-white backdrop-blur-xs text-slate-600 text-[10px] font-semibold px-2 py-1 rounded-md border border-slate-300">
                Double-tap to move map
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
