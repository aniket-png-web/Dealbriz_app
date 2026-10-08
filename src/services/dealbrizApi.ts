// DealBriz API Client Service
// Implements both External Third-Party APIs and Internal Flask REST APIs
// as defined in the official DealBriz API Documentation.

import { Capacitor, CapacitorCookies } from '@capacitor/core';
import { EmiApplication, Listing } from '../types';
import { dealbrizStorage } from './dealbrizStorage';
import { initialsAvatar } from '../utils/imageUtils';

// Public origin of the live DealBriz site.
export const DEALBRIZ_ORIGIN = 'https://dealbriz.com';

/**
 * Resolves the correct API base for the environment we are running in.
 *
 * - Inside the compiled Android APK the web bundle is served from
 *   https://localhost, so a relative '/api' path would resolve to
 *   https://localhost/api and every request would fail. We must talk to
 *   the real origin instead.
 * - On dealbriz.com itself the API is same-origin.
 * - In the Vite dev server '/api' is proxied to dealbriz.com.
 */
function resolveApiBase(): string {
  try {
    if (Capacitor.isNativePlatform()) {
      return `${DEALBRIZ_ORIGIN}/api`;
    }
  } catch {
    // Capacitor not available (plain web build)
  }

  // Same-origin Express backend handles /api directly in dev and production
  return '/api';
}

export const API_BASE = resolveApiBase();
export const IS_CROSS_ORIGIN_API = API_BASE.startsWith('http');

/**
 * Turns a server-relative media path (e.g. "/uploads/abc.jpg") into an absolute
 * URL if in native APK, or relative URL in the web app.
 */
export function absoluteMediaUrl(url?: string | null): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^(https?:|data:|blob:)/i.test(trimmed)) return trimmed;
  try {
    if (Capacitor.isNativePlatform()) {
      return `${DEALBRIZ_ORIGIN}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
    }
  } catch {
    // web
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/** Absolute, shareable link to a listing on the public site. */
export function publicListingUrl(listingId?: string): string {
  return listingId ? `${DEALBRIZ_ORIGIN}/?product=${encodeURIComponent(listingId)}` : DEALBRIZ_ORIGIN;
}

/**
 * Reads the CSRF token that pairs with the JWT cookie.
 *
 * In the browser it sits in document.cookie. In the APK the web layer runs on
 * https://localhost while the session cookies belong to dealbriz.com and live
 * in Android's native cookie jar, so document.cookie is empty there and the
 * X-CSRF-TOKEN header never went out - every authenticated request came back
 * 401. CapacitorCookies can read the native jar for a specific origin.
 */
async function getCsrfToken(): Promise<string | null> {
  if (IS_CROSS_ORIGIN_API) {
    try {
      // config.py sets JWT_ACCESS_COOKIE_PATH = "/api", and Android's
      // CookieManager path-matches: asking for https://dealbriz.com (path /)
      // returns nothing for a cookie scoped to /api. The URL must carry the
      // path or the CSRF header goes out empty and every write 401s.
      const cookies = await CapacitorCookies.getCookies({ url: `${DEALBRIZ_ORIGIN}/api` });
      const token = (cookies as Record<string, string>)?.csrf_access_token;
      if (token) return decodeURIComponent(token);
    } catch {
      // fall through to document.cookie
    }
  }

  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)csrf_access_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** True once a refresh is in flight, so parallel 401s wait on one attempt. */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const headers = new Headers({ Accept: 'application/json' });
      // The refresh cookie carries its own CSRF token.
      let refreshCsrf: string | null = null;
      if (IS_CROSS_ORIGIN_API) {
        try {
          // JWT_REFRESH_COOKIE_PATH = "/api/auth" - same path-matching rule.
          const cookies = await CapacitorCookies.getCookies({
            url: `${DEALBRIZ_ORIGIN}/api/auth`,
          });
          refreshCsrf = (cookies as Record<string, string>)?.csrf_refresh_token || null;
        } catch {
          // ignore
        }
      }
      if (!refreshCsrf && typeof document !== 'undefined') {
        const m = document.cookie.match(/(?:^|;\s*)csrf_refresh_token=([^;]*)/);
        refreshCsrf = m ? decodeURIComponent(m[1]) : null;
      }
      if (refreshCsrf) headers.set('X-CSRF-TOKEN', refreshCsrf);

      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers,
        credentials: IS_CROSS_ORIGIN_API ? 'include' : 'same-origin',
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      // Clear on the next tick so callers awaiting this promise still see it.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();

  return refreshInFlight;
}

/** Called when the session is gone for good, so the UI can stop pretending. */
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(fn: () => void): void {
  onSessionExpired = fn;
}

async function rawApiFetch(endpoint: string, options: RequestInit): Promise<Response> {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const csrf = await getCsrfToken();
  if (csrf) {
    headers.set('X-CSRF-TOKEN', csrf);
  }

  const targetUrl = endpoint.startsWith('http')
    ? endpoint
    : `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  return fetch(targetUrl, {
    ...options,
    headers,
    // The APK runs on https://localhost, so session cookies for
    // dealbriz.com are cross-origin and must be sent explicitly.
    credentials: IS_CROSS_ORIGIN_API ? 'include' : 'same-origin',
  });
}

// Universal API fetch wrapper with cookie credentials, CSRF header and one
// transparent token refresh on 401.
async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await rawApiFetch(endpoint, options);
  } catch (networkErr: any) {
    const err = new Error(networkErr?.message || 'Network request failed');
    (err as any).status = 0;
    (err as any).isOffline = true;
    throw err;
  }

  // The access token is short-lived (30 min). Refresh once and retry rather
  // than leaving the user apparently signed in but unable to do anything.
  // A 401 on login/signup means "wrong credentials" and on the refresh route
  // means "the refresh cookie is gone" - retrying those is pointless and would
  // loop. Everything else under /auth/, notably /auth/me, is an ordinary
  // expired-access-token 401 and should spend the refresh cookie.
  const NO_REFRESH_ENDPOINTS = ['/auth/login', '/auth/signup', '/auth/refresh'];
  const skipRefresh = NO_REFRESH_ENDPOINTS.some((e) => endpoint.startsWith(e));
  if (res.status === 401 && !skipRefresh) {
    const refreshed = await refreshSession();
    if (refreshed) {
      try {
        res = await rawApiFetch(endpoint, options);
      } catch (retryErr: any) {
        const err = new Error(retryErr?.message || 'Network request failed');
        (err as any).status = 0;
        (err as any).isOffline = true;
        throw err;
      }
    } else {
      onSessionExpired?.();
    }
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    let parsed: any = null;
    try {
      parsed = JSON.parse(errorText);
    } catch {
      // ignore
    }
    const err = new Error(parsed?.message || parsed?.error || `HTTP ${res.status}: ${res.statusText}`);
    (err as any).status = res.status;
    (err as any).data = parsed;
    throw err;
  }

  return res.json() as Promise<T>;
}

