import { CapacitorCookies } from '@capacitor/core';
import { DEALBRIZ_ORIGIN, IS_CROSS_ORIGIN_API } from './dealbrizApi';

/**
 * Keeps the DealBriz session alive across app restarts.
 *
 * config.py never sets JWT_SESSION_COOKIE, so flask-jwt-extended's default of
 * True applies and every auth cookie is issued with no Max-Age. Those are
 * session cookies: Android's cookie jar drops them when the app process dies,
 * which is why each launch started signed out.
 *
 * So we keep our own copy: read the auth cookies after a successful sign-in,
 * store them, and put them back before the first request on the next launch.
 *
 * Paths matter here. config.py scopes them:
 *   JWT_ACCESS_COOKIE_PATH  = "/api"
 *   JWT_REFRESH_COOKIE_PATH = "/api/auth"
 * Android's CookieManager path-matches on read and write, so each cookie has
 * to be fetched and restored at the path it belongs to.
 *
 * Trade-off worth stating plainly: this parks JWTs in the app's localStorage.
 * Private to the app on a normal device, and it's what most native apps do
 * with tokens, but it is a copy of a credential at rest. The clean fix is one
 * line server-side — see the note at the bottom of this file.
 */

const STORE_KEY = 'dealbriz_session_cookies_v2';

const ACCESS_PATH = '/api';
const REFRESH_PATH = '/api/auth';

/** Which cookie lives at which path, straight from config.py. */
const COOKIE_PATHS: Record<string, string> = {
  access_token_cookie: ACCESS_PATH,
  csrf_access_token: ACCESS_PATH,
  refresh_token_cookie: REFRESH_PATH,
  csrf_refresh_token: REFRESH_PATH,
};

interface StoredCookies {
  savedAt: number;
  cookies: Record<string, string>;
}

/** JWT_REFRESH_TOKEN_EXPIRES defaults to 30 days; don't replay anything older. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

async function readJar(path: string): Promise<Record<string, string>> {
  try {
    const jar = await CapacitorCookies.getCookies({ url: `${DEALBRIZ_ORIGIN}${path}` });
    return (jar || {}) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function saveSessionCookies(): Promise<void> {
  if (!IS_CROSS_ORIGIN_API) return;

  try {
    // A cookie at /api also matches /api/auth, so the deeper path returns
    // both sets; read each anyway rather than relying on that.
    const [accessJar, refreshJar] = await Promise.all([
      readJar(ACCESS_PATH),
      readJar(REFRESH_PATH),
    ]);
    const merged = { ...accessJar, ...refreshJar };

    const cookies: Record<string, string> = {};
    Object.keys(COOKIE_PATHS).forEach((name) => {
      if (merged[name]) cookies[name] = merged[name];
    });

    // Nothing to save means no session — don't overwrite a good copy.
    if (!cookies.access_token_cookie && !cookies.refresh_token_cookie) return;

    const payload: StoredCookies = { savedAt: Date.now(), cookies };
    localStorage.setItem(STORE_KEY, JSON.stringify(payload));
  } catch {
    // Best effort.
  }
}

export async function restoreSessionCookies(): Promise<boolean> {
  if (!IS_CROSS_ORIGIN_API) return false;

  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return false;

    const parsed: StoredCookies = JSON.parse(raw);
    if (!parsed?.cookies) return false;

    if (Date.now() - (parsed.savedAt || 0) > MAX_AGE_MS) {
      localStorage.removeItem(STORE_KEY);
      return false;
    }

    const [accessJar, refreshJar] = await Promise.all([
      readJar(ACCESS_PATH),
      readJar(REFRESH_PATH),
    ]);
    const live = { ...accessJar, ...refreshJar };

    let restored = false;
    for (const [key, value] of Object.entries(parsed.cookies)) {
      // If the session survived, the live value may be newer than our copy.
      if (live[key]) continue;
      const path = COOKIE_PATHS[key] || ACCESS_PATH;
      await CapacitorCookies.setCookie({
        url: `${DEALBRIZ_ORIGIN}${path}`,
        key,
        value,
        path,
      });
      restored = true;
    }
    return restored;
  } catch {
    return false;
  }
}

export function clearSessionCookies(): void {
  try {
    localStorage.removeItem(STORE_KEY);
    localStorage.removeItem('dealbriz_session_cookies_v1');
  } catch {
    // ignore
  }
  if (!IS_CROSS_ORIGIN_API) return;
  Object.entries(COOKIE_PATHS).forEach(([key, path]) => {
    CapacitorCookies.deleteCookie({ url: `${DEALBRIZ_ORIGIN}${path}`, key }).catch(() => {});
  });
}

/*
 * Server-side alternative, which makes this whole file unnecessary:
 *
 *   JWT_SESSION_COOKIE = False      # cookies get a real Max-Age and persist
 *
 * with, for the app's https://localhost origin:
 *   COOKIE_SAMESITE = "None"
 *   COOKIE_SECURE   = "true"        # required whenever SameSite=None
 */
