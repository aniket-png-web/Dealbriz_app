import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Search, Bell, X, SlidersHorizontal, CheckCircle2, LogIn, User, Navigation } from 'lucide-react';
import {
  lookupPincode,
  detectUserCity,
  PincodeLookupResult,
  DB_AREAS,
  locationsApi,
  LocationHit,
} from '../services/dealbrizApi';
import { UserProfile } from '../types';
import { initialsAvatar } from '../utils/imageUtils';

interface AndroidTopBarProps {
  selectedCity: string;
  onSelectCity: (city: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenFilters: () => void;
  unreadNotificationsCount?: number;
  onOpenNotifications: () => void;
  userProfile?: UserProfile;
  onOpenAuth?: (mode?: 'login' | 'signup') => void;
  onNavigateProfile?: () => void;
}

export const AndroidTopBar: React.FC<AndroidTopBarProps> = ({
  selectedCity,
  onSelectCity,
  searchQuery,
  onSearchChange,
  onOpenFilters,
  unreadNotificationsCount = 2,
  onOpenNotifications,
  userProfile,
  onOpenAuth,
  onNavigateProfile,
}) => {
  const [showCityModal, setShowCityModal] = useState<boolean>(false);
  const [cityQuery, setCityQuery] = useState('');
  const [pinResult, setPinResult] = useState<PincodeLookupResult | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [remoteHits, setRemoteHits] = useState<LocationHit[]>([]);
  const [searching, setSearching] = useState(false);

  // One box for both: six digits is a PIN code and goes to the postal lookup,
  // anything else is a name matched against the served areas and the server's
  // own location index.
  const trimmedQuery = cityQuery.trim();
  const isPinQuery = /^\d{6}$/.test(trimmedQuery);

  const localMatches = useMemo(() => {
    const q = trimmedQuery.toLowerCase();
    if (!q || /^\d+$/.test(q)) return [];
    return DB_AREAS.filter((a) => a.name.toLowerCase().includes(q))
      .slice(0, 8)
      .map((a) => a.name);
  }, [trimmedQuery]);

  useEffect(() => {
    const q = trimmedQuery;
    if (!q || q.length < 2 || /^\d+$/.test(q)) {
      setRemoteHits([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = window.setTimeout(() => {
      locationsApi
        .search(q)
        .then((hits) => {
          if (!cancelled) setRemoteHits(hits);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [trimmedQuery]);

  const nameMatches = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const n of [...remoteHits.map((h) => h.name), ...localMatches]) {
      const k = n.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(n);
      }
    }
    return out.slice(0, 8);
  }, [remoteHits, localMatches]);

  const closeCityModal = () => {
    setShowCityModal(false);
    setCityQuery('');
    setPinResult(null);
    setPinError(null);
  };

  const chooseCity = (city: string) => {
    onSelectCity(city);
    closeCityModal();
  };

  const handlePinLookup = async () => {
    if (!isPinQuery) return;
    setPinLoading(true);
    setPinError(null);
    try {
      const result = await lookupPincode(trimmedQuery);
      if (result && result.district) {
        setPinResult(result);
      } else {
        setPinError("Couldn't find that PIN code. Check the six digits and try again.");
      }
    } catch {
      setPinError('Lookup failed. Check your connection and try again.');
    } finally {
      setPinLoading(false);
    }
  };

  const handleUseGps = async () => {
    setGpsBusy(true);
    setPinError(null);
    try {
      const { city } = await detectUserCity();
      if (city) {
        chooseCity(city);
      } else {
        setPinError("Couldn't detect your location. Enter your PIN code above, or pick a city.");
      }
    } finally {
      setGpsBusy(false);
    }
  };

  const isLoggedIn = Boolean(userProfile?.isAuthenticated);

  return (
    <div className="db-safe-top shrink-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-3.5 pt-2.5 pb-3">
      {/* Brand Header */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        {/* DealBriz Logo */}
        <div className="flex items-center gap-2 min-w-0">
          <img
            src="/app-icon.png"
            alt="DealBriz"
            width={32}
            height={32}
            className="w-8 h-8 shrink-0 rounded-xl shadow-md shadow-blue-600/30 ring-1 ring-black/5"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-extrabold tracking-tight text-slate-900">DealBriz</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 uppercase tracking-wide">
                India
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium leading-none truncate">Buy &amp; Sell Near You</p>
          </div>
        </div>

        {/* Notifications + Auth - fixed width so nothing gets clipped */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onOpenNotifications}
            className="relative w-9 h-9 shrink-0 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-300 border border-slate-700/60 transition-colors flex items-center justify-center"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 bg-rose-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center shadow ring-2 ring-[#0A1628]">
                {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
              </span>
            )}
          </button>

          {isLoggedIn ? (
            <button
              onClick={onNavigateProfile}
              className="w-9 h-9 shrink-0 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-all active:scale-95 flex items-center justify-center overflow-hidden"
              title={`Signed in as ${userProfile?.name}`}
            >
              <img
                src={userProfile?.avatar?.trim() || initialsAvatar(userProfile?.name || 'User', 64)}
                alt={userProfile?.name || 'User'}
                className="w-full h-full rounded-full object-cover ring-1 ring-blue-500/50"
              />
            </button>
          ) : (
            <button
              onClick={() => onOpenAuth?.('login')}
              className="flex items-center gap-1 shrink-0 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white pl-2.5 pr-3 h-9 rounded-full text-xs font-bold shadow-sm shadow-blue-600/30 transition-all active:scale-95"
              title="Sign In / Register"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>

      {/* Android Search & Filter Bar */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowCityModal(true)}
          className="flex items-center gap-1 shrink-0 bg-slate-100 hover:bg-slate-200 border border-slate-300 px-2.5 h-9 rounded-xl text-xs font-medium text-slate-700 transition-all active:scale-95 max-w-[104px]"
          title="Change city"
        >
          <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span className="truncate">{selectedCity === 'All Cities' ? 'All' : selectedCity}</span>
        </button>

        <div className="flex-1 min-w-0 relative flex items-center">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search cars, phones, bikes..."
            className="w-full h-9 bg-white border border-slate-300 focus:border-blue-500 rounded-xl pl-9 pr-8 text-xs text-slate-900 placeholder:text-slate-500 focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 p-1 text-slate-500 hover:text-slate-900"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filters button */}
        <button
          onClick={onOpenFilters}
          className="w-9 h-9 bg-slate-100 hover:bg-slate-200 text-blue-600 rounded-xl border border-slate-300 transition-colors shrink-0 flex items-center justify-center"
          title="Filter and Sort"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* City picker.
          Portalled to document.body deliberately: this component's root has
          `backdrop-blur-md`, and a backdrop-filter makes an element the
          containing block for `position: fixed` descendants - so rendered in
          place, `fixed inset-0` resolved against the ~110px top bar, pushing
          the sheet's header and close button off-screen and dragging the whole
          panel whenever the top bar moved (as it does during a call). */}
      {showCityModal &&
        createPortal(
          <div
            className="fixed inset-0 z-[130] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
            onClick={closeCityModal}
          >
            <div
              className="w-full max-w-sm bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[85dvh] db-sheet-bottom"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-5 pb-3 shrink-0 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-blue-600" />
                  <h3 className="font-bold text-slate-900 text-base">Choose your area</h3>
                </div>
                <button
                  onClick={closeCityModal}
                  aria-label="Close"
                  className="p-1.5 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 active:scale-95"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-5 pt-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    value={cityQuery}
                    onChange={(e) => {
                      setCityQuery(e.target.value.slice(0, 40));
                      setPinResult(null);
                      setPinError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && isPinQuery) {
                        e.preventDefault();
                        handlePinLookup();
                      }
                    }}
                    placeholder="City name or PIN code"
                    className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none"
                  />
                </div>

                {isPinQuery && !pinResult && (
                  <button
                    onClick={handlePinLookup}
                    disabled={pinLoading}
                    className="mt-2 w-full py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold disabled:opacity-50 active:scale-95"
                  >
                    {pinLoading ? 'Checking…' : `Look up ${trimmedQuery}`}
                  </button>
                )}

                {pinError && <p className="text-[11px] text-rose-600 mt-2">{pinError}</p>}

                {pinResult && (
                  <button
                    onClick={() => chooseCity(pinResult.district)}
                    className="mt-2 w-full flex items-center justify-between gap-2 p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-slate-900 truncate">
                        {pinResult.district}
                      </span>
                      <span className="block text-[10px] text-slate-500 truncate">
                        {pinResult.name ? `${pinResult.name}, ` : ''}
                        {pinResult.state} · {pinResult.pincode}
                      </span>
                    </span>
                    <span className="text-[11px] font-bold text-blue-700 shrink-0">Use this</span>
                  </button>
                )}

                {nameMatches.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {nameMatches.map((city) => {
                      const isSelected = selectedCity === city;
                      return (
                        <button
                          key={city}
                          onClick={() => chooseCity(city)}
                          className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-medium border text-left transition-all ${
                            isSelected
                              ? 'bg-blue-50 border-blue-500 text-blue-700'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="truncate">{city}</span>
                          {isSelected && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {searching && nameMatches.length === 0 && (
                  <p className="text-[11px] text-slate-500 mt-2">Searching…</p>
                )}

                {trimmedQuery && !isPinQuery && !searching && nameMatches.length === 0 && (
                  <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                    Nothing matching “{trimmedQuery}”. Try a six-digit PIN code instead — that
                    works for any area in India.
                  </p>
                )}

                {!trimmedQuery && (
                  <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
                    Search by city name or enter a PIN code, or use your current location below.
                  </p>
                )}

                {selectedCity !== 'All Cities' && (
                  <button
                    onClick={() => chooseCity('All Cities')}
                    className="mt-4 w-full py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 active:scale-95"
                  >
                    Show all areas
                  </button>
                )}
              </div>

              <div className="shrink-0 p-5 pt-3 border-t border-slate-200">
                <button
                  onClick={handleUseGps}
                  disabled={gpsBusy}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold disabled:opacity-60 active:scale-95"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>{gpsBusy ? 'Detecting…' : 'Use current location'}</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

    </div>
  );
};