// -------------------------------------------------------------
// 1. EXTERNAL THIRD-PARTY APIS
// -------------------------------------------------------------

export interface LocationHit {
  name: string;
  district?: string;
  state?: string;
  pincode?: string;
  lat?: number;
  lon?: number;
}

export interface PincodeLookupResult {
  pincode: string;
  district: string;
  state: string;
  name: string;
}

/**
 * Resolves a 6-digit PIN code to its post office, district and state.
 *
 * Asks DealBriz's own server first (GET /api/locations/search, backed by the
 * pincodes table - the same data the server uses to name a listing's
 * location). The public India Post API is only a fallback: it is often slow
 * or down, and when it failed the Sell form kept its default location.
 */
export async function lookupPincode(pincode: string): Promise<PincodeLookupResult | null> {
  const cleanPin = pincode.replace(/\D/g, '');
  if (cleanPin.length !== 6) return null;

  try {
    const res = await apiFetch<{ results?: any[] }>(
      `/locations/search?q=${encodeURIComponent(cleanPin)}&limit=25`
    );
    const rows = (res?.results || []).filter((r) => String(r.pincode) === cleanPin);
    if (rows.length) {
      const row = rows.find((r) => r.is_major) || rows[0];
      return {
        pincode: cleanPin,
        district: row.district || '',
        state: row.state || '',
        name: row.office_name || '',
      };
    }
  } catch {
    // fall through to India Post
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`https://api.postalpincode.in/pincode/${cleanPin}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data[0]?.Status === 'Success' && Array.isArray(data[0]?.PostOffice) && data[0].PostOffice.length > 0) {
      const po = data[0].PostOffice[0];
      return { pincode: cleanPin, district: po.District || '', state: po.State || '', name: po.Name || '' };
    }
  } catch {
    // unreachable
  }
  return null;
}

/**
 * 2.3 Browser Geolocation API & DealBriz Area Matching
 * Computes Haversine distance in km to pick the nearest served city
 */
export interface SupportedArea {
  name: string;
  lat: number;
  lon: number;
}

export const DB_AREAS: SupportedArea[] = [
  // Every city offered in the picker needs coordinates here, or location
  // detection can never resolve to it. Mandi, Rupnagar and Sikar were in the
  // picker but missing from this list, so a user in Mandi was matched to the
  // nearest listed city instead - Chandigarh, 120 km away.
  { name: 'Mandi (HP)', lat: 31.708, lon: 76.9318 },
  { name: 'Rupnagar (PB)', lat: 30.9661, lon: 76.527 },
  { name: 'Sikar (RJ)', lat: 27.6094, lon: 75.1399 },
  { name: 'Chandigarh', lat: 30.7333, lon: 76.7794 },
  { name: 'Mohali', lat: 30.7046, lon: 76.7179 },
  { name: 'Panchkula', lat: 30.6942, lon: 76.8606 },
  { name: 'Zirakpur', lat: 30.6425, lon: 76.8173 },
  { name: 'Kharar', lat: 30.7441, lon: 76.6433 },
  { name: 'Ludhiana', lat: 30.901, lon: 75.8573 },
  { name: 'Amritsar', lat: 31.634, lon: 74.8723 },
  { name: 'Shimla (HP)', lat: 31.1048, lon: 77.1734 },
  { name: 'Kullu (HP)', lat: 31.9578, lon: 77.1092 },
  { name: 'Bilaspur (HP)', lat: 31.3304, lon: 76.7554 },
  { name: 'Hamirpur (HP)', lat: 31.6861, lon: 76.5213 },
  { name: 'Solan (HP)', lat: 30.9045, lon: 77.0967 },
  { name: 'Una (HP)', lat: 31.4685, lon: 76.2708 },
  { name: 'Dharamshala (HP)', lat: 32.219, lon: 76.3234 },
  { name: 'Delhi NCR', lat: 28.6139, lon: 77.209 },
  { name: 'Jaipur', lat: 26.9124, lon: 75.7873 },
];

/**
 * Strips our display suffix so a picked city compares against real data.
 * The picker offers "Mandi (HP)" while the backend stores
 * "Mandi, Himachal Pradesh" - a plain substring test never matched.
 */
export function bareCityName(city: string): string {
  return city
    .replace(/\s*\([^)]*\)\s*/g, '')
    .replace(/,.*$/, '')
    .trim()
    .toLowerCase();
}

/** True when a listing sits in the selected city / district. */
export function listingMatchesCity(
  selectedCity: string,
  listing: { city?: string; location?: string; pincode?: string }
): boolean {
  if (!selectedCity || selectedCity === 'All Cities') return true;

  const target = bareCityName(selectedCity);
  if (!target) return true;

  const haystacks = [listing.city, listing.location, listing.pincode]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase());

  return haystacks.some((h) => bareCityName(h) === target || h.includes(target));
}

/** Matches a place name from reverse geocoding to one of DB_AREAS. */
function matchKnownArea(...names: (string | undefined | null)[]): string | null {
  const candidates = names
    .filter(Boolean)
    .map((n) => String(n).toLowerCase().trim());

  for (const area of DB_AREAS) {
    // "Mandi (HP)" should match a geocoder answer of "Mandi".
    const bare = area.name.replace(/\s*\([^)]*\)\s*/g, '').toLowerCase().trim();
    if (candidates.some((c) => c === bare || c.includes(bare) || bare.includes(c))) {
      return area.name;
    }
  }
  return null;
}

/**
 * Asks a free reverse geocoder what place these coordinates are in.
 * Returns null on any failure - the caller falls back to nearest-area.
 */
async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(
      `https://api-bdc.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const district =
      data?.localityInfo?.administrative?.find((a: any) => /district/i.test(a?.description || ''))
        ?.name ||
      data?.city ||
      data?.locality ||
      '';

    // Prefer our own label when we have one, otherwise use the real district
    // name as-is so this works anywhere in India, not just the listed areas.
    return matchKnownArea(district, data?.city, data?.locality) || district || null;
  } catch {
    return null;
  }
}

