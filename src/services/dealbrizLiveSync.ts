import { Listing } from '../types';
import { API_BASE, IS_CROSS_ORIGIN_API, mapDealBrizProductToListing } from './dealbrizApi';

/**
 * Pulls the live catalogue from the DealBriz backend.
 *
 * Returns null when the backend could not be reached, so callers can tell
 * "no network" apart from "the marketplace is genuinely empty".
 */
export async function syncLiveDealBrizListings(): Promise<Listing[] | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(`${API_BASE}/buy`, {
      signal: controller.signal,
      credentials: IS_CROSS_ORIGIN_API ? 'include' : 'same-origin',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) return null;

    const data = await res.json().catch(() => null);
    if (!data) return null;

    const items = Array.isArray(data) ? data : data.items || data.products || [];
    if (!Array.isArray(items)) return null;

    return items.map(mapDealBrizProductToListing);
  } catch {
    // Offline, DNS failure, timeout, ...
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
