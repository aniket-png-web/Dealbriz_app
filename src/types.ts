export type CategoryId = 
  | 'all'
  | 'cars'
  | 'phones'
  | 'bikes'
  | 'electronics'
  | 'furniture'
  | 'appliances'
  | 'fashion'
  | 'property';

export interface CategoryInfo {
  id: CategoryId;
  name: string;
  emoji: string;
  count?: number;
  description: string;
}

export interface ListingAttributes {
  brand?: string;
  model?: string;
  year?: string | number;
  fuel?: 'Petrol' | 'Diesel' | 'Electric' | 'CNG' | 'Hybrid';
  transmission?: 'Manual' | 'Automatic';
  km_driven?: string | number;
  owners?: string | number;
  color?: string;
  ram?: string;
  storage?: string;
  battery_health?: string;
  screen_size?: string;
  warranty_left?: string;
  bhk?: string;
  furnishing?: string;
  property_type?: string;
}

export interface Listing {
  id: string;
  /** Backend user id of the seller (products.posted_by). */
  seller_id?: string;
  title: string;
  price: number;
  original_price?: number | null;
  category: Exclude<CategoryId, 'all'>;
  condition: 'new' | 'like_new' | 'good' | 'fair';
  description: string;
  location: string;
  city: string;
  landmark?: string;
  pincode?: string;
  distance_km?: number;
  image_url: string;
  extra_images: string[];
  is_featured: boolean;
  emi_eligible: boolean;
  negotiable: boolean;
  seller_name: string;
  seller_phone?: string;
  /** False when the seller has hidden their number. Undefined = unknown. */
  show_phone?: boolean;
  seller_avatar?: string | null;
  seller_rating: number;
  seller_reviews_count: number;
  seller_verified: boolean;
  seller_joined: string;
  views: number;
  created_at: string;
  status: 'active' | 'sold';
  attributes: ListingAttributes;
}

export interface FilterState {
  category: CategoryId;
  searchQuery: string;
  city: string;
  minPrice: number | null;
  maxPrice: number | null;
  condition: string | null;
  emiOnly: boolean;
  sortBy: 'recommended' | 'price_low' | 'price_high' | 'recent' | 'distance';
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'seller';
  text: string;
  timestamp: string;
  isOffer?: boolean;
  offerAmount?: number;
}

export interface ChatConversation {
  /** The other party's number, only when they've opted to show it. */
  otherUserPhone?: string;
  /** `${productId}::${otherUserId}` - see services/chatBridge.ts */
  id: string;
  listingId: string;
  /** Backend user id of the other party in this thread. */
  otherUserId?: string;
  listingTitle: string;
  listingPrice: number;
  listingImage: string;
  sellerName: string;
  sellerAvatar?: string | null;
  sellerPhone?: string;
  messages: ChatMessage[];
  unreadCount: number;
  lastUpdated: string;
}

export interface EmiApplication {
  id: string;
  listingId: string;
  listingTitle: string;
  listingPrice: number;
  listingImage: string;
  downPayment: number;
  loanAmount: number;
  tenureMonths: number;
  monthlyEmi: number;
  interestRate: number;
  applicantName: string;
  applicantPhone: string;
  monthlyIncome?: number | null;
  /** Server status: pending | review | approved | rejected | disbursed | completed | cancelled */
  status: string;
  appliedAt: string;
}

export interface UserProfile {
  id?: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  pincode: string;
  avatar: string;
  isVerified: boolean;
  memberSince: string;
  isAuthenticated?: boolean;
  /** Whether buyers may see this user's number. Defaults to hidden. */
  showPhone?: boolean;
}

export type ActiveTab = 'home' | 'categories' | 'sell' | 'chats' | 'profile';