export function dbHaversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Works out which supported city the user is in.
 *
 * Order: the device's own coordinates, then a reverse-geocode of those
 * coordinates so the real place name wins, then the nearest listed area.
 *
 * There is no Chandigarh fallback any more. It used to return 'Chandigarh'
 * when geolocation was unavailable, when it was denied, and again whenever the
 * nearest area was over 150 km away - so a user in Mandi, 120 km from the
 * nearest listed city, was always told they were in Chandigarh. An empty
 * string now means "couldn't tell", and the caller shows All Cities.
 */
export async function detectUserCity(): Promise<{
  city: string;
  coords?: { lat: number; lon: number };
}> {
  if (!navigator.geolocation) return { city: '' };

  const position = await new Promise<GeolocationPosition | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { timeout: 10000, enableHighAccuracy: true, maximumAge: 60000 }
    );
  });

  if (!position) return { city: '' };

  const { latitude, longitude } = position.coords;
  const coords = { lat: latitude, lon: longitude };

  // The geocoder knows the actual district; trust it over proximity. Any
  // Indian district is accepted - matchKnownArea() only tidies the label for
  // the handful we list explicitly (so "Mandi" reads as "Mandi (HP)").
  const geocoded = await reverseGeocode(latitude, longitude);
  if (geocoded) return { city: geocoded, coords };

  let nearestCity = '';
  let minDistance = Infinity;
  for (const area of DB_AREAS) {
    const dist = dbHaversineKm(latitude, longitude, area.lat, area.lon);
    if (dist < minDistance) {
      minDistance = dist;
      nearestCity = area.name;
    }
  }

  // Far from everything we cover: say so rather than guessing a city.
  if (minDistance > 60) return { city: '', coords };

  return { city: nearestCity, coords };
}

// -------------------------------------------------------------
// 2. INTERNAL FLASK REST APIS
// -------------------------------------------------------------

// 3.1 Auth API
export interface AuthUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  city: string;
  avatar_url?: string | null;
  is_admin: boolean;
  account_status: string;
  created_at: string;
  /** Profile "show my mobile number" setting. null = never set. */
  show_phone?: boolean | null;
}

interface StoredAccount extends AuthUser {
  password?: string;
}

const ACCOUNTS_KEY = 'dealbriz_registered_accounts_v3';

/**
 * Locally-registered accounts.
 *
 * NOTE: this is only an offline convenience so a signup done without a network
 * connection is not silently lost. Real authentication always happens against
 * /api/auth on the server. No credentials are shipped inside the app.
 */
export function getStoredAccounts(): StoredAccount[] {
  try {
    // Drop older registries that shipped seeded demo credentials.
    localStorage.removeItem('dealbriz_registered_accounts_v1');
    localStorage.removeItem('dealbriz_registered_accounts_v2');
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list;
    }
  } catch {
    // ignore
  }
  return [];
}

function saveStoredAccounts(accounts: StoredAccount[]): void {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    // ignore
  }
}

export const authApi = {
  async signup(data: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    phone: string;
    city: string;
  }): Promise<AuthUser> {
    const cleanEmail = data.email.trim().toLowerCase();
    const accounts = getStoredAccounts();

    // Check if email already registered locally
    const existing = accounts.find((a) => a.email.toLowerCase() === cleanEmail);
    if (existing) {
      throw new Error(`An account with email "${cleanEmail}" is already registered. Please Sign In.`);
    }

    try {
      const res = await apiFetch<any>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          email: cleanEmail,
        }),
      });
      const user: AuthUser = res?.user || res;
      if (user && user.email) {
        const storedUser: StoredAccount = {
          ...user,
          password: data.password,
        };
        accounts.push(storedUser);
        saveStoredAccounts(accounts);
        localStorage.setItem('dealbriz_active_user', JSON.stringify(user));
        return user;
      }
    } catch (apiErr: any) {
      const msg = apiErr?.data?.error || apiErr?.data?.message || apiErr?.message;
      if (apiErr?.status === 409 || msg?.toLowerCase().includes('already registered')) {
        throw new Error(`Email "${cleanEmail}" is already registered. Please Sign In.`);
      }
      if (apiErr?.status === 400 && msg) {
        throw new Error(msg);
      }
      // Local fallback for offline/demo environments
    }

    const newUser: StoredAccount = {
      id: `usr-${Date.now()}`,
      email: cleanEmail,
      password: data.password,
      first_name: data.first_name.trim(),
      last_name: data.last_name.trim(),
      phone: data.phone.trim(),
      city: data.city.trim(),
      avatar_url: initialsAvatar(`${data.first_name} ${data.last_name}`),
      is_admin: false,
      account_status: 'active',
      created_at: new Date().toISOString(),
    };

    accounts.push(newUser);
    saveStoredAccounts(accounts);
    try {
      localStorage.setItem('dealbriz_active_user', JSON.stringify(newUser));
    } catch {
      // ignore
    }

    return newUser;
  },

  async login(email: string, password: string): Promise<AuthUser> {
    const cleanEmail = email.trim().toLowerCase();

    try {
      const res = await apiFetch<any>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: cleanEmail, password }),
      });
      const user: AuthUser = res?.user || res;
      if (user && user.email) {
        localStorage.setItem('dealbriz_active_user', JSON.stringify(user));
        return user;
      }
      throw new Error('Unable to authenticate. Please try again.');
    } catch (backendErr: any) {
      const status = backendErr?.status;

      // The server answered and rejected the credentials - surface that,
      // never fall back to a local match (that would be a real auth bypass).
      if (status === 401) {
        throw new Error('Incorrect email or password. Please try again.');
      }
      if (status === 403) {
        throw new Error('This account is suspended. Please contact DealBriz support.');
      }
      if (status && status !== 0) {
        throw new Error(backendErr?.data?.error || backendErr?.message || 'Sign in failed. Please try again.');
      }

      // status 0 => we never reached the server. Allow an offline sign-in only
      // for an account that was created on this device.
      const matched = getStoredAccounts().find((a) => a.email.toLowerCase() === cleanEmail);
      if (matched && matched.password && matched.password === password) {
        localStorage.setItem('dealbriz_active_user', JSON.stringify(matched));
        return matched;
      }

      throw new Error("Can't reach DealBriz right now. Check your internet connection and try again.");
    }
  },

  /**
   * Called once on launch. Tries the live session, then the 30-day refresh
   * cookie, and only gives up after both fail.
   *
   * Returns null when the user really is signed out, having cleared the cached
   * account. getMe() used to fall back to that cache, so the app believed you
   * were signed in with a dead session and every request 401'd.
   */
  async restoreSession(): Promise<AuthUser | null> {
    const fetchMe = async (): Promise<AuthUser | null> => {
      try {
        const res = await apiFetch<any>('/auth/me');
        const user: AuthUser = res?.user || res;
        if (user && user.email) {
          localStorage.setItem('dealbriz_active_user', JSON.stringify(user));
          return user;
        }
        return null;
      } catch (err: any) {
        if (err?.status === 0) throw err; // offline - keep the cached account
        return null;
      }
    };

    try {
      const direct = await fetchMe();
      if (direct) return direct;
    } catch {
      // Offline: trust the cache rather than signing the user out on a
      // flaky connection.
      const cached = localStorage.getItem('dealbriz_active_user');
      return cached ? JSON.parse(cached) : null;
    }

    // Access token gone or expired - spend the refresh cookie.
    const refreshed = await refreshSession();
    if (refreshed) {
      try {
        const afterRefresh = await fetchMe();
        if (afterRefresh) return afterRefresh;
      } catch {
        // fall through
      }
    }

    try {
      localStorage.removeItem('dealbriz_active_user');
    } catch {
      // ignore
    }
    return null;
  },

  async getMe(): Promise<AuthUser | null> {
    try {
      const res = await apiFetch<any>('/auth/me');
      const user: AuthUser = res?.user || res;
      if (user && user.email) {
        localStorage.setItem('dealbriz_active_user', JSON.stringify(user));
        return user;
      }
    } catch {
      // ignore
    }
    const stored = localStorage.getItem('dealbriz_active_user');
    return stored ? JSON.parse(stored) : null;
  },

  async logout(): Promise<void> {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    localStorage.removeItem('dealbriz_active_user');
  },
};

