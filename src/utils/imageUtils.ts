// Image & Avatar utilities matching the official DealBriz implementation

export const CATEGORY_EMOJIS: Record<string, string> = {
  cars: '🚗',
  phones: '📱',
  bikes: '🏍️',
  electronics: '💻',
  furniture: '🛋️',
  appliances: '🧊',
  fashion: '👗',
  property: '🏢',
};

export function getCategoryEmoji(category?: string): string {
  if (!category) return '📦';
  return CATEGORY_EMOJIS[category.toLowerCase()] || '📦';
}

/**
 * Fallback avatar drawn locally as an inline SVG data URI.
 * Directly matches DealBriz app.js (function initialsAvatar).
 * Cannot fail, requires no external network, and provides instant crisp rendering.
 */
export function initialsAvatar(name?: string, size = 200): string {
  const initials = (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase() || '?';

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="100%" height="100%" fill="#2563EB"/>` +
    `<text x="50%" y="50%" dy=".35em" text-anchor="middle" fill="#ffffff" ` +
    `font-family="system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" ` +
    `font-size="${Math.round(size * 0.42)}" font-weight="700">${initials}</text></svg>`;

  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

/**
 * Returns a guaranteed non-empty data URI placeholder for listings without an image,
 * completely preventing React "empty string passed to src attribute" warnings.
 */
export function defaultListingImage(title = 'Listing', category = 'general'): string {
  const emoji = getCategoryEmoji(category);
  const cleanTitle = (title || 'Item').slice(0, 24);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">
    <rect width="100%" height="100%" fill="#EEF2F9"/>
    <text x="50%" y="52%" text-anchor="middle" font-size="104">${emoji}</text>
    <text x="50%" y="84%" text-anchor="middle" fill="#64748b" font-family="system-ui,sans-serif" font-size="15" font-weight="600">${cleanTitle}</text>
  </svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

