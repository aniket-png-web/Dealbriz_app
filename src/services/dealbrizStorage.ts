import { INITIAL_LISTINGS, INITIAL_USER } from '../data/initialListings';
import { ChatConversation, EmiApplication, Listing, UserProfile } from '../types';
import { initialsAvatar, defaultListingImage } from '../utils/imageUtils';

const STORAGE_KEYS = {
  LISTINGS: 'dealbriz_mobile_listings_v2',
  SAVED_IDS: 'dealbriz_mobile_saved_ids_v2',
  CHATS: 'dealbriz_mobile_chats_v3',
  EMI_APPS: 'dealbriz_mobile_emi_apps_v2',
  USER_PROFILE: 'dealbriz_mobile_user_profile_v2',
  SELECTED_CITY: 'dealbriz_mobile_city_v2',
  // Where the user actually is, as opposed to what they're filtering by.
  HOME_CITY: 'dealbriz_mobile_home_city_v1',
  SHOW_PHONE: 'dealbriz_mobile_show_phone_v1',
};

// A fresh install starts with no conversations. (This used to ship five
// fabricated threads with real sellers' names and phone numbers, which looked
// to the user like messages they had actually exchanged.)
const INITIAL_CHATS: ChatConversation[] = [];

const LISTINGS_TOUCHED_KEY = 'dealbriz_mobile_listings_touched_v1';