// 3.2 Buy API
export const buyApi = {
  async getProducts(params?: { category?: string; city?: string; limit?: number; offset?: number }): Promise<Listing[]> {
    try {
      const query = new URLSearchParams();
      if (params?.category && params.category !== 'all') query.set('category', params.category);
      if (params?.city && params.city !== 'All Cities') query.set('city', params.city);
      if (params?.limit) query.set('limit', String(params.limit));

      const res = await apiFetch<any>(`/buy?${query.toString()}`);
      const list = Array.isArray(res) ? res : res.products || res.items || [];
      if (list.length > 0) {
        return list.map(mapDealBrizProductToListing);
      }
    } catch {
      // Fallback to local data
    }
    return dealbrizStorage.getListings();
  },

  /** GET /api/buy/<id> - one listing as it is right now. Throws on failure. */
  async getListing(id: string): Promise<Listing> {
    const res = await apiFetch<any>(`/buy/${encodeURIComponent(id)}`);
    return mapDealBrizProductToListing(res);
  },

  async search(keyword: string): Promise<Listing[]> {
    try {
      const res = await apiFetch<any>(`/buy/search?q=${encodeURIComponent(keyword)}`);
      const list = Array.isArray(res) ? res : res.products || res.results || [];
      if (list.length > 0) {
        return list.map(mapDealBrizProductToListing);
      }
    } catch {
      // ignore
    }
    return [];
  },

  async smartSearch(naturalLanguageQuery: string): Promise<Listing[]> {
    try {
      const res = await apiFetch<any>(`/buy/smart-search?q=${encodeURIComponent(naturalLanguageQuery)}`);
      const list = Array.isArray(res) ? res : res.products || [];
      if (list.length > 0) {
        return list.map(mapDealBrizProductToListing);
      }
    } catch {
      // ignore
    }
    return [];
  },

  async getSuggestions(query: string): Promise<string[]> {
    try {
      const res = await apiFetch<string[]>(`/buy/suggest?q=${encodeURIComponent(query)}`);
      if (Array.isArray(res)) return res;
    } catch {
      // ignore
    }
    return [];
  },

  async trackView(productId: string): Promise<void> {
    try {
      await apiFetch(`/buy/${productId}/view`, { method: 'POST' });
    } catch {
      // ignore
    }
  },
};

// 3.3 Sell API
/**
 * Maps a client Listing onto the exact field names the Flask API accepts.
 *
 * Two things the backend expects that aren't obvious:
 *  - `city` carries the PINCODE, not a city name. create_product() calls
 *    resolve_place_from_pincode(data["city"]) to derive "District, State".
 *  - image paths are stored relative to the API origin, so absolute URLs
 *    must be stripped back down before sending.
 */
function toRelativeMediaPath(url?: string | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith(`${DEALBRIZ_ORIGIN}/`)) {
    return trimmed.slice(DEALBRIZ_ORIGIN.length);
  }
  return trimmed;
}

function toApiPayload(listing: Partial<Listing>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (value !== undefined) payload[key] = value;
  };

  set('title', listing.title);
  set('category', listing.category);
  set('condition', listing.condition);
  set('price', listing.price);
  set('original_price', listing.original_price ?? undefined);
  set('negotiable', listing.negotiable);
  set('emi_eligible', listing.emi_eligible);
  set('description', listing.description);
  set('location', listing.location);
  set('landmark', listing.landmark);
  set('status', listing.status);

  // The API's "city" field is the 6-digit pincode.
  const pin = (listing.pincode || '').trim();
  if (pin) set('city', pin);

  set('brand', listing.attributes?.brand);
  set('model', listing.attributes?.model);

  if (listing.image_url !== undefined) {
    set('image_url', toRelativeMediaPath(listing.image_url));
  }
  if (Array.isArray(listing.extra_images)) {
    set(
      'extra_images',
      listing.extra_images.map((u) => toRelativeMediaPath(u)).filter(Boolean)
    );
  }

  if (listing.attributes) {
    // save_product_attributes() drops any key not defined for the category,
    // so sending the whole set is safe.
    const { brand: _b, model: _m, ...rest } = listing.attributes;
    const attrs: Record<string, string> = {};
    Object.entries(rest).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim()) attrs[k] = String(v);
    });
    set('attributes', attrs);
  }

  return payload;
}

