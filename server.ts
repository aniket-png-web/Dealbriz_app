import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { INITIAL_LISTINGS } from './src/data/initialListings.ts';
import { initialsAvatar } from './src/utils/imageUtils.ts';
import { Listing } from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Multer memory storage for uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

// -------------------------------------------------------------
// In-Memory Data Store (Persistent across requests during session)
// -------------------------------------------------------------

interface BackendUser {
  id: string;
  email: string;
  password?: string;
  first_name: string;
  last_name: string;
  phone: string;
  city: string;
  avatar_url?: string;
  is_admin: boolean;
  account_status: string;
  show_phone?: boolean;
  created_at: string;
}

// Pre-seeded demo user matching DealBriz initial listings
const users: Map<string, BackendUser> = new Map([
  [
    'usr-demo-1',
    {
      id: 'usr-demo-1',
      email: 'demo@dealbriz.com',
      password: 'password123',
      first_name: 'Aditya',
      last_name: 'Sharma',
      phone: '+91 98160 12345',
      city: 'Mandi (HP)',
      avatar_url: initialsAvatar('Aditya Sharma'),
      is_admin: false,
      account_status: 'active',
      show_phone: true,
      created_at: '2026-08-30T10:00:00.000Z',
    },
  ],
]);

// Map token -> userId
const sessions: Map<string, string> = new Map();

// In-memory listings list initialized from INITIAL_LISTINGS
const listings: Listing[] = JSON.parse(JSON.stringify(INITIAL_LISTINGS));

// Saved listings per user: userId -> Set of listing IDs
const userSavedListings: Map<string, Set<string>> = new Map();

// EMI Applications
interface BackendEmiApp {
  id: string;
  user_id?: string;
  product_id: string;
  product_title: string;
  price: number;
  down_payment: number;
  tenure_months: number;
  monthly_emi: number;
  applicant_name: string;
  applicant_phone: string;
  applicant_pincode: string;
  employment_type?: string;
  monthly_income?: string;
  status: 'review' | 'approved' | 'rejected';
  applied_at: string;
}

const emiApplications: BackendEmiApp[] = [
  {
    id: 'emi-demo-1',
    user_id: 'usr-demo-1',
    product_id: '2d5ec1c1-a7b9-4118-a4a9-73398b6144e3',
    product_title: 'FORD figo aspire',
    price: 330000,
    down_payment: 66000,
    tenure_months: 24,
    monthly_emi: 12450,
    applicant_name: 'Aditya Sharma',
    applicant_phone: '+91 98160 12345',
    applicant_pincode: '175006',
    employment_type: 'Salaried',
    monthly_income: '50000-75000',
    status: 'review',
    applied_at: '2026-09-01T14:20:00.000Z',
  },
];

// Chat conversations and messages
interface BackendChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  product_id: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

const chatMessages: BackendChatMessage[] = [
  {
    id: 'msg-seed-1',
    sender_id: 'usr-demo-1',
    receiver_id: 'guest',
    product_id: '2d5ec1c1-a7b9-4118-a4a9-73398b6144e3',
    body: 'Hi! Is the Ford Figo still available? Can we meet in Mandi tomorrow?',
    is_read: true,
    created_at: '2026-09-02T10:15:00.000Z',
  },
  {
    id: 'msg-seed-2',
    sender_id: 'guest',
    receiver_id: 'usr-demo-1',
    product_id: '2d5ec1c1-a7b9-4118-a4a9-73398b6144e3',
    body: 'Yes, it is available and in great running condition. Mandi town near Bus Stand works fine.',
    is_read: true,
    created_at: '2026-09-02T10:20:00.000Z',
  },
];

// Notifications
interface BackendNotification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

const notifications: BackendNotification[] = [
  {
    id: 'notif-1',
    user_id: 'usr-demo-1',
    title: 'Welcome to DealBriz!',
    body: 'Your local marketplace for buying, selling, and easy verified EMI financing.',
    type: 'system',
    is_read: false,
    created_at: '2026-08-30T10:05:00.000Z',
  },
  {
    id: 'notif-2',
    user_id: 'usr-demo-1',
    title: 'Listing verified',
    body: 'Your listing "FORD figo aspire" has been verified and featured.',
    type: 'listing',
    is_read: false,
    created_at: '2026-08-30T12:00:00.000Z',
  },
];

// Reports
const reports: any[] = [];
const problemReports: any[] = [];

// Helper to authenticate request
function getAuthUser(req: Request): BackendUser | null {
  const token =
    req.cookies?.access_token_cookie ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null);

  if (token && sessions.has(token)) {
    const userId = sessions.get(token);
    if (userId && users.has(userId)) {
      return users.get(userId)!;
    }
  }

  // Fallback to active demo user if demo cookie or header is present
  if (req.cookies?.dealbriz_active_uid && users.has(req.cookies.dealbriz_active_uid)) {
    return users.get(req.cookies.dealbriz_active_uid)!;
  }

  return null;
}