export const dealbrizStorage = {
  // Listings
  getListings: (): Listing[] => {
    try {
      // Clear legacy storage keys with obsolete fake mock data
      localStorage.removeItem('dealbriz_mobile_listings_v1');

      const stored = localStorage.getItem(STORAGE_KEYS.LISTINGS);
      if (stored) {
        const parsed: Listing[] = JSON.parse(stored);
        // An empty list is a valid state (the user deleted everything, or the
        // live catalogue is empty) - don't fall back to the seed data for it.
        if (Array.isArray(parsed) && (parsed.length > 0 || localStorage.getItem(LISTINGS_TOUCHED_KEY))) {
          const hasFakeItems = parsed.some(
            (p) =>
              p.id.startsWith('dealbriz-') ||
              p.id.startsWith('live-dealbriz') ||
              p.image_url?.includes('unsplash.com') ||
              p.seller_name === 'Rohit Thakur' ||
              p.seller_name === 'Gurpreet Singh' ||
              p.seller_name === 'Simran Kaur'
          );
          if (!hasFakeItems) {
            return parsed.map((item) => ({
              ...item,
              image_url:
                item.image_url && item.image_url.trim()
                  ? item.image_url.trim()
                  : defaultListingImage(item.title, item.category),
            }));
          }
        }
      }
    } catch {
      // ignore
    }
    return INITIAL_LISTINGS;
  },

  saveListings: (listings: Listing[]) => {
    try {
      localStorage.setItem(LISTINGS_TOUCHED_KEY, '1');
      localStorage.setItem(STORAGE_KEYS.LISTINGS, JSON.stringify(listings));
    } catch {
      // ignore
    }
  },

  addListing: (newListing: Listing) => {
    const current = dealbrizStorage.getListings();
    const updated = [newListing, ...current];
    dealbrizStorage.saveListings(updated);
    return updated;
  },

  updateListing: (updatedListing: Listing): Listing[] => {
    const current = dealbrizStorage.getListings();
    const updated = current.map((item) =>
      item.id === updatedListing.id ? { ...item, ...updatedListing } : item
    );
    dealbrizStorage.saveListings(updated);
    return updated;
  },

  deleteListing: (id: string): Listing[] => {
    const current = dealbrizStorage.getListings();
    const updated = current.filter((item) => item.id !== id);
    dealbrizStorage.saveListings(updated);
    return updated;
  },

  // Saved / Favorites
  getSavedIds: (): string[] => {
    try {
      localStorage.removeItem('dealbriz_mobile_saved_ids_v1');
      const stored = localStorage.getItem(STORAGE_KEYS.SAVED_IDS);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // ignore
    }
    return [];
  },

  toggleSaveId: (id: string): string[] => {
    const current = dealbrizStorage.getSavedIds();
    const exists = current.includes(id);
    const updated = exists ? current.filter((item) => item !== id) : [...current, id];
    try {
      localStorage.setItem(STORAGE_KEYS.SAVED_IDS, JSON.stringify(updated));
    } catch {
      // ignore
    }
    return updated;
  },

  // Chats
  getChats: (): ChatConversation[] => {
    try {
      localStorage.removeItem('dealbriz_mobile_chats_v1');
      localStorage.removeItem('dealbriz_mobile_chats_v2');
      const stored = localStorage.getItem(STORAGE_KEYS.CHATS);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const hasFakeId = parsed.some((c: ChatConversation) => c.listingId?.startsWith('dealbriz-'));
          if (!hasFakeId) {
            return parsed.map((c: ChatConversation) => ({
              ...c,
              listingImage: c.listingImage?.trim() || defaultListingImage(c.listingTitle),
              sellerAvatar: c.sellerAvatar?.trim() || initialsAvatar(c.sellerName),
            }));
          }
        }
      }
    } catch {
      // ignore
    }
    return INITIAL_CHATS;
  },

  saveChats: (chats: ChatConversation[]) => {
    try {
      localStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(chats));
    } catch {
      // ignore
    }
  },

  sendChatMessage: (
    conversationId: string,
    listing: Listing,
    text: string,
    offerAmount?: number
  ): ChatConversation[] => {
    const currentChats = dealbrizStorage.getChats();
    let conversation = currentChats.find((c) => c.id === conversationId || c.listingId === listing.id);

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const newMsg = {
      id: `msg-${Date.now()}`,
      sender: 'user' as const,
      text,
      timestamp: timeStr,
      isOffer: Boolean(offerAmount),
      offerAmount,
    };

    if (!conversation) {
      conversation = {
        id: `chat-${listing.id}`,
        listingId: listing.id,
        listingTitle: listing.title,
        listingPrice: listing.price,
        listingImage: listing.image_url?.trim() || defaultListingImage(listing.title, listing.category),
        sellerName: listing.seller_name,
        sellerAvatar: listing.seller_avatar?.trim() || initialsAvatar(listing.seller_name),
        sellerPhone: listing.seller_phone,
        unreadCount: 0,
        lastUpdated: now.toISOString(),
        messages: [newMsg],
      };
      const updated = [conversation, ...currentChats];
      dealbrizStorage.saveChats(updated);
      return updated;
    }

    conversation.messages.push(newMsg);
    conversation.lastUpdated = now.toISOString();

    const otherChats = currentChats.filter((c) => c.id !== conversation!.id);
    const updated = [conversation, ...otherChats];
    dealbrizStorage.saveChats(updated);
    return updated;
  },

  // EMI Applications
  getEmiApps: (): EmiApplication[] => {
    try {
      localStorage.removeItem('dealbriz_mobile_emi_apps_v1');
      const stored = localStorage.getItem(STORAGE_KEYS.EMI_APPS);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // ignore
    }
    // No seeded applications: an EMI application only exists once the user files one.
    return [];
  },

  addEmiApp: (app: EmiApplication) => {
    const current = dealbrizStorage.getEmiApps();
    const updated = [app, ...current];
    try {
      localStorage.setItem(STORAGE_KEYS.EMI_APPS, JSON.stringify(updated));
    } catch {
      // ignore
    }
    return updated;
  },

  // User Profile
  getUserProfile: (): UserProfile => {
    try {
      localStorage.removeItem('dealbriz_mobile_user_profile_v1');
      const activeUserRaw = localStorage.getItem('dealbriz_active_user');
      if (activeUserRaw) {
        const activeUsr = JSON.parse(activeUserRaw);
        if (activeUsr && activeUsr.email) {
          const fullName = `${activeUsr.first_name || ''} ${activeUsr.last_name || ''}`.trim() || activeUsr.email;
          return {
            id: activeUsr.id,
            name: fullName,
            email: activeUsr.email,
            phone: activeUsr.phone || '',
            city: activeUsr.city || '',
            pincode: activeUsr.city?.length === 6 ? activeUsr.city : '',
            avatar: activeUsr.avatar_url || initialsAvatar(fullName),
            isVerified: true,
            memberSince: activeUsr.created_at
              ? new Date(activeUsr.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
              : '',
            isAuthenticated: true,
          };
        }
      }
      // No active account => the user is NOT signed in, whatever the cached
      // profile says. This cache kept isAuthenticated: true after the session
      // was gone, so the app showed you as signed in while every authenticated
      // request failed - and only a manual sign out cleared it.
      const stored = localStorage.getItem(STORAGE_KEYS.USER_PROFILE);
      if (stored) {
        const parsed: UserProfile = JSON.parse(stored);
        if (parsed && parsed.name && parsed.isAuthenticated) {
          localStorage.removeItem(STORAGE_KEYS.USER_PROFILE);
        }
      }
    } catch {
      // ignore
    }
    return INITIAL_USER;
  },

  /** Wipes every trace of the signed-in account from this device. */
  clearActiveUser: (): UserProfile => {
    try {
      localStorage.removeItem('dealbriz_active_user');
      localStorage.removeItem(STORAGE_KEYS.USER_PROFILE);
    } catch {
      // ignore
    }
    return INITIAL_USER;
  },

  saveUserProfile: (profile: UserProfile) => {
    try {
      localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile));
    } catch {
      // ignore
    }
  },

  // Selected City
  getSelectedCity: (): string => {
    try {
      return localStorage.getItem(STORAGE_KEYS.SELECTED_CITY) || 'All Cities';
    } catch {
      return 'All Cities';
    }
  },

  setSelectedCity: (city: string) => {
    try {
      localStorage.setItem(STORAGE_KEYS.SELECTED_CITY, city);
    } catch {
      // ignore
    }
  },

  /** Mirrors the server's show_phone flag; defaults to hidden. */
  getShowPhone: (): boolean => {
    try {
      return localStorage.getItem(STORAGE_KEYS.SHOW_PHONE) === '1';
    } catch {
      return false;
    }
  },

  setShowPhone: (on: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEYS.SHOW_PHONE, on ? '1' : '0');
    } catch {
      // ignore
    }
  },

  getHomeCity: (): string => {
    try {
      return localStorage.getItem(STORAGE_KEYS.HOME_CITY) || '';
    } catch {
      return '';
    }
  },

  setHomeCity: (city: string) => {
    try {
      if (city && city !== 'All Cities') {
        localStorage.setItem(STORAGE_KEYS.HOME_CITY, city);
      }
    } catch {
      // ignore
    }
  },
};