export const sellApi = {
  async getCategoryAttributes(category: string): Promise<any> {
    try {
      return await apiFetch(`/sell/attributes/${category}`);
    } catch {
      return { attributes: [] };
    }
  },

  /**
   * Uploads one photo and returns its absolute URL.
   *
   * This used to swallow failures and hand back a base64 data URL, which then
   * got posted as the listing's image_url - so the ad went up with an image
   * that existed nowhere on the server and showed as broken.
   */
  async uploadImage(file: File | Blob): Promise<string> {
    const form = new FormData();
    // sell/routes.py: `if "file" not in request.files` - the field must be
    // named "file". We were sending "image", so the server answered
    // {"error": "No file uploaded"} on every upload.
    form.append('file', file);
    const res = await apiFetch<{ url?: string; image_url?: string; path?: string }>(
      '/sell/upload-image',
      { method: 'POST', body: form }
    );
    const url = absoluteMediaUrl(res?.url || res?.image_url || res?.path);
    if (!url) throw new Error('Upload did not return an image URL.');
    return url;
  },

  /**
   * Creates the listing on the server. This used to swallow every failure and
   * write the ad to localStorage instead, so a post that never reached
   * dealbriz.com still appeared under "My Ads" - which is why ads posted in
   * the app were invisible on the website.
   */
  async createListing(listingData: Partial<Listing>): Promise<Listing> {
    const res = await apiFetch<any>('/sell', {
      method: 'POST',
      body: JSON.stringify(toApiPayload(listingData)),
    });
    return mapDealBrizProductToListing(res);
  },

  /** Section 3.4: edits go to /api/my-listings/<pid>, not /api/sell/<id>. */
  async updateListing(id: string, listingData: Partial<Listing>): Promise<Listing> {
    const res = await apiFetch<any>(`/my-listings/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(toApiPayload(listingData)),
    });
    return mapDealBrizProductToListing(res);
  },

  async setSoldStatus(id: string, sold: boolean, buyerEmail = ''): Promise<void> {
    await apiFetch(`/my-listings/${encodeURIComponent(id)}/${sold ? 'sell' : 'unsell'}`, {
      method: 'POST',
      body: JSON.stringify(sold ? { buyer_email: buyerEmail } : {}),
    });
  },

  /**
   * There is no DELETE route for a listing - mylistings/routes.py keeps the
   * row so messages, purchases and EMI applications aren't orphaned, and the
   * website deletes by setting status='removed' through the edit endpoint.
   * DELETE /my-listings/<id> was answering 405.
   */
  async deleteListing(id: string): Promise<void> {
    await apiFetch(`/my-listings/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'removed' }),
    });
  },

  /** The caller's own ads, straight from the server. */
  async getMyListings(): Promise<Listing[]> {
    const rows = await apiFetch<any>('/my-listings');
    const items = Array.isArray(rows) ? rows : rows?.items || rows?.products || [];
    return (items as any[]).map(mapDealBrizProductToListing);
  },
};

// 3.5 Profile API - GET/PUT /api/profile
export const profileApi = {
  /**
   * Registers this device's OneSignal subscription id against the signed-in
   * user, so the server can target them when a message arrives.
   *
   * The AI Studio integration wrote this to Firestore, which DealBriz doesn't
   * use - the real user table is MySQL behind Flask, so it has to come here.
   */
  async registerPushDevice(playerId: string): Promise<void> {
    if (!playerId) return;
    await apiFetch('/profile/push-device', {
      method: 'POST',
      body: JSON.stringify({ player_id: playerId, platform: 'android' }),
    });
  },

  /** Called on logout so a shared device stops receiving the old user's pushes. */
  async unregisterPushDevice(playerId: string): Promise<void> {
    if (!playerId) return;
    await apiFetch('/profile/push-device', {
      method: 'DELETE',
      body: JSON.stringify({ player_id: playerId }),
    });
  },

  /** POST /api/profile/avatar - multipart, same "file" field as listing photos. */
  async uploadAvatar(file: File | Blob): Promise<string> {
    const form = new FormData();
    form.append('file', file);
    const res = await apiFetch<{ url?: string; avatar_url?: string; path?: string }>(
      '/profile/avatar',
      { method: 'POST', body: form }
    );
    const url = absoluteMediaUrl(res?.url || res?.avatar_url || res?.path);
    if (!url) throw new Error('Upload did not return an image URL.');
    return url;
  },
  async getProfile(): Promise<any | null> {
    try {
      return await apiFetch<any>('/profile');
    } catch {
      return null;
    }
  },

  async updateProfile(fields: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    city?: string;
    /** Sent so the website and app agree once the column exists server-side. */
    show_phone?: boolean;
  }): Promise<any> {
    const res = await apiFetch<any>('/profile', {
      method: 'PUT',
      body: JSON.stringify(fields),
    });
    const user = res?.user || res;

    // Keep the locally cached account in step so the UI reflects the change
    // immediately rather than after the next sign-in.
    try {
      const raw = localStorage.getItem('dealbriz_active_user');
      if (raw && user) {
        const merged = { ...JSON.parse(raw), ...user };
        localStorage.setItem('dealbriz_active_user', JSON.stringify(merged));
      }
    } catch {
      // ignore
    }
    return user;
  },
};

/**
 * Saved items on the account - the same list the website shows.
 * GET /api/saved returns full listings; POST/DELETE /api/saved/<id>.
 * These throw on failure. They used to fall back to a list kept only on the
 * phone, which is why saves made in the app never appeared on the website.
 */
export const savedApi = {
  async getSaved(): Promise<Listing[]> {
    const res = await apiFetch<any>('/saved');
    const rows = Array.isArray(res) ? res : [];
    return rows.map(mapDealBrizProductToListing);
  },

  async save(productId: string): Promise<void> {
    await apiFetch(`/saved/${encodeURIComponent(productId)}`, { method: 'POST' });
  },

  async unsave(productId: string): Promise<void> {
    await apiFetch(`/saved/${encodeURIComponent(productId)}`, { method: 'DELETE' });
  },
};

// 3.8 EMI API
/** Same fields the website sends (frontend/app.js submitEMI). */
export interface EmiSubmitPayload {
  product_id?: string | null;
  product_title_snapshot: string;
  product_image_snapshot?: string | null;
  product_price_snapshot: number;
  down_payment: number;
  tenure_months: number;
  interest_rate: number;
  loan_amount: number;
  monthly_emi: number;
  total_payable: number;
  applicant_name: string;
  applicant_phone: string;
  applicant_income?: number | null;
  /** Where the applicant lives; the server checks EMI coverage against it. */
  pincode?: string;
}