function setAuthCookies(res: Response, user: BackendUser, token: string) {
  const csrfToken = `csrf_${Math.random().toString(36).substring(2)}_${Date.now()}`;
  const refreshCsrf = `csrf_ref_${Math.random().toString(36).substring(2)}_${Date.now()}`;
  const refreshToken = `ref_${token}`;

  sessions.set(token, user.id);
  sessions.set(refreshToken, user.id);

  // Cookies for client access and credentials
  res.cookie('access_token_cookie', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 3600 * 1000,
  });
  res.cookie('csrf_access_token', csrfToken, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 3600 * 1000,
  });
  res.cookie('refresh_token_cookie', refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 24 * 3600 * 1000,
  });
  res.cookie('csrf_refresh_token', refreshCsrf, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 24 * 3600 * 1000,
  });
  res.cookie('dealbriz_active_uid', user.id, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 3600 * 1000,
  });
}

function clearAuthCookies(res: Response) {
  res.clearCookie('access_token_cookie', { path: '/' });
  res.clearCookie('csrf_access_token', { path: '/' });
  res.clearCookie('refresh_token_cookie', { path: '/' });
  res.clearCookie('csrf_refresh_token', { path: '/' });
  res.clearCookie('dealbriz_active_uid', { path: '/' });
}

// -------------------------------------------------------------
// 1. Auth Routes (/api/auth/*)
// -------------------------------------------------------------

app.post('/api/auth/signup', (req: Request, res: Response) => {
  const { email, password, first_name, last_name, phone, city } = req.body;
  if (!email || !first_name) {
    return res.status(400).json({ error: 'Email and first name are required' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  for (const u of users.values()) {
    if (u.email.toLowerCase() === cleanEmail) {
      return res.status(409).json({ error: `An account with email "${cleanEmail}" is already registered. Please Sign In.` });
    }
  }

  const newUser: BackendUser = {
    id: `usr-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    email: cleanEmail,
    password: password || 'secret',
    first_name: String(first_name).trim(),
    last_name: String(last_name || '').trim(),
    phone: String(phone || '').trim(),
    city: String(city || '').trim(),
    avatar_url: initialsAvatar(`${first_name} ${last_name || ''}`),
    is_admin: false,
    account_status: 'active',
    show_phone: true,
    created_at: new Date().toISOString(),
  };

  users.set(newUser.id, newUser);
  const token = `tok_${newUser.id}_${Date.now()}`;
  setAuthCookies(res, newUser, token);

  const { password: _, ...userSafe } = newUser;
  return res.status(201).json({
    message: 'Account created successfully',
    user: userSafe,
    token,
  });
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  let matchedUser: BackendUser | null = null;

  for (const u of users.values()) {
    if (u.email.toLowerCase() === cleanEmail) {
      matchedUser = u;
      break;
    }
  }

  // If user doesn't exist, create it seamlessly for easy testing/demo
  if (!matchedUser) {
    const parts = cleanEmail.split('@')[0].split('.');
    const fName = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : 'DealBriz';
    const lName = parts[1] ? parts[1].charAt(0).toUpperCase() + parts[1].slice(1) : 'Member';
    matchedUser = {
      id: `usr-${Date.now()}`,
      email: cleanEmail,
      password: password || 'password',
      first_name: fName,
      last_name: lName,
      phone: '+91 98000 00000',
      city: 'Mandi (HP)',
      avatar_url: initialsAvatar(`${fName} ${lName}`),
      is_admin: false,
      account_status: 'active',
      show_phone: true,
      created_at: new Date().toISOString(),
    };
    users.set(matchedUser.id, matchedUser);
  }

  const token = `tok_${matchedUser.id}_${Date.now()}`;
  setAuthCookies(res, matchedUser, token);

  const { password: _, ...userSafe } = matchedUser;
  return res.json({
    message: 'Signed in successfully',
    user: userSafe,
    token,
  });
});

app.get('/api/auth/me', (req: Request, res: Response) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const { password: _, ...userSafe } = user;
  return res.json({ user: userSafe });
});

app.post('/api/auth/refresh', (req: Request, res: Response) => {
  const user = getAuthUser(req) || Array.from(users.values())[0];
  if (user) {
    const newToken = `tok_${user.id}_${Date.now()}`;
    setAuthCookies(res, user, newToken);
    return res.json({ message: 'Session refreshed', token: newToken });
  }
  return res.status(401).json({ error: 'Session expired' });
});

app.post('/api/auth/logout', (_req: Request, res: Response) => {
  clearAuthCookies(res);
  return res.json({ message: 'Logged out successfully' });
});

// -------------------------------------------------------------
// 2. Buy & Search Routes (/api/buy/*)
// -------------------------------------------------------------

app.get('/api/buy', (req: Request, res: Response) => {
  const { category, city, q, minPrice, maxPrice, condition, emiOnly, verifiedOnly, limit, offset } = req.query;

  let filtered = [...listings];

  // Exclude removed
  filtered = filtered.filter((l) => (l as any).status !== 'removed');

  if (category && category !== 'all') {
    filtered = filtered.filter((l) => l.category.toLowerCase() === String(category).toLowerCase());
  }

  if (city && city !== 'All Cities') {
    const cleanCity = String(city).replace(/\s*\([^)]*\)\s*/g, '').toLowerCase().trim();
    filtered = filtered.filter(
      (l) =>
        l.city.toLowerCase().includes(cleanCity) ||
        (l.location && l.location.toLowerCase().includes(cleanCity)) ||
        l.pincode === cleanCity
    );
  }

  if (q) {
    const query = String(q).toLowerCase().trim();
    filtered = filtered.filter(
      (l) =>
        l.title.toLowerCase().includes(query) ||
        l.description.toLowerCase().includes(query) ||
        l.category.toLowerCase().includes(query) ||
        l.city.toLowerCase().includes(query) ||
        (l.attributes?.brand && String(l.attributes.brand).toLowerCase().includes(query)) ||
        (l.attributes?.model && String(l.attributes.model).toLowerCase().includes(query))
    );
  }

  if (minPrice) {
    const min = Number(minPrice);
    if (!isNaN(min)) filtered = filtered.filter((l) => l.price >= min);
  }

  if (maxPrice) {
    const max = Number(maxPrice);
    if (!isNaN(max)) filtered = filtered.filter((l) => l.price <= max);
  }

  if (condition) {
    filtered = filtered.filter((l) => l.condition === condition);
  }

  if (emiOnly === 'true' || emiOnly === '1') {
    filtered = filtered.filter((l) => l.emi_eligible);
  }

  if (verifiedOnly === 'true' || verifiedOnly === '1') {
    filtered = filtered.filter((l) => l.seller_verified);
  }

  const start = offset ? Number(offset) : 0;
  const count = limit ? Number(limit) : 50;
  const paged = filtered.slice(start, start + count);

  return res.json({
    products: paged,
    total: filtered.length,
    items: paged,
  });
});

app.get('/api/buy/search', (req: Request, res: Response) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  if (!q) {
    return res.json({ products: listings.slice(0, 20) });
  }

  const results = listings.filter(
    (l) =>
      (l as any).status !== 'removed' &&
      (l.title.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.category.toLowerCase().includes(q) ||
        l.city.toLowerCase().includes(q) ||
        (l.attributes?.brand && String(l.attributes.brand).toLowerCase().includes(q)) ||
        (l.attributes?.model && String(l.attributes.model).toLowerCase().includes(q)))
  );

  return res.json({ products: results, results });
});

app.get('/api/buy/smart-search', (req: Request, res: Response) => {
  const query = String(req.query.q || '').toLowerCase().trim();
  if (!query) {
    return res.json({ products: listings.slice(0, 15) });
  }

  // Extract price constraints if any like "under 50000" or "below 30k"
  let maxPrice: number | null = null;
  const underMatch = query.match(/(?:under|below|less than)\s*(?:rs\.?|inr)?\s*(\d+)(k)?/i);
  if (underMatch) {
    let p = Number(underMatch[1]);
    if (underMatch[2]) p *= 1000;
    maxPrice = p;
  }

  const terms = query.split(/\s+/).filter((t) => t.length > 2 && !['under', 'below', 'with', 'and', 'for', 'near'].includes(t));

  const scored = listings
    .filter((l) => (l as any).status !== 'removed')
    .map((l) => {
      let score = 0;
      const text = `${l.title} ${l.description} ${l.category} ${l.city} ${l.attributes?.brand || ''} ${l.attributes?.model || ''}`.toLowerCase();
      for (const t of terms) {
        if (text.includes(t)) score += 2;
      }
      if (maxPrice && l.price <= maxPrice) score += 3;
      if (l.is_featured) score += 1;
      return { listing: l, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.listing);

  return res.json({ products: scored.length > 0 ? scored : listings.slice(0, 10) });
});

app.get('/api/buy/suggest', (req: Request, res: Response) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  if (!q) return res.json([]);

  const suggestions = new Set<string>();
  for (const l of listings) {
    if (l.title.toLowerCase().includes(q)) suggestions.add(l.title);
    if (l.attributes?.brand && String(l.attributes.brand).toLowerCase().includes(q)) {
      suggestions.add(String(l.attributes.brand));
    }
  }
  return res.json(Array.from(suggestions).slice(0, 8));
});

app.post('/api/buy/:id/view', (req: Request, res: Response) => {
  const item = listings.find((l) => l.id === req.params.id);
  if (item) {
    item.views = (item.views || 0) + 1;
    return res.json({ success: true, views: item.views });
  }
  return res.json({ success: false });
});

// -------------------------------------------------------------
// 3. Sell & My Listings Routes (/api/sell/*, /api/my-listings/*)
// -------------------------------------------------------------

app.get('/api/sell/attributes/:category', (req: Request, res: Response) => {
  const cat = req.params.category.toLowerCase();
  const attributesMap: Record<string, any[]> = {
    cars: [
      { key: 'brand', label: 'Brand', required: true, type: 'text' },
      { key: 'model', label: 'Model', required: true, type: 'text' },
      { key: 'year', label: 'Year', required: true, type: 'number' },
      { key: 'fuel', label: 'Fuel Type', required: true, type: 'select', options: ['Petrol', 'Diesel', 'CNG', 'Electric', 'Hybrid'] },
      { key: 'transmission', label: 'Transmission', required: false, type: 'select', options: ['Manual', 'Automatic'] },
      { key: 'km_driven', label: 'KM Driven', required: false, type: 'number' },
      { key: 'owners', label: 'No. of Owners', required: false, type: 'select', options: ['1', '2', '3', '4+'] },
      { key: 'color', label: 'Color', required: false, type: 'text' },
    ],
    bikes: [
      { key: 'brand', label: 'Brand', required: true, type: 'text' },
      { key: 'model', label: 'Model', required: true, type: 'text' },
      { key: 'year', label: 'Year', required: true, type: 'number' },
      { key: 'km_driven', label: 'KM Driven', required: false, type: 'number' },
      { key: 'owners', label: 'No. of Owners', required: false, type: 'select', options: ['1', '2', '3+'] },
    ],
    phones: [
      { key: 'brand', label: 'Brand', required: true, type: 'text' },
      { key: 'model', label: 'Model', required: true, type: 'text' },
      { key: 'storage', label: 'Storage', required: false, type: 'select', options: ['64 GB', '128 GB', '256 GB', '512 GB', '1 TB'] },
      { key: 'ram', label: 'RAM', required: false, type: 'select', options: ['4 GB', '6 GB', '8 GB', '12 GB', '16 GB'] },
      { key: 'battery_health', label: 'Battery Health (%)', required: false, type: 'text' },
      { key: 'warranty_left', label: 'Warranty Left', required: false, type: 'text' },
    ],
    electronics: [
      { key: 'brand', label: 'Brand', required: true, type: 'text' },
      { key: 'model', label: 'Model', required: true, type: 'text' },
      { key: 'warranty_left', label: 'Warranty Left', required: false, type: 'text' },
    ],
    furniture: [
      { key: 'furnishing', label: 'Type', required: false, type: 'text' },
      { key: 'material', label: 'Material', required: false, type: 'text' },
    ],
    property: [
      { key: 'property_type', label: 'Property Type', required: true, type: 'select', options: ['Apartment', 'Plot', 'Independent House', 'Commercial'] },
      { key: 'bhk', label: 'BHK', required: false, type: 'select', options: ['1 BHK', '2 BHK', '3 BHK', '4+ BHK'] },
      { key: 'furnishing', label: 'Furnishing', required: false, type: 'select', options: ['Furnished', 'Semi-Furnished', 'Unfurnished'] },
    ],
  };

  return res.json({ attributes: attributesMap[cat] || [] });
});

app.post('/api/sell/upload-image', upload.single('file'), (req: Request, res: Response) => {
  if (req.file) {
    const mime = req.file.mimetype || 'image/jpeg';
    const base64 = req.file.buffer.toString('base64');
    const dataUrl = `data:${mime};base64,${base64}`;
    return res.json({ url: dataUrl, image_url: dataUrl, path: dataUrl });
  }

  if (req.body?.image) {
    return res.json({ url: req.body.image, image_url: req.body.image });
  }

  return res.status(400).json({ error: 'No file uploaded' });
});

app.post('/api/sell', (req: Request, res: Response) => {
  const user = getAuthUser(req) || Array.from(users.values())[0];
  const payload = req.body;

  const newId = `prod-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const cityName = payload.city && !/^\d{6}$/.test(payload.city) ? payload.city : (user?.city || 'Mandi (HP)');
  const pincode = typeof payload.city === 'string' && /^\d{6}$/.test(payload.city) ? payload.city : (payload.pincode || '175006');

  const newListing: Listing = {
    id: newId,
    seller_id: user?.id || 'usr-demo-1',
    title: payload.title || 'Untitled Listing',
    price: Number(payload.price) || 0,
    original_price: payload.original_price ? Number(payload.original_price) : null,
    category: payload.category || 'cars',
    condition: payload.condition || 'good',
    description: payload.description || '',
    location: payload.location || `${cityName}, Himachal Pradesh`,
    city: cityName,
    landmark: payload.landmark || '',
    pincode,
    distance_km: 1.0,
    image_url: payload.image_url || '',
    extra_images: Array.isArray(payload.extra_images) ? payload.extra_images : [],
    is_featured: false,
    emi_eligible: Boolean(payload.emi_eligible || Number(payload.price) >= 15000),
    negotiable: Boolean(payload.negotiable ?? true),
    seller_name: user ? `${user.first_name} ${user.last_name}`.trim() : 'DealBriz Seller',
    seller_phone: user?.phone || '',
    show_phone: user?.show_phone ?? true,
    seller_avatar: user?.avatar_url || initialsAvatar(user?.first_name || 'Seller'),
    seller_rating: 5.0,
    seller_reviews_count: 1,
    seller_verified: true,
    seller_joined: 'Recently',
    views: 1,
    created_at: new Date().toISOString(),
    status: 'active',
    attributes: {
      brand: payload.brand || payload.attributes?.brand || '',
      model: payload.model || payload.attributes?.model || '',
      ...(payload.attributes || {}),
    },
  };

  listings.unshift(newListing);

  // Return object matching DealBriz Flask API response
  return res.status(201).json({
    id: newListing.id,
    posted_by: newListing.seller_id,
    title: newListing.title,
    price: newListing.price,
    category: newListing.category,
    condition: newListing.condition,
    description: newListing.description,
    location: newListing.location,
    city: newListing.pincode,
    image_url: newListing.image_url,
    extra_images: newListing.extra_images,
    seller_name: newListing.seller_name,
    seller_phone: newListing.seller_phone,
    seller_verified: newListing.seller_verified,
    seller_rating: newListing.seller_rating,
    status: newListing.status,
    created_at: newListing.created_at,
    attributes: newListing.attributes,
  });
});

app.get('/api/my-listings', (req: Request, res: Response) => {
  const user = getAuthUser(req) || Array.from(users.values())[0];
  const userListings = listings.filter((l) => l.seller_id === user?.id || l.seller_name === `${user?.first_name} ${user?.last_name}`.trim());
  return res.json({ items: userListings, products: userListings });
});

app.put('/api/my-listings/:id', (req: Request, res: Response) => {
  const id = req.params.id;
  const idx = listings.findIndex((l) => l.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Listing not found' });
  }

  const existing = listings[idx];
  const payload = req.body;

  if (payload.status) existing.status = payload.status;
  if (payload.title) existing.title = payload.title;
  if (payload.price !== undefined) existing.price = Number(payload.price);
  if (payload.description !== undefined) existing.description = payload.description;
  if (payload.image_url) existing.image_url = payload.image_url;
  if (payload.attributes) existing.attributes = { ...existing.attributes, ...payload.attributes };

  listings[idx] = existing;
  return res.json(existing);
});

app.post('/api/my-listings/:id/sell', (req: Request, res: Response) => {
  const item = listings.find((l) => l.id === req.params.id);
  if (item) item.status = 'sold';
  return res.json({ success: true, status: 'sold' });
});

app.post('/api/my-listings/:id/unsell', (req: Request, res: Response) => {
  const item = listings.find((l) => l.id === req.params.id);
  if (item) item.status = 'active';
  return res.json({ success: true, status: 'active' });
});

// -------------------------------------------------------------
// 4. Profile & Users (/api/profile/*, /api/users/*)
// -------------------------------------------------------------

app.get('/api/profile', (req: Request, res: Response) => {
  const user = getAuthUser(req) || Array.from(users.values())[0];
  if (!user) return res.status(401).json({ error: 'Unauthenticated' });
  const { password: _, ...userSafe } = user;
  return res.json(userSafe);
});

app.put('/api/profile', (req: Request, res: Response) => {
  const user = getAuthUser(req) || Array.from(users.values())[0];
  if (!user) return res.status(401).json({ error: 'Unauthenticated' });

  const { first_name, last_name, phone, city, show_phone } = req.body;
  if (first_name !== undefined) user.first_name = String(first_name).trim();
  if (last_name !== undefined) user.last_name = String(last_name).trim();
  if (phone !== undefined) user.phone = String(phone).trim();
  if (city !== undefined) user.city = String(city).trim();
  if (show_phone !== undefined) user.show_phone = Boolean(show_phone);

  users.set(user.id, user);
  const { password: _, ...userSafe } = user;
  return res.json({ user: userSafe });
});

app.post('/api/profile/avatar', upload.single('file'), (req: Request, res: Response) => {
  if (req.file) {
    const mime = req.file.mimetype || 'image/jpeg';
    const base64 = req.file.buffer.toString('base64');
    const dataUrl = `data:${mime};base64,${base64}`;

    const user = getAuthUser(req);
    if (user) {
      user.avatar_url = dataUrl;
      users.set(user.id, user);
    }

    return res.json({ url: dataUrl, avatar_url: dataUrl });
  }
  return res.status(400).json({ error: 'No avatar uploaded' });
});

app.get('/api/users/:userId', (req: Request, res: Response) => {
  const userId = req.params.userId;
  const user = users.get(userId);
  if (user) {
    return res.json({
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      name: `${user.first_name} ${user.last_name}`.trim(),
      city: user.city,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
    });
  }

  // Fallback demo user details for external sellers
  return res.json({
    id: userId,
    first_name: 'DealBriz',
    last_name: 'Seller',
    name: 'DealBriz Seller',
    city: 'Mandi (HP)',
    avatar_url: initialsAvatar('DealBriz Seller'),
    created_at: '2026-08-01T00:00:00.000Z',
  });
});

// -------------------------------------------------------------
// 5. Saved Listings (/api/saved/*)
// -------------------------------------------------------------

app.get('/api/saved', (req: Request, res: Response) => {
  const user = getAuthUser(req);
  const uid = user?.id || 'guest';
  const savedSet = userSavedListings.get(uid) || new Set();
  return res.json(Array.from(savedSet));
});

app.post('/api/saved/:productId', (req: Request, res: Response) => {
  const user = getAuthUser(req);
  const uid = user?.id || 'guest';
  if (!userSavedListings.has(uid)) userSavedListings.set(uid, new Set());
  userSavedListings.get(uid)!.add(req.params.productId);
  return res.json({ success: true });
});

app.delete('/api/saved/:productId', (req: Request, res: Response) => {
  const user = getAuthUser(req);
  const uid = user?.id || 'guest';
  if (userSavedListings.has(uid)) {
    userSavedListings.get(uid)!.delete(req.params.productId);
  }
  return res.json({ success: true });
});

// -------------------------------------------------------------
// 6. EMI Financing Routes (/api/emi/*, /api/financers)
// -------------------------------------------------------------

app.post('/api/emi', (req: Request, res: Response) => {
  const user = getAuthUser(req);
  const { product_id, down_payment, tenure_months, applicant_name, applicant_phone, applicant_pincode, employment_type, monthly_income } = req.body;

  const product = listings.find((l) => l.id === product_id);
  const price = product?.price || 50000;
  const down = Number(down_payment) || Math.round(price * 0.2);
  const tenure = Number(tenure_months) || 12;
  const loanAmount = Math.max(0, price - down);
  const annualInterestRate = 0.12; // 12%
  const monthlyRate = annualInterestRate / 12;
  const emi = Math.round(
    tenure > 0
      ? (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) /
        (Math.pow(1 + monthlyRate, tenure) - 1)
      : loanAmount
  );

  const application: BackendEmiApp = {
    id: `emi-${Date.now()}`,
    user_id: user?.id || 'guest',
    product_id,
    product_title: product?.title || 'Selected Product',
    price,
    down_payment: down,
    tenure_months: tenure,
    monthly_emi: emi,
    applicant_name: applicant_name || user ? `${user?.first_name} ${user?.last_name}`.trim() : 'Applicant',
    applicant_phone: applicant_phone || user?.phone || '',
    applicant_pincode: applicant_pincode || '175006',
    employment_type: employment_type || 'Salaried',
    monthly_income: monthly_income || '50000',
    status: 'review',
    applied_at: new Date().toISOString(),
  };

  emiApplications.unshift(application);
  return res.status(201).json(application);
});

app.get('/api/emi/mine', (req: Request, res: Response) => {
  const user = getAuthUser(req);
  const uid = user?.id || 'guest';
  const apps = emiApplications.filter((a) => a.user_id === uid || a.user_id === 'guest');
  return res.json(apps);
});

app.get('/api/financers', (_req: Request, res: Response) => {
  return res.json([
    {
      id: 'f-1',
      name: 'QuickFin Consumer Credit',
      contact_phone: '1800 120 4400',
      contact_email: 'partners@quickfin.example',
      city: 'Chandigarh',
      logo_url: '',
    },
    {
      id: 'f-2',
      name: 'DealBriz Capital Alliance',
      contact_phone: '1800 200 8822',
      contact_email: 'emi@dealbriz.com',
      city: 'Delhi NCR',
      logo_url: '',
    },
    {
      id: 'f-3',
      name: 'Apex Northern Finance',
      contact_phone: '0172 458 9000',
      contact_email: 'support@apexfin.example',
      city: 'Mandi (HP)',
      logo_url: '',
    },
  ]);
});

app.get('/api/locations/emi-availability', (req: Request, res: Response) => {
  const pincode = String(req.query.pincode || '');
  return res.json({
    available: true,
    pincode,
    area: 'North India Express Zone',
    message: 'Instant EMI loan approvals available for verified buyers in this region.',
  });
});

// -------------------------------------------------------------
// 7. Notifications Routes (/api/notifications/*)
// -------------------------------------------------------------

app.get('/api/notifications/summary', (_req: Request, res: Response) => {
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const unreadChats = chatMessages.filter((m) => !m.is_read && m.receiver_id === 'guest').length;
  return res.json({ notifications: unreadCount, chats: unreadChats });
});

app.get('/api/notifications', (_req: Request, res: Response) => {
  return res.json(notifications);
});

app.post('/api/notifications/read', (req: Request, res: Response) => {
  const id = req.body?.id;
  if (id) {
    const notif = notifications.find((n) => n.id === id);
    if (notif) notif.is_read = true;
  } else {
    notifications.forEach((n) => (n.is_read = true));
  }
  return res.json({ success: true });
});

// -------------------------------------------------------------
// 8. Reports Routes (/api/reports/*)
// -------------------------------------------------------------

app.get('/api/reports/reasons', (_req: Request, res: Response) => {
  return res.json([
    { label: 'Fraud or scam', value: 'fraud_scam' },
    { label: 'Fake or misleading listing', value: 'fake_listing' },
    { label: 'Offensive or abusive content', value: 'offensive_content' },
    { label: 'Already sold / inactive', value: 'already_sold' },
    { label: 'Other problem', value: 'other' },
  ]);
});

app.get('/api/reports/problem-reasons', (_req: Request, res: Response) => {
  return res.json([
    { label: 'Technical bug on page', value: 'bug' },
    { label: 'Cannot log in or verify phone', value: 'auth_issue' },
    { label: 'EMI calculation inquiry', value: 'emi_inquiry' },
    { label: 'Feedback / suggestion', value: 'feedback' },
  ]);
});

app.post('/api/reports', (req: Request, res: Response) => {
  const entry = { id: `rep-${Date.now()}`, ...req.body, created_at: new Date().toISOString() };
  reports.push(entry);
  return res.json({ success: true, message: 'Report received and submitted for review.' });
});

app.post('/api/reports/problem', (req: Request, res: Response) => {
  const entry = { id: `prob-${Date.now()}`, ...req.body, created_at: new Date().toISOString() };
  problemReports.push(entry);
  return res.json({ success: true, message: 'Problem report recorded. Our technical team is on it.' });
});

// -------------------------------------------------------------
// 9. Chat & Messaging Routes (/api/chat/*)
// -------------------------------------------------------------

app.get('/api/chat/conversations', (req: Request, res: Response) => {
  const user = getAuthUser(req);
  const currentUid = user?.id || 'guest';

  // Find unique (product_id, other_user) pairs
  const map = new Map<string, any>();

  for (const msg of chatMessages) {
    const isSender = msg.sender_id === currentUid;
    const isReceiver = msg.receiver_id === currentUid;
    if (!isSender && !isReceiver) continue;

    const otherId = isSender ? msg.receiver_id : msg.sender_id;
    const key = `${msg.product_id}::${otherId}`;

    const prod = listings.find((l) => l.id === msg.product_id);
    const otherUser = users.get(otherId);

    if (!map.has(key) || new Date(msg.created_at) > new Date(map.get(key).created_at)) {
      map.set(key, {
        product_id: msg.product_id,
        product_title: prod?.title || 'DealBriz Item',
        other_user_id: otherId,
        other_user_name: otherUser ? `${otherUser.first_name} ${otherUser.last_name}`.trim() : (prod?.seller_name || 'Seller'),
        other_user_avatar: otherUser?.avatar_url || prod?.seller_avatar || initialsAvatar('Seller'),
        body: msg.body,
        created_at: msg.created_at,
        is_read: msg.is_read || isSender,
        receiver_id: msg.receiver_id,
      });
    }
  }

  // If empty, return a default conversation for the first listing
  if (map.size === 0 && listings[0]) {
    const l = listings[0];
    map.set(`${l.id}::${l.seller_id || 'usr-demo-1'}`, {
      product_id: l.id,
      product_title: l.title,
      other_user_id: l.seller_id || 'usr-demo-1',
      other_user_name: l.seller_name,
      other_user_avatar: l.seller_avatar,
      body: 'Hi! Is this item still available for inspection?',
      created_at: new Date().toISOString(),
      is_read: true,
      receiver_id: l.seller_id || 'usr-demo-1',
    });
  }

  return res.json(Array.from(map.values()));
});

app.get('/api/chat/conversation', (req: Request, res: Response) => {
  const productId = String(req.query.product_id || '');
  const otherId = String(req.query.other_id || '');
  const user = getAuthUser(req);
  const currentUid = user?.id || 'guest';

  const messages = chatMessages.filter(
    (m) =>
      m.product_id === productId &&
      ((m.sender_id === currentUid && m.receiver_id === otherId) ||
        (m.sender_id === otherId && m.receiver_id === currentUid))
  );

  return res.json(messages);
});

app.post('/api/chat/messages', (req: Request, res: Response) => {
  const user = getAuthUser(req);
  const currentUid = user?.id || 'guest';
  const { product_id, receiver_id, body } = req.body;

  if (!product_id || !body) {
    return res.status(400).json({ error: 'product_id and body are required' });
  }

  const newMsg: BackendChatMessage = {
    id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    sender_id: currentUid,
    receiver_id: receiver_id || 'usr-demo-1',
    product_id,
    body: String(body).trim(),
    is_read: false,
    created_at: new Date().toISOString(),
  };

  chatMessages.push(newMsg);

  // Auto-respond seller response after slight timeout for interactive feel
  if (receiver_id === 'usr-demo-1' || !receiver_id) {
    setTimeout(() => {
      chatMessages.push({
        id: `msg-auto-${Date.now()}`,
        sender_id: 'usr-demo-1',
        receiver_id: currentUid,
        product_id,
        body: 'Thanks for reaching out! Yes, you can inspect it in person. When are you free?',
        is_read: false,
        created_at: new Date().toISOString(),
      });
    }, 1500);
  }

  return res.status(201).json(newMsg);
});

app.post('/api/chat/mark-read', (req: Request, res: Response) => {
  const { product_id, other_id } = req.body;
  const user = getAuthUser(req);
  const currentUid = user?.id || 'guest';

  chatMessages.forEach((m) => {
    if (m.product_id === product_id && m.sender_id === other_id && m.receiver_id === currentUid) {
      m.is_read = true;
    }
  });

  return res.json({ success: true });
});

// -------------------------------------------------------------
// 10. FAQs, Locations & Settings (/api/faqs, /api/settings, /api/locations/*)
// -------------------------------------------------------------

app.get('/api/faqs', (_req: Request, res: Response) => {
  return res.json({
    categories: [
      { code: 'buying', label: 'Buying & Verification' },
      { code: 'selling', label: 'Selling & Ads' },
      { code: 'emi', label: 'DealBriz EMI' },
      { code: 'safety', label: 'Safety & Scams' },
    ],
    faqs: [
      {
        id: 'faq-1',
        category: 'buying',
        question: 'How do I buy a product safely on DealBriz?',
        answer: 'Search or browse listings near you, open chat with the seller to negotiate, and arrange a public in-person meetup to test the item thoroughly before exchanging money.',
      },
      {
        id: 'faq-2',
        category: 'selling',
        question: 'Is posting an ad free?',
        answer: 'Yes! You can post free ads with photos, location, and condition details across all categories including cars, bikes, electronics, and phones.',
      },
      {
        id: 'faq-3',
        category: 'emi',
        question: 'How does DealBriz EMI financing work?',
        answer: 'Eligible products over ₹15,000 carry an EMI badge. You can customize your down payment and tenure (3 to 24 months) and submit an application reviewed by partner NBFCs.',
      },
      {
        id: 'faq-4',
        category: 'safety',
        question: 'What should I do if a seller asks for an advance or OTP?',
        answer: 'Never send advance payments or share banking OTPs. DealBriz does not collect payments on behalf of sellers. Report any suspicious requests immediately.',
      },
    ],
  });
});

app.get('/api/settings', (_req: Request, res: Response) => {
  return res.json({
    app_version: '2.6.4',
    service_available: true,
    supported_regions: ['Himachal Pradesh', 'Punjab', 'Rajasthan', 'Chandigarh', 'Delhi NCR'],
    emi_enabled: true,
    min_emi_amount: 15000,
  });
});

app.get('/api/locations/search', (req: Request, res: Response) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  const allCities = [
    'Mandi (HP)',
    'Shimla (HP)',
    'Kullu (HP)',
    'Bilaspur (HP)',
    'Hamirpur (HP)',
    'Solan (HP)',
    'Una (HP)',
    'Dharamshala (HP)',
    'Rupnagar (PB)',
    'Chandigarh',
    'Mohali',
    'Panchkula',
    'Zirakpur',
    'Kharar',
    'Ludhiana',
    'Amritsar',
    'Sikar (RJ)',
    'Jaipur',
    'Delhi NCR',
  ];

  const results = q ? allCities.filter((c) => c.toLowerCase().includes(q)) : allCities;
  return res.json({ locations: results });
});

app.get('/api/locations/states', (_req: Request, res: Response) => {
  return res.json(['Himachal Pradesh', 'Punjab', 'Haryana', 'Chandigarh', 'Rajasthan', 'Delhi']);
});

// -------------------------------------------------------------
// 11. DealBriz AI Assistant / Chatbot (/api/chatbot/*)
// -------------------------------------------------------------

app.get('/api/chatbot/greeting', (_req: Request, res: Response) => {
  return res.json({
    opening_message: 'Hi! I am your DealBriz Smart Assistant. How can I help you buy, sell, or get EMI financing today?',
    quick_replies: [
      'How do I buy a product on DealBriz?',
      'How does DealBriz EMI work?',
      'How do I post a free ad?',
      'Is EMI available in my pincode?',
      'How to avoid fraud or scams?',
    ],
  });
});

app.post('/api/chatbot', (req: Request, res: Response) => {
  const { message, pincode } = req.body;
  const lower = String(message || '').toLowerCase().trim();

  let reply = '';
  let suggestions = ['How does EMI work?', 'How do I post a free ad?', 'How do I stay safe?'];
  let matched_intent = 'general';

  if (lower.includes('report') || lower.includes('block') || lower.includes('complain') || lower.includes('fake')) {
    matched_intent = 'report';
    reply = 'To report a seller or listing, tap the options icon on the listing or inside the chat thread, then tap "Report Listing". Our team reviews all flagged posts within 24 hours to keep the community safe.';
    suggestions = ['How do I stay safe?', 'How do I buy on DealBriz?'];
  } else if (lower.includes('safe') || lower.includes('scam') || lower.includes('fraud') || lower.includes('advance')) {
    matched_intent = 'safety';
    reply = 'Always meet in a public location during daylight to inspect goods before payment. Never send money in advance via UPI or QR code. DealBriz never asks for your OTP or payment deposits.';
    suggestions = ['How do I report a seller?', 'How do I buy on DealBriz?'];
  } else if (lower.includes('emi') || lower.includes('finance') || lower.includes('loan') || lower.includes('instalment')) {
    matched_intent = 'emi';
    reply = `DealBriz EMI lets you purchase verified items over ₹15,000 in monthly instalments from 3 to 24 months. Down payments start at 20% with transparent interest rates from licensed NBFC partners.${pincode ? ` Verified delivery and financing is active in pincode ${pincode}.` : ''}`;
    suggestions = ['Which items are EMI eligible?', 'What documents do I need?'];
  } else if (lower.includes('sell') || lower.includes('post an ad') || lower.includes('list') || lower.includes('selling')) {
    matched_intent = 'selling';
    reply = 'Posting an ad on DealBriz is 100% free! Tap the "Sell" button in the bottom bar, upload clear photos of your item, set your price, pick your city or PIN code, and your listing goes live immediately.';
    suggestions = ['How do I price my item?', 'How do I stay safe?'];
  } else if (lower.includes('buy') || lower.includes('order') || lower.includes('purchase')) {
    matched_intent = 'buying';
    reply = 'Browse categories or search for items in your area. When you find something you like, tap "Chat with Seller" to ask questions or make an offer. Meet up, inspect the item, and pay in person.';
    suggestions = ['How do I stay safe?', 'How does DealBriz EMI work?'];
  } else if (lower.includes('pincode') || lower.includes('city') || lower.includes('location')) {
    matched_intent = 'location';
    reply = `DealBriz connects buyers and sellers locally across North India including Himachal Pradesh, Punjab, Haryana, Chandigarh, and Rajasthan.${pincode ? ` Pincode ${pincode} has active listings and buyer protection.` : ''}`;
    suggestions = ['How do I buy on DealBriz?', 'How does DealBriz EMI work?'];
  } else {
    reply = 'I am here to guide you with buying, selling, safety guidelines, and DealBriz EMI financing. What would you like help with?';
    suggestions = ['How do I buy on DealBriz?', 'How does DealBriz EMI work?', 'How do I post a free ad?'];
  }

  return res.json({ reply, suggestions, matched_intent });
});

// -------------------------------------------------------------
// 12. Client Logs (/api/logs/client)
// -------------------------------------------------------------

app.post('/api/logs/client', (req: Request, res: Response) => {
  // Gracefully receive client logs
  return res.json({ recorded: true });
});

// -------------------------------------------------------------
// 13. APK Download Middleware
// -------------------------------------------------------------

app.get(['/dealbriz.apk', '/app-debug.apk'], (_req: Request, res: Response, next: NextFunction) => {
  const apkPath = path.resolve(__dirname, 'public/dealbriz.apk');
  if (fs.existsSync(apkPath)) {
    const stat = fs.statSync(apkPath);
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="dealbriz.apk"');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return fs.createReadStream(apkPath).pipe(res);
  }
  next();
});

// -------------------------------------------------------------
// 14. Frontend Mounting (Vite in Dev, Static in Prod)
// -------------------------------------------------------------

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[DealBriz Backend] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[DealBriz Backend] Failed to start server:', err);
  process.exit(1);
});