/** Labels match the website's EMI_STATUS_LABELS. */
export const EMI_STATUS_LABELS: Record<string, string> = {
  pending: 'Under review',
  review: 'Docs needed',
  approved: 'Approved',
  rejected: 'Rejected',
  disbursed: 'Disbursed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function mapServerEmi(a: any): EmiApplication {
  return {
    id: String(a.id),
    listingId: a.product_id ? String(a.product_id) : '',
    listingTitle: a.product_title_snapshot || 'EMI application',
    listingPrice: Number(a.product_price_snapshot) || 0,
    listingImage: absoluteMediaUrl(a.product_image_snapshot) || '',
    downPayment: Number(a.down_payment) || 0,
    loanAmount: Number(a.loan_amount) || 0,
    tenureMonths: Number(a.tenure_months) || 0,
    monthlyEmi: Number(a.monthly_emi) || 0,
    interestRate: Number(a.interest_rate) || 0,
    applicantName: a.applicant_name || '',
    applicantPhone: a.applicant_phone || '',
    monthlyIncome: a.applicant_income ?? null,
    status: a.status || 'pending',
    appliedAt: a.applied_at || '',
  };
}

export const emiApi = {
  /**
   * Throws on failure. This used to swallow every error and return a made-up
   * "review" record, so the app showed "Application submitted" for
   * applications the server had rejected or never received.
   */
  async submitApplication(payload: EmiSubmitPayload): Promise<EmiApplication> {
    const res = await apiFetch<any>('/emi', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return mapServerEmi(res);
  },

  /** The signed-in user's applications, from the server only. */
  async getMyApplications(): Promise<EmiApplication[]> {
    const res = await apiFetch<any[]>('/emi/mine');
    return (Array.isArray(res) ? res : []).filter((a) => !a.is_archived).map(mapServerEmi);
  },
};

// 3.9 Notifications API
export interface NotificationsSummary {
  notifications: number;
  chats: number;
}

export const notificationsApi = {
  /** null when it couldn't be fetched (it used to invent 1 notification). */
  async getSummary(): Promise<NotificationsSummary | null> {
    try {
      return await apiFetch<NotificationsSummary>('/notifications/summary');
    } catch {
      return null;
    }
  },

  async getList(): Promise<any[]> {
    try {
      const res = await apiFetch<any[]>('/notifications');
      if (Array.isArray(res)) return res;
    } catch {
      // ignore
    }
    return [];
  },

  async markRead(id?: string): Promise<void> {
    try {
      await apiFetch('/notifications/read', {
        method: 'POST',
        body: JSON.stringify(id ? { id } : {}),
      });
    } catch {
      // ignore
    }
  },
};

// 3.10 Reports API
export interface ReportReason {
  label: string;
  value: string;
}

export const reportsApi = {
  /** Same list the server validates against (reports/routes.py REPORT_REASONS). */
  async getReasons(): Promise<ReportReason[]> {
    try {
      const res = await apiFetch<ReportReason[]>('/reports/reasons');
      if (Array.isArray(res) && res.length) return res;
    } catch {
      // fallback below
    }
    return [
      { label: 'Fraud or scam', value: 'fraud_scam' },
      { label: 'Fake or misleading listing', value: 'fake_listing' },
      { label: 'Counterfeit goods', value: 'counterfeit' },
      { label: 'Harassment or abusive behaviour', value: 'harassment' },
      { label: 'Prohibited item', value: 'prohibited_item' },
      { label: 'Payment problem', value: 'payment_issue' },
      { label: 'Other', value: 'other' },
    ];
  },

  /** Same list as the server's PROBLEM_REASONS. */
  async getProblemReasons(): Promise<ReportReason[]> {
    try {
      const res = await apiFetch<ReportReason[]>('/reports/problem-reasons');
      if (Array.isArray(res) && res.length) return res;
    } catch {
      // fallback below
    }
    return [
      { label: 'Something is broken', value: 'bug' },
      { label: 'Problem with a listing', value: 'listing_issue' },
      { label: 'Payment or EMI problem', value: 'payment_issue' },
      { label: 'Account or login problem', value: 'account_issue' },
      { label: 'Abuse or unsafe behaviour', value: 'abuse' },
      { label: 'Feedback or suggestion', value: 'feedback' },
      { label: 'Something else', value: 'other' },
    ];
  },

  /**
   * POST /api/reports - reports a seller, optionally about one listing.
   * Throws on failure; this used to swallow errors so the app said "Report
   * Submitted" for every report the server rejected.
   */
  async submitReport(payload: {
    reported_user_id: string;
    product_id?: string;
    reason: string;
    details?: string;
  }): Promise<void> {
    await apiFetch('/reports', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * POST /api/reports/problem. Signed-in users needn't send an email - the
   * server uses the account's. Throws on failure.
   */
  async submitProblem(payload: {
    reason: string;
    details: string;
    contact_email?: string;
  }): Promise<void> {
    await apiFetch('/reports/problem', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

// 3.11 Chat API (Messaging between Buyer and Seller as per DealBriz platform)
export interface DealBrizChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  product_id: string;
  body: string;
  is_read?: boolean;
  created_at: string;
}

export interface DealBrizConversationRow {
  product_id: string;
  product_title: string;
  other_user_id: string;
  other_user_name: string;
  other_user_avatar?: string;
  body: string;
  created_at: string;
  is_read: boolean;
  sender_id: string;
  receiver_id: string;
  /** Only present when that user chose to show their number. */
  other_user_phone?: string | null;
}

export interface UserPartyProfile {
  id: string;
  first_name: string;
  last_name?: string;
  name?: string;
  city?: string;
  avatar_url?: string;
  created_at?: string;
}

export const chatApi = {
  async getMyConversations(): Promise<DealBrizConversationRow[]> {
    try {
      const rows = await apiFetch<any[]>('/chat/conversations');
      return rows || [];
    } catch {
      return [];
    }
  },

  async getConversationMessages(productId: string, otherUserId: string): Promise<DealBrizChatMessage[]> {
    try {
      return await apiFetch<DealBrizChatMessage[]>(
        `/chat/conversation?product_id=${encodeURIComponent(productId)}&other_id=${encodeURIComponent(otherUserId)}`
      );
    } catch {
      return [];
    }
  },

  async sendMessage(payload: { productId: string; receiverId: string; body: string }): Promise<any> {
    return await apiFetch('/chat/messages', {
      method: 'POST',
      body: JSON.stringify({
        product_id: payload.productId,
        receiver_id: payload.receiverId,
        body: payload.body,
      }),
    });
  },

  async markMessagesRead(productId: string, otherUserId: string): Promise<any> {
    try {
      return await apiFetch('/chat/mark-read', {
        method: 'POST',
        body: JSON.stringify({
          product_id: productId,
          other_id: otherUserId,
        }),
      });
    } catch {
      return null;
    }
  },

  async getUserProfileById(userId: string): Promise<UserPartyProfile | null> {
    try {
      return await apiFetch<UserPartyProfile>(`/users/${encodeURIComponent(userId)}`);
    } catch {
      return null;
    }
  },
};

// 3.12 FAQs API
export interface FaqItem {
  id: string | number;
  question: string;
  answer: string;
  category?: string;
}

export const faqsApi = {
  async getFaqs(): Promise<{ categories?: any[]; faqs?: FaqItem[] }> {
    try {
      const res = await apiFetch<any>('/faqs');
      return res;
    } catch {
      return {
        categories: [
          { code: 'buying', label: 'Buying' },
          { code: 'selling', label: 'Selling' },
          { code: 'emi', label: 'DealBriz EMI' },
          { code: 'safety', label: 'Safety & Trust' },
        ],
        faqs: [
          {
            id: 'faq-1',
            category: 'buying',
            question: 'How do I buy a product on DealBriz?',
            answer: 'Browse listings in your city, open any item, and click "Chat with Seller" or "Make Offer" to connect directly and schedule a safe inspection.',
          },
          {
            id: 'faq-2',
            category: 'emi',
            question: 'What is DealBriz EMI financing?',
            answer: 'DealBriz partners with leading financial institutions to let you purchase eligible cars, phones, and electronics in flexible 3-24 month installments with low interest rates.',
          },
          {
            id: 'faq-3',
            category: 'selling',
            question: 'Is posting an ad free?',
            answer: 'Yes! Posting classifieds on DealBriz is completely free with instant visibility across local buyers.',
          },
          {
            id: 'faq-4',
            category: 'safety',
            question: 'How do I trade safely?',
            answer: 'Always meet sellers in public places during daylight, thoroughly inspect goods before paying, and never transfer money or share OTPs in advance.',
          },
        ],
      };
    }
  },
};

// 3.14 Settings API
export const settingsApi = {
  async getSettings(): Promise<{ emi_enabled: boolean; [k: string]: any }> {
    try {
      return await apiFetch('/settings');
    } catch {
      return { emi_enabled: true };
    }
  },
};

// 3.15 Locations API
export const locationsApi = {
  /**
   * City/area search-as-you-type, backed by DealBriz's own Pincode table - the
   * same source the website's city picker uses. The API doc lists the route but
   * not its payload, so the response is normalised defensively.
   */
  async search(query: string): Promise<LocationHit[]> {
    const q = query.trim();
    if (!q) return [];
    try {
      const raw = await apiFetch<any>(`/locations/search?q=${encodeURIComponent(q)}`);
      const rows: any[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.results)
          ? raw.results
          : Array.isArray(raw?.locations)
            ? raw.locations
            : Array.isArray(raw?.data)
              ? raw.data
              : [];
      return rows
        .map((r): LocationHit | null => {
          if (typeof r === 'string') return { name: r };
          if (!r || typeof r !== 'object') return null;
          const name = r.name || r.city || r.district || r.area || r.office || '';
          if (!name) return null;
          const lat = Number(r.lat ?? r.latitude);
          const lon = Number(r.lon ?? r.lng ?? r.longitude);
          return {
            name: String(name),
            district: r.district ? String(r.district) : undefined,
            state: r.state ? String(r.state) : undefined,
            pincode: r.pincode ? String(r.pincode) : undefined,
            lat: Number.isFinite(lat) ? lat : undefined,
            lon: Number.isFinite(lon) ? lon : undefined,
          };
        })
        .filter((x): x is LocationHit => Boolean(x))
        .slice(0, 8);
    } catch {
      return [];
    }
  },

  async getStates(): Promise<string[]> {
    try {
      return await apiFetch<string[]>('/locations/states');
    } catch {
      return ['Punjab', 'Chandigarh', 'Haryana', 'Delhi', 'Rajasthan'];
    }
  },

  /**
   * The server's coverage answer, or null if it couldn't be reached. Used to
   * report "available" when the request failed, which invented coverage.
   */
  async checkEmiAvailability(
    pincode: string
  ): Promise<{ available: boolean; message?: string } | null> {
    try {
      return await apiFetch(`/locations/emi-availability?pincode=${encodeURIComponent(pincode)}`);
    } catch {
      return null;
    }
  },
};

// 3.16 Financers API
export interface FinancerPartner {
  id: string;
  name: string;
  contact_phone?: string;
  contact_email?: string;
  city?: string;
  logo_url?: string;
}

export const financersApi = {
  async getFinancers(): Promise<FinancerPartner[]> {
    try {
      const res = await apiFetch<FinancerPartner[]>('/financers');
      if (Array.isArray(res) && res.length > 0) return res;
    } catch {
      // fallback
    }
    return [
      { id: 'f-1', name: 'QuickFin Consumer Credit', contact_phone: '1800 120 4400', contact_email: 'partners@quickfin.example' },
      { id: 'f-2', name: 'DealBriz Capital Alliance', contact_phone: '1800 200 8822', contact_email: 'emi@dealbriz.com' },
      { id: 'f-3', name: 'Apex Northern Finance', contact_phone: '0172 458 9000', contact_email: 'support@apexfin.example' },
    ];
  },
};

// 3.17 Chatbot API (Rule-based DealBriz assistant as per doc)
export interface ChatbotGreeting {
  opening_message?: string;
  quick_replies: string[];
}

export interface ChatbotResponse {
  reply: string;
  suggestions?: string[];
  matched_intent?: string;
}

export const chatbotApi = {
  async getGreeting(): Promise<ChatbotGreeting> {
    try {
      return await apiFetch<ChatbotGreeting>('/chatbot/greeting');
    } catch {
      return {
        opening_message: 'Hi! I am the DealBriz Assistant. How can I help you today?',
        quick_replies: [
          'How do I buy a product on DealBriz?',
          'How does DealBriz EMI work?',
          'How do I post a free ad?',
          'Is EMI available in my pincode?',
        ],
      };
    }
  },

  async sendMessage(message: string, pincode?: string): Promise<ChatbotResponse> {
    try {
      return await apiFetch<ChatbotResponse>('/chatbot', {
        method: 'POST',
        body: JSON.stringify({ message, pincode }),
      });
    } catch {
      // Rule-based fallback mirroring backend/chatbot/intents.py.
      // Order matters: "report a seller" contains "sell", so the report and
      // safety intents have to be tested before the selling intent.
      const lower = message.toLowerCase();

      if (lower.includes('report') || lower.includes('block') || lower.includes('complain')) {
        return {
          reply:
            'To report a seller or a listing, open the chat with them and tap the info icon, then "Report user" — or open the listing and use the report option. Tell us what happened and our team reviews every report. If money has already changed hands, report it to your bank as well.',
          suggestions: ['How do I stay safe?', 'How do I buy on DealBriz?'],
        };
      }

      if (lower.includes('safe') || lower.includes('scam') || lower.includes('fraud')) {
        return {
          reply:
            'Meet in a public place and inspect the item before paying. Never send an advance payment or share an OTP with someone you have not met. DealBriz does not handle payments, so any request to pay "through DealBriz" is a scam.',
          suggestions: ['How do I report a seller?', 'How do I buy on DealBriz?'],
        };
      }

      if (lower.includes('emi') || lower.includes('finance') || lower.includes('loan')) {
        return {
          reply:
            'DealBriz EMI lets you pay for a listing in monthly instalments over 3 to 24 months. You apply from a listing that shows the EMI badge, and a lending partner reviews the application — approval and the final interest rate are their decision, not automatic. You can estimate the monthly amount with the EMI calculator first.',
          suggestions: ['Which items are EMI eligible?', 'What documents do I need?'],
        };
      }

      if (lower.includes('sell') || lower.includes('post an ad') || lower.includes('list my')) {
        return {
          reply:
            'Posting an ad is free. Tap Sell in the bottom bar, add up to 5 photos of your item, set a price and your PIN code, and it goes live for buyers near you.',
          suggestions: ['How do I price my item?', 'How do I stay safe?'],
        };
      }

      if (lower.includes('buy') || lower.includes('order') || lower.includes('purchase')) {
        return {
          reply:
            'Browse a category or search for what you want, open the listing, and use Chat with Seller to agree a price and a place to meet. Payment happens directly between you and the seller when you collect the item.',
          suggestions: ['How do I stay safe?', 'How does EMI work?'],
        };
      }

      if (lower.includes('listing') && (lower.includes('my') || lower.includes('mine'))) {
        return {
          reply:
            "I can look that up once you're signed in — your listings and account details are only visible to you.",
          suggestions: ['How do I post an ad?'],
        };
      }

      return {
        reply:
          "I can help with buying, selling, safety and DealBriz EMI. Ask me something like \"how does EMI work\" or \"how do I report a seller\".",
        suggestions: ['How does EMI work?', 'How do I buy on DealBriz?', 'How do I report a seller?'],
      };
    }
  },
};

// 3.18 Logs API
export const logsApi = {
  async logClientError(errorInfo: { message: string; stack?: string; url?: string }): Promise<void> {
    try {
      await apiFetch('/logs/client', {
        method: 'POST',
        body: JSON.stringify({
          ...errorInfo,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch {
      // fail silently
    }
  },
};

const PINCODE_TO_CITY: Record<string, string> = {
  '175006': 'Mandi (HP)',
  '140307': 'Rupnagar (PB)',
  '332001': 'Sikar (RJ)',
  '160017': 'Chandigarh',
  '160062': 'Mohali',
  '134117': 'Panchkula',
};

// Mapper from DealBriz Flask API shape to client Listing type

/** Normalises a listing's phone setting. Anything unclear counts as hidden. */
function showPhoneFlag(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'string') {
    return ['yes', '1', 'true', 'show'].includes(value.trim().toLowerCase());
  }
  return false;
}

export function mapDealBrizProductToListing(p: any): Listing {
  const sellerName = p.seller_name || 'DealBriz Seller';
  // The backend only exposes a phone number when the seller opted in to show it.
  const sellerPhone = p.posted_by_phone || p.seller_phone || '';
  const sellerAvatar =
    absoluteMediaUrl(p.seller_avatar || p.seller_avatar_url) || initialsAvatar(sellerName);

  const cityName = PINCODE_TO_CITY[p.city] || p.city || '';
  const displayLocation =
    p.location && p.location !== p.city
      ? p.location
      : `${cityName}${p.landmark ? `, ${p.landmark}` : ''}`;

  let extraImgs: string[] = [];
  if (Array.isArray(p.extra_images)) {
    extraImgs = p.extra_images.map((img: string) => absoluteMediaUrl(img)).filter(Boolean);
  } else if (typeof p.extra_images === 'string' && p.extra_images.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(p.extra_images);
      if (Array.isArray(parsed)) {
        extraImgs = parsed.map((img: string) => (img?.startsWith('http') ? img : `https://dealbriz.com${img}`));
      }
    } catch {
      // ignore
    }
  }

  let mainImg = '';
  if (p.image_url && typeof p.image_url === 'string') {
    mainImg = absoluteMediaUrl(p.image_url);
  }

  return {
    id: String(p.id),
    seller_id: p.posted_by ? String(p.posted_by) : undefined,
    title: p.title || 'Untitled Listing',
    price: Number(p.price) || 0,
    original_price: p.original_price ? Number(p.original_price) : null,
    category: (p.category || 'cars') as any,
    condition: p.condition || 'like_new',
    description: p.description || '',
    location: displayLocation,
    city: cityName,
    landmark: p.landmark || '',
    pincode: typeof p.city === 'string' && /^\d{6}$/.test(p.city) ? p.city : p.pincode || '',
    distance_km: typeof p.distance_km === 'number' ? p.distance_km : undefined,
    image_url: mainImg,
    extra_images: extraImgs,
    is_featured: Boolean(p.is_featured),
    emi_eligible: Boolean(p.emi_eligible || Number(p.price) >= 15000),
    negotiable: Boolean(p.negotiable ?? true),
    seller_name: sellerName,
    seller_phone: sellerPhone,
    // The API sends "yes" or "chat_only" (older rows also had "1"/"0").
    // This used to accept only a real boolean, so every listing came out
    // undefined - which the UI treated as "not hidden".
    show_phone: showPhoneFlag(p.show_phone),
    seller_avatar: sellerAvatar,
    seller_rating: Number(p.seller_rating) || 0,
    seller_reviews_count: Number(p.seller_reviews_count) || 0,
    seller_verified: Boolean(p.seller_verified),
    seller_joined: p.seller_joined || '',
    views: Number(p.views) || 0,
    created_at: p.created_at || new Date().toISOString(),
    status: p.status || 'active',
    attributes: {
      brand: p.brand || p.attributes?.brand || '',
      model: p.model || p.attributes?.model || '',
      ...(p.attributes || {}),
    },
  };
}
