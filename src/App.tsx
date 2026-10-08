import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Sparkles,
  ArrowRight,
  ChevronRight,
  Zap,
  Tag,
  ShieldCheck,
  Search,
  MessageSquare,
  AlertCircle,
  Plus,
  Compass,
  CheckCircle2,
  Bot,
  MapPin,
} from 'lucide-react';
import { AndroidFrame } from './components/AndroidFrame';
import { AndroidTopBar } from './components/AndroidTopBar';
import { OnboardingScreen } from './components/OnboardingScreen';
import { SearchResultsView } from './components/SearchResultsView';
import { ListingCard } from './components/ListingCard';
import { ListingDetailModal } from './components/ListingDetailModal';
import { EmiCalculatorModal } from './components/EmiCalculatorModal';
import { SellListingModal } from './components/SellListingModal';
import { ChatModal } from './components/ChatModal';
import { AndroidBottomNav } from './components/AndroidBottomNav';
import { ProfileView } from './components/ProfileView';
import { EditProfileModal } from './components/EditProfileModal';
import { PullToRefresh } from './components/PullToRefresh';
import {
  saveSessionCookies,
  restoreSessionCookies,
  clearSessionCookies,
} from './services/sessionPersistence';
import { FilterModal } from './components/FilterModal';
import { NotificationsModal } from './components/NotificationsModal';
import { PwaInstallModal } from './components/PwaInstallModal';
import { ListingsNearYouMap } from './components/ListingsNearYouMap';
import { DealBrizChatbotModal } from './components/DealBrizChatbotModal';
import { FaqsModal } from './components/FaqsModal';
import { AuthModal } from './components/AuthModal';
import { ReportModal } from './components/ReportModal';
import { CATEGORIES } from './data/initialListings';
import { dealbrizStorage } from './services/dealbrizStorage';
import { oneSignalService, PushChatTarget } from './services/oneSignalService';
import { syncLiveDealBrizListings } from './services/dealbrizLiveSync';
import {
  threadId,
  parseThreadId,
  conversationForListing,
  loadInbox,
  loadThreadMessages,
  sendThreadMessage,
  markThreadRead,
} from './services/chatBridge';
import { profileApi, notificationsApi, authApi, AuthUser, sellApi, emiApi, savedApi, buyApi, setSessionExpiredHandler, DEALBRIZ_ORIGIN, listingMatchesCity } from './services/dealbrizApi';
import { initAndroidNativeBridge } from './services/capacitorNative';
import { initialsAvatar, defaultListingImage } from './utils/imageUtils';
import {
  ActiveTab,
  CategoryId,
  ChatConversation,
  EmiApplication,
  FilterState,
  Listing,
  UserProfile, ChatMessage } from './types';

/**
 * "Show my mobile number" lives on the server, so it's the same on every
 * device and is enforced for listings and chat. The server is the only
 * source: a value cached on this phone may belong to whoever was signed in
 * before (shared phone), and copying it onto a new account published that
 * person's number. An account that has never set it is saved as hidden, so
 * the switch and what other people see always agree.
 */
function reconcileShowPhone(usr: AuthUser): boolean {
  if (typeof usr.show_phone === 'boolean') {
    dealbrizStorage.setShowPhone(usr.show_phone);
    return usr.show_phone;
  }
  dealbrizStorage.setShowPhone(false);
  profileApi.updateProfile({ show_phone: false }).catch(() => {});
  return false;
}

export default function App() {
  // Core state
  const [listings, setListings] = useState<Listing[]>(() => dealbrizStorage.getListings());
  // Saved items come from the account (GET /api/saved), so the app and the
  // website show the same list. They used to live only on this phone.
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [savedProducts, setSavedProducts] = useState<Listing[]>([]);
  const [chats, setChats] = useState<ChatConversation[]>(() => dealbrizStorage.getChats());
  // From the server only. The phone-side list held applications that had
  // never reached the server, shown as if they were under review.
  const [emiApps, setEmiApps] = useState<EmiApplication[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile>(() => ({
    ...dealbrizStorage.getUserProfile(),
    showPhone: dealbrizStorage.getShowPhone(),
  }));
  // Account-scoped loads must wait for restoreSession(), otherwise they fire
  // against a stale cached "signed in" state, 401, and never retry - which is
  // why My Ads stayed empty until a manual sign out and back in.
  const [sessionResolved, setSessionResolved] = useState<boolean>(false);

  // Navigation & View state
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>('all');
  const [selectedCity, setSelectedCity] = useState<string>(() => dealbrizStorage.getSelectedCity());
  // selectedCity is a filter the user clears; homeCity is where they are, and
  // survives "Clear all" so the feed still puts nearby listings first.
  const [homeCity, setHomeCity] = useState<string>(() => {
    const stored = dealbrizStorage.getHomeCity();
    if (stored) return stored;
    const city = dealbrizStorage.getSelectedCity();
    return city && city !== 'All Cities' ? city : '';
  });

  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    category: 'all',
    searchQuery: '',
    city: 'All Cities',
    minPrice: null,
    maxPrice: null,
    condition: null,
    emiOnly: false,
    sortBy: 'recommended',
  });

  // Modals state
  const [activeListing, setActiveListing] = useState<Listing | null>(null);
  const [activeChat, setActiveChat] = useState<ChatConversation | null>(null);
  const [chatListingContext, setChatListingContext] = useState<Listing | null>(null);
  const [showEmiModal, setShowEmiModal] = useState<boolean>(false);
  const [emiListingContext, setEmiListingContext] = useState<Listing | null>(null);
  const [showSellModal, setShowSellModal] = useState<boolean>(false);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [showEditProfile, setShowEditProfile] = useState<boolean>(false);
  const [showFilterModal, setShowFilterModal] = useState<boolean>(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState<boolean>(false);
  const [showInstallModal, setShowInstallModal] = useState<boolean>(false);
  const [showChatbotModal, setShowChatbotModal] = useState<boolean>(false);
  const [showFaqsModal, setShowFaqsModal] = useState<boolean>(false);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [chatSearch, setChatSearch] = useState<string>('');
  // Search and category browsing are destinations, not modes the home feed
  // sits in. categoryResultsFor is set when a tile is tapped on Explore.
  const [showSearchResults, setShowSearchResults] = useState<boolean>(false);
  const [categoryResultsFor, setCategoryResultsFor] = useState<CategoryId | null>(null);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    try {
      return !localStorage.getItem('dealbriz_onboarded_v1');
    } catch {
      return false;
    }
  });

  const dismissOnboarding = useCallback((thenSignIn: boolean) => {
    try {
      localStorage.setItem('dealbriz_onboarded_v1', '1');
    } catch {
      // ignore
    }
    setShowOnboarding(false);
    if (thenSignIn) setShowAuthModal(true);
  }, []);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login');
  const [showReportProblemModal, setShowReportProblemModal] = useState<boolean>(false);

  const handleOpenAuth = (mode: 'login' | 'signup' = 'login') => {
    setAuthModalMode(mode);
    setShowAuthModal(true);
  };

  // Start OneSignal push
  useEffect(() => {
    oneSignalService.initOneSignal().catch(() => {});
  }, []);

  /**
   * Ask for notification permission on launch.
   *
   * Android 13+ needs an explicit POST_NOTIFICATIONS grant or no push ever
   * arrives. The service only asks while permission is off AND Android will
   * still show its dialog, so a user who refused isn't nagged every launch -
   * they can turn it on from the bell instead. The short delay lets the first
   * screen paint so the dialog doesn't land on a blank WebView.
   */
  useEffect(() => {
    const t = window.setTimeout(() => {
      oneSignalService.promptOnLaunchIfNeeded().catch(() => {});
    }, 1500);
    return () => window.clearTimeout(t);
  }, []);

  // Re-read the permission when the app comes back to the foreground - the
  // user may have just enabled notifications in Android Settings.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') oneSignalService.refresh().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  /**
   * Tie the device subscription to the signed-in account, so the server knows
   * who to notify. Runs on every sign-in because the subscription id can change
   * (reinstall, cleared data, token refresh).
   */
  useEffect(() => {
    if (!userProfile.isAuthenticated || !userProfile.id) return;
    oneSignalService.linkUser(String(userProfile.id), userProfile.email).catch(() => {});
  }, [userProfile.isAuthenticated, userProfile.id, userProfile.email]);


  // Check auth session (Section 3.1: GET /api/auth/me, then /auth/refresh)
  // Re-copy the cookies when the app is backgrounded, so a token that was
  // refreshed mid-session is the one we replay next launch.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && sessionVerifiedRef.current) {
        saveSessionCookies().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    // Read before restoreSession(), which clears this key on rejection.
    let hadStoredUser = false;
    try {
      hadStoredUser = Boolean(localStorage.getItem('dealbriz_active_user'));
    } catch {
      hadStoredUser = false;
    }

    restoreSessionCookies()
      .catch(() => false)
      .then(() => authApi.restoreSession())
      .then((usr) => {
      if (usr && usr.email) {
        sessionVerifiedRef.current = true;
        saveSessionCookies().catch(() => {});
        const showPhone = reconcileShowPhone(usr);
        setUserProfile((prev) => {
          const updated: UserProfile = {
            ...prev,
            id: usr.id,
            name: `${usr.first_name || ''} ${usr.last_name || ''}`.trim() || usr.email.split('@')[0],
            email: usr.email,
            phone: usr.phone || prev.phone,
            city: usr.city || prev.city,
            avatar: usr.avatar_url || prev.avatar,
            showPhone,
            isVerified: true,
            isAuthenticated: true,
          };
          dealbrizStorage.saveUserProfile(updated);
          return updated;
        });
      } else {
        // Signed out: clear every trace so the UI can't show a signed-in
        // header over a dead session.
        clearSessionCookies();
        setUserProfile(dealbrizStorage.clearActiveUser());
        setMyListings([]);
        setChats([]);

        // Until the server issues persistent cookies, the session dies with
        // the app process. If this device has signed in before, bring up the
        // sign-in sheet with the email already filled rather than leaving the
        // user to discover for themselves that they're signed out.
        // 'dealbriz_last_email' only records that someone signed in here once -
        // it survives a deliberate logout. 'dealbriz_active_user' is written
        // while signed in and cleared on logout, so its presence means a live
        // session the server has now rejected: genuine expiry.
        try {
          if (hadStoredUser) {
            setAuthModalMode('login');
            setShowAuthModal(true);
            setToast('Your session expired. Please sign in again.');
          }
        } catch {
          // ignore
        }
      }
    })
      .catch(() => {})
      .finally(() => setSessionResolved(true));
  }, []);

  // Android Native Hardware/Gesture Back Button Handler
  const stateRef = useRef({
    showAuthModal,
    showFaqsModal,
    showChatbotModal,
    showReportProblemModal,
    showNotificationsModal,
    showInstallModal,
    showFilterModal,
    showSellModal,
    showEmiModal,
    showEditProfile,
    showSearchResults,
    activeChat,
    activeListing,
    activeTab,
  });

  useEffect(() => {
    stateRef.current = {
      showAuthModal,
      showFaqsModal,
      showChatbotModal,
      showReportProblemModal,
      showNotificationsModal,
      showInstallModal,
      showFilterModal,
      showSellModal,
      showEmiModal,
      showEditProfile,
      showSearchResults,
      activeChat,
      activeListing,
      activeTab,
    };
  });

  // 0 means "not armed". Compared against Date.now() at press time, so a stale
  // timer can never leave the app in an armed state.
  const backArmedAtRef = useRef<number>(0);
  const BACK_EXIT_WINDOW_MS = 4000;
  const closeResultsViewRef = useRef<() => void>(() => {});

  useEffect(() => {
    const cleanup = initAndroidNativeBridge(() => {
      const s = stateRef.current;
      if (s.showAuthModal) {
        setShowAuthModal(false);
        return true;
      }
      if (s.showFaqsModal) {
        setShowFaqsModal(false);
        return true;
      }
      if (s.showChatbotModal) {
        setShowChatbotModal(false);
        return true;
      }
      if (s.showReportProblemModal) {
        setShowReportProblemModal(false);
        return true;
      }
      if (s.showNotificationsModal) {
        setShowNotificationsModal(false);
        return true;
      }
      if (s.showInstallModal) {
        setShowInstallModal(false);
        return true;
      }
      if (s.showFilterModal) {
        setShowFilterModal(false);
        return true;
      }
      if (s.showSellModal) {
        setShowSellModal(false);
        setEditingListing(null);
        return true;
      }
      if (s.showEmiModal) {
        setShowEmiModal(false);
        return true;
      }
      if (s.activeChat) {
        setActiveChat(null);
        return true;
      }
      if (s.activeListing) {
        setActiveListing(null);
        return true;
      }
      if (s.showEditProfile) {
        setShowEditProfile(false);
        return true;
      }
      if (s.showSearchResults) {
        closeResultsViewRef.current();
        return true;
      }
      if (s.activeTab !== 'home') {
        setActiveTab('home');
        return true;
      }

      // On home. Returning true means "handled", which is what stops the
      // bridge from exiting - so the first press only ever shows the prompt.
      // Exit happens on a second press while that prompt is still up.
      const now = Date.now();
      const armedAt = backArmedAtRef.current;
      if (armedAt !== 0 && now - armedAt < BACK_EXIT_WINDOW_MS) {
        backArmedAtRef.current = 0;
        return false; // let the bridge exit the app
      }

      backArmedAtRef.current = now;
      setToast('Press back again to exit');
      window.setTimeout(() => {
        if (
          backArmedAtRef.current !== 0 &&
          Date.now() - backArmedAtRef.current >= BACK_EXIT_WINDOW_MS - 50
        ) {
          backArmedAtRef.current = 0;
          setToast((cur) => (cur === 'Press back again to exit' ? null : cur));
        }
      }, BACK_EXIT_WINDOW_MS);
      return true;
    });

    return cleanup;
  }, []);

  // PWA Prompt
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Notifications list
  // Only the welcome note. The EMI-approval and price-drop entries that used
  // to sit here were invented client-side. Real notifications come from
  // /api/notifications; showing nothing until then is the honest state.
  const [notifications, setNotifications] = useState([
    {
      id: 'notif-welcome',
      title: 'Welcome to DealBriz Android',
      message: 'Buy and sell near you, and chat with sellers right in the app.',
      time: '',
      type: 'system' as const,
      read: true,
    },
  ]);

  // Handle PWA install prompt event
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  // Live catalogue from dealbriz.com/api/buy
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [isLoadingLive, setIsLoadingLive] = useState<boolean>(true);

  const loadLiveListings = useCallback(async (): Promise<boolean> => {
    setIsLoadingLive(true);
    try {
      const liveItems = await syncLiveDealBrizListings();

      // null => the backend was unreachable; keep whatever we already have.
      if (liveItems === null) {
        setIsOffline(true);
        return false;
      }

      setIsOffline(false);

      // The server is the source of truth. Keep only the user's own local
      // drafts (listings that were never pushed) on top of the live set.
      setListings((prev) => {
        const liveIds = new Set(liveItems.map((i) => i.id));
        const localOnly = prev.filter((i) => i.id.startsWith('local-') && !liveIds.has(i.id));
        const merged = [...localOnly, ...liveItems];
        dealbrizStorage.saveListings(merged);
        return merged;
      });
      return true;
    } finally {
      setIsLoadingLive(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    loadLiveListings().catch(() => {
      if (isMounted) setIsOffline(true);
    });
    return () => {
      isMounted = false;
    };
  }, [loadLiveListings]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    listings.forEach((item) => {
      counts[item.category] = (counts[item.category] || 0) + 1;
    });
    return counts;
  }, [listings]);

  // Filter and sort listings
  const filteredListings = useMemo(() => {
    return listings
      .filter((item) => {
        // Category filter
        if (selectedCategory !== 'all' && item.category !== selectedCategory) {
          return false;
        }

        // City is NOT a filter. Listings from the chosen area are sorted to
        // the top below, and everything else still shows underneath - a
        // marketplace that hides the rest of the country looks empty.

        // Search query
        if (filters.searchQuery.trim()) {
          const q = filters.searchQuery.toLowerCase();
          const matchTitle = item.title.toLowerCase().includes(q);
          const matchDesc = item.description.toLowerCase().includes(q);
          const matchLoc = item.location.toLowerCase().includes(q);
          const matchBrand = item.attributes?.brand?.toLowerCase().includes(q);
          const matchCategory = item.category.toLowerCase().includes(q);

          if (!matchTitle && !matchDesc && !matchLoc && !matchBrand && !matchCategory) {
            return false;
          }
        }

        // EMI only
        if (filters.emiOnly && !item.emi_eligible) {
          return false;
        }

        // Condition filter
        if (filters.condition && item.condition !== filters.condition) {
          return false;
        }

        // Price range
        if (filters.minPrice !== null && item.price < filters.minPrice) {
          return false;
        }
        if (filters.maxPrice !== null && item.price > filters.maxPrice) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Nearby first, whatever the sort order.
        // With no city filter, fall back to the user's own area so the feed
        // still opens on what's close. listingMatchesCity returns true for
        // everything on an empty string, so order is untouched if unknown.
        const nearCity = selectedCity !== 'All Cities' ? selectedCity : homeCity;
        const aLocal = listingMatchesCity(nearCity, a);
        const bLocal = listingMatchesCity(nearCity, b);
        if (aLocal !== bLocal) return aLocal ? -1 : 1;

        switch (filters.sortBy) {
          case 'price_low':
            return a.price - b.price;
          case 'price_high':
            return b.price - a.price;
          case 'recent':
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          case 'distance':
            return (a.distance_km || 10) - (b.distance_km || 10);
          case 'recommended':
          default:
            // Featured items first, then newer
            if (a.is_featured && !b.is_featured) return -1;
            if (!a.is_featured && b.is_featured) return 1;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
      });
  }, [listings, selectedCategory, selectedCity, homeCity, filters]);

  // Where the "everything else" divider goes in the feed.
  const localListingCount = useMemo(() => {
    if (selectedCity === 'All Cities') return filteredListings.length;
    return filteredListings.filter((item) => listingMatchesCity(selectedCity, item)).length;
  }, [filteredListings, selectedCity]);

  // Saved Listings list
  // The server's own list of saved listings, so an ad saved from another city
  // (not in the current feed) still shows. savedIds reflects a tap instantly.
  const savedListings = useMemo(() => {
    return savedProducts.filter((item) => savedIds.includes(item.id));
  }, [savedProducts, savedIds]);

  // My Listings list (listings posted by the user)
  // "My Ads" comes from GET /api/my-listings - the server knows what the user
  // owns. Matching seller names against the public feed was a guess.
  const [myListings, setMyListings] = useState<Listing[]>([]);

  const refreshMyListings = useCallback(async () => {
    if (!userProfile.isAuthenticated) {
      setMyListings([]);
      return;
    }
    try {
      setMyListings(await sellApi.getMyListings());
    } catch {
      // Keep whatever we last had rather than blanking the tab.
    }
  }, [userProfile.isAuthenticated, userProfile.id]);

  useEffect(() => {
    if (!sessionResolved) return;
    refreshMyListings();
  }, [refreshMyListings, sessionResolved]);

  // --- Chat -------------------------------------------------------------
  const [chatBlockedReason, setChatBlockedReason] = useState<
    'signin' | 'no-seller' | 'own-listing' | 'not-your-listing' | null
  >(null);
  const [chatSendError, setChatSendError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  // If the session can't be refreshed, stop showing the user as signed in.
  const sessionVerifiedRef = useRef<boolean>(false);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      const hadSession = sessionVerifiedRef.current;
      sessionVerifiedRef.current = false;
      clearSessionCookies();
      setUserProfile(dealbrizStorage.clearActiveUser());
      setMyListings([]);
      setChats([]);
      if (hadSession) {
        setToast('Your session expired. Please sign in again.');
      }
    });
  }, []);

  const activeChatIdRef = useRef<string | null>(null);
  activeChatIdRef.current = activeChat?.id ?? null;

  // Load the real inbox for the signed-in user.
  /** Reloads the inbox; returns it, or null if it couldn't be loaded. */
  const refreshInbox = useCallback(async (): Promise<ChatConversation[] | null> => {
    if (!userProfile.isAuthenticated || !userProfile.id) {
      setChats([]);
      return null;
    }
    try {
      const inbox = await loadInbox(listings, userProfile.id);
      // The chat on screen is being read right now; its poll marks new
      // messages read within seconds, so don't flash it as unread meanwhile.
      const openId = activeChatIdRef.current;
      setChats(openId ? inbox.map((c) => (c.id === openId ? { ...c, unreadCount: 0 } : c)) : inbox);
      return inbox;
    } catch {
      // Leave whatever is on screen; the offline banner already explains.
      return null;
    }
  }, [userProfile.isAuthenticated, userProfile.id, listings]);

  useEffect(() => {
    if (!sessionResolved) return;
    refreshInbox();
  }, [refreshInbox, sessionResolved]);

  const openThreadFromInbox = useCallback(
    async (chat: ChatConversation) => {
      const parsed = parseThreadId(chat.id);
      if (!parsed || !userProfile.id) return;
      // The other person's number comes only from a fresh inbox load. The
      // copy in the list could be minutes old, and kept offering a call after
      // they'd hidden their number.
      setActiveChat((prev) =>
        prev && prev.id === chat.id ? { ...prev, otherUserPhone: undefined } : prev
      );
      refreshInbox().then((inbox) => {
        const fresh = inbox?.find((c) => c.id === chat.id);
        if (!fresh) return;
        setActiveChat((prev) =>
          prev && prev.id === chat.id ? { ...prev, otherUserPhone: fresh.otherUserPhone } : prev
        );
      });
      try {
        const messages = await loadThreadMessages(
          parsed.productId,
          parsed.otherUserId,
          userProfile.id
        );
        setActiveChat((prev) => (prev && prev.id === chat.id ? { ...prev, messages } : prev));
        setChats((prev) => prev.map((c) => (c.id === chat.id ? { ...c, messages } : c)));
        markThreadRead(parsed.productId, parsed.otherUserId).catch(() => {});
      } catch {
        // offline
      }
    },
    [userProfile.id, refreshInbox]
  );

  /**
   * Chat push notifications.
   *
   * Tap: open that thread. A tap that cold-started the app is held by the
   * service until this handler is set, then waits here until the session is
   * resolved, since the inbox can't load before that.
   *
   * Foreground: if the thread is already open on screen, don't show a banner
   * (the 4s poll below will show the message); otherwise let it display and
   * refresh the inbox so the unread badge updates.
   */
  const [pendingPushThread, setPendingPushThread] = useState<PushChatTarget | null>(null);
  const activeChatMessagesRef = useRef<ChatConversation['messages'] | null>(null);
  activeChatMessagesRef.current = activeChat?.messages ?? null;
  const refreshInboxRef = useRef(refreshInbox);
  refreshInboxRef.current = refreshInbox;

  /**
   * Keep the inbox and the Chats badge current.
   *
   * They were loaded once at launch and then only on pull-to-refresh, so a
   * new message didn't show until the user did that (only an OPEN chat
   * polled). Now, while the app is on screen:
   *  - every 10s, GET /notifications/summary (two COUNTs on the server,
   *    built for polling); when the unread-message count changes, reload
   *    the inbox;
   *  - every 60s, reload the inbox anyway, in case a message arrived and
   *    another was read in the same interval, leaving the count unchanged;
   *  - on returning to the app, reload at once (Android pauses timers in
   *    the background).
   * Nothing runs while signed out, or while the app is in the background.
   */
  const lastUnreadChatsRef = useRef<number | null>(null);
  useEffect(() => {
    if (!sessionResolved || !userProfile.isAuthenticated || !userProfile.id) {
      lastUnreadChatsRef.current = null;
      return;
    }
    let stopped = false;
    let ticks = 0;
    const check = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      ticks += 1;
      const summary = await notificationsApi.getSummary();
      if (stopped || !summary) return;
      const changed =
        lastUnreadChatsRef.current !== null && summary.chats !== lastUnreadChatsRef.current;
      lastUnreadChatsRef.current = summary.chats;
      if (changed || ticks % 6 === 0) refreshInboxRef.current().catch(() => {});
    };
    check();
    const interval = window.setInterval(check, 10000);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      refreshInboxRef.current().catch(() => {});
      check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sessionResolved, userProfile.isAuthenticated, userProfile.id]);

  // Opening the Chats tab shows the current inbox, not the one from launch.
  useEffect(() => {
    if (activeTab === 'chats' && sessionResolved) refreshInboxRef.current().catch(() => {});
  }, [activeTab, sessionResolved]);

  useEffect(() => {
    oneSignalService.setChatOpenHandler((t) => setPendingPushThread(t));
    oneSignalService.setForegroundChatHandler((t) => {
      const id = threadId(t.productId, t.otherUserId);
      if (activeChatIdRef.current === id) return true;
      refreshInboxRef.current().catch(() => {});
      return false;
    });
    return () => {
      oneSignalService.setChatOpenHandler(null);
      oneSignalService.setForegroundChatHandler(null);
    };
  }, []);

  useEffect(() => {
    if (!pendingPushThread || !sessionResolved) return;
    const target = pendingPushThread;
    setPendingPushThread(null);
    if (!userProfile.isAuthenticated || !userProfile.id) return;

    const id = threadId(target.productId, target.otherUserId);
    setActiveTab('chats');
    (async () => {
      let chat = chats.find((c) => c.id === id);
      if (!chat) {
        // A brand-new conversation won't be in the inbox we already have.
        try {
          const inbox = await loadInbox(listings, userProfile.id);
          setChats(inbox);
          chat = inbox.find((c) => c.id === id);
        } catch {
          // offline - leave the user on the Chats tab
        }
      }
      if (!chat) return;
      setChatListingContext(listings.find((l) => l.id === chat!.listingId) || null);
      setChats((prev) => prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)));
      setActiveChat({ ...chat, unreadCount: 0 });
      openThreadFromInbox(chat);
    })();
  }, [pendingPushThread, sessionResolved, userProfile.isAuthenticated, userProfile.id, chats, listings, openThreadFromInbox]);

  // Poll the open thread every 4s (Section 3.7) so the other person's replies
  // arrive without a manual refresh. Delivery is poll-based - there is no push.
  useEffect(() => {
    if (!activeChat || !userProfile.id) return;
    const parsed = parseThreadId(activeChat.id);
    if (!parsed) return;

    const threadKey = activeChat.id;
    const interval = window.setInterval(async () => {
      try {
        const messages = await loadThreadMessages(
          parsed.productId,
          parsed.otherUserId,
          userProfile.id!
        );
        // A message that arrives while this thread is on screen has been
        // seen. Without this it stayed unread on the server, so the dot came
        // back on the inbox as soon as the chat was closed.
        const known = new Set((activeChatMessagesRef.current || []).map((m) => m.id));
        if (messages.some((m) => m.sender === 'seller' && !known.has(m.id))) {
          markThreadRead(parsed.productId, parsed.otherUserId).catch(() => {});
          setChats((prev) => prev.map((c) => (c.id === threadKey ? { ...c, unreadCount: 0 } : c)));
        }
        setActiveChat((prev) => {
          if (!prev || prev.id !== threadKey) return prev;
          // Don't clobber an optimistic bubble that hasn't come back yet.
          const hasPending = prev.messages.some((m) => m.id.startsWith('pending-'));
          if (hasPending && messages.length < prev.messages.length) return prev;
          if (messages.length === prev.messages.length) return prev;
          return { ...prev, messages };
        });
      } catch {
        // ignore a dropped poll
      }
    }, 4000);

    return () => window.clearInterval(interval);
  }, [activeChat?.id, userProfile.id]);

  // Handlers
  const handleToggleSave = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Saves belong to an account, as on the website.
    if (!userProfile.isAuthenticated || !userProfile.id) {
      setToast('Sign in to save items to your account.');
      handleOpenAuth('login');
      return;
    }
    const wasSaved = savedIds.includes(id);
    // Flip at once so the heart responds; undo if the server says no.
    setSavedIds((prev) => (wasSaved ? prev.filter((x) => x !== id) : [...prev, id]));
    if (!wasSaved) {
      const known = listings.find((l) => l.id === id) || myListings.find((l) => l.id === id);
      if (known) setSavedProducts((prev) => [known, ...prev.filter((p) => p.id !== id)]);
    }
    try {
      if (wasSaved) await savedApi.unsave(id);
      else await savedApi.save(id);
      refreshSaved().catch(() => {});
    } catch (err: any) {
      setSavedIds((prev) => (wasSaved ? [...prev, id] : prev.filter((x) => x !== id)));
      setToast(
        err?.status === 0
          ? "Couldn't reach DealBriz. Check your connection and try again."
          : wasSaved
            ? "Couldn't remove this item. Please try again."
            : "Couldn't save this item. Please try again."
      );
    }
  };

  const handleCityChange = (city: string) => {
    setSelectedCity(city);
    dealbrizStorage.setSelectedCity(city);
    // Picking a real city also tells us where they are. "All Cities" only
    // widens the filter - it is not a statement that they moved.
    if (city && city !== 'All Cities') {
      setHomeCity(city);
      dealbrizStorage.setHomeCity(city);
    }
  };

  const handleSelectCategory = (cat: CategoryId) => {
    // Tapping the category you're already in clears the filter.
    setSelectedCategory((prev) => (prev === cat && cat !== 'all' ? 'all' : cat));
    if (activeTab === 'categories') {
      setActiveTab('home');
    }
  };

  const handleOpenChat = async (listing: Listing) => {
    // Real messaging needs both parties to be identifiable accounts.
    if (!userProfile.isAuthenticated || !userProfile.id) {
      setActiveListing(null);
      setChatBlockedReason('signin');
      return;
    }

    const sellerId = listing.seller_id;
    if (!sellerId) {
      setActiveListing(null);
      setChatBlockedReason('no-seller');
      return;
    }

    if (String(sellerId) === String(userProfile.id)) {
      setActiveListing(null);
      setChatBlockedReason('own-listing');
      return;
    }

    const id = threadId(listing.id, sellerId);
    const existing = chats.find((c) => c.id === id);
    const thread = conversationForListing(listing, sellerId, existing);

    setChatListingContext(listing);
    setActiveListing(null);
    setActiveChat(thread);

    // Pull the real history for this thread.
    try {
      const messages = await loadThreadMessages(listing.id, sellerId, userProfile.id);
      const withHistory = { ...thread, messages, unreadCount: 0 };
      setActiveChat(withHistory);
      setChats((prev) => {
        const rest = prev.filter((c) => c.id !== id);
        return [withHistory, ...rest];
      });
      markThreadRead(listing.id, sellerId).catch(() => {});
    } catch {
      // Offline: the thread opens empty rather than showing invented messages.
    }
  };

  const handleSendMessage = async (conversationId: string, text: string, offerAmount?: number) => {
    const parsed = parseThreadId(conversationId);
    if (!parsed || !userProfile.id) return;

    const { productId, otherUserId } = parsed;

    // Optimistic append so the bubble appears immediately.
    const pending: ChatMessage = {
      id: `pending-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isOffer: Boolean(offerAmount),
      offerAmount,
    };

    setActiveChat((prev) =>
      prev && prev.id === conversationId
        ? { ...prev, messages: [...prev.messages, pending], lastUpdated: new Date().toISOString() }
        : prev
    );

    try {
      await sendThreadMessage(productId, otherUserId, text, offerAmount);
      const messages = await loadThreadMessages(productId, otherUserId, userProfile.id);
      setActiveChat((prev) => (prev && prev.id === conversationId ? { ...prev, messages } : prev));
      setChats((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, messages, lastUpdated: new Date().toISOString() } : c))
      );
    } catch {
      setChatSendError("Message not sent — check your connection and try again.");
      setActiveChat((prev) =>
        prev && prev.id === conversationId
          ? { ...prev, messages: prev.messages.filter((m) => m.id !== pending.id) }
          : prev
      );
    }
  };

  /**
   * Everything that opens the sell form goes through here. A signed-out user
   * is sent to signup first, and only a user who arrived that way is dropped
   * back into the sell form once the account exists.
   */
  const [pendingSellAfterAuth, setPendingSellAfterAuth] = useState<boolean>(false);

  const openSellFlow = () => {
    setEditingListing(null);
    if (!userProfile.isAuthenticated) {
      setPendingSellAfterAuth(true);
      setAuthModalMode('signup');
      setShowAuthModal(true);
      return;
    }
    setShowSellModal(true);
  };

  const openDealBrizWebsite = () => {
    // Opens in the phone's browser rather than inside the app's web view.
    window.open(DEALBRIZ_ORIGIN, '_blank', 'noopener,noreferrer');
  };

  const handleOpenEmi = (listing: Listing) => {
    setEmiListingContext(listing);
    setShowEmiModal(true);
  };

  /** Turns a failed save into the message the Sell form shows. */
  const saveErrorMessage = (err: any, editing: boolean) =>
    err?.status === 0
      ? `Your ad wasn't ${editing ? 'saved' : 'posted'} - no connection to DealBriz. Your details are still here; try again when you're online.`
      : err?.data?.error || err?.message || `Your ad wasn't ${editing ? 'saved' : 'posted'}. Please try again.`;

  /**
   * Resolves once the server has the ad; throws (with a message for the
   * form) if it doesn't. The Sell form stays open until then - it used to
   * close before the request, so a failed post lost everything typed.
   */
  const handlePostListing = async (newListing: Listing): Promise<void> => {
    if (!userProfile.isAuthenticated) {
      setShowSellModal(false);
      setChatBlockedReason('signin');
      return;
    }

    // An edit carries the listing's real id, so it goes to
    // PUT /api/my-listings/<id>; only a new ad goes to POST /api/sell.
    const isExisting =
      Boolean(newListing.id) &&
      !newListing.id.startsWith('local-') &&
      myListings.some((m) => m.id === newListing.id);

    let saved: Listing;
    try {
      saved = isExisting
        ? await sellApi.updateListing(newListing.id, newListing)
        : await sellApi.createListing(newListing);
    } catch (err: any) {
      throw new Error(saveErrorMessage(err, isExisting));
    }

    setShowSellModal(false);
    setEditingListing(null);
    const merged = [saved, ...listings.filter((l) => l.id !== newListing.id)];
    setListings(merged);
    dealbrizStorage.saveListings(merged);
    setActiveListing(saved);
    loadLiveListings().catch(() => {});
    refreshMyListings().catch(() => {});
  };

  /**
   * The seller's number on the listing page comes only from a fresh
   * GET /api/buy/<id> made when the page opens. The listing list (in memory
   * and cached on the phone) carries no numbers, so a number the seller has
   * since hidden can't be shown from an old copy.
   */
  const [phoneCheck, setPhoneCheck] = useState<{
    id: string;
    status: 'loading' | 'ok' | 'failed';
    phone: string;
  } | null>(null);
  useEffect(() => {
    const id = activeListing?.id;
    if (!id || id.startsWith('local-')) {
      setPhoneCheck(null);
      return;
    }
    let cancelled = false;
    setPhoneCheck({ id, status: 'loading', phone: '' });
    buyApi
      .getListing(id)
      .then((fresh) => {
        if (cancelled) return;
        setPhoneCheck({ id, status: 'ok', phone: fresh.show_phone ? fresh.seller_phone || '' : '' });
        // Price, status and the rest may have changed too.
        setActiveListing((prev) =>
          prev && prev.id === id ? { ...prev, ...fresh, seller_phone: '' } : prev
        );
      })
      .catch(() => {
        if (!cancelled) setPhoneCheck({ id, status: 'failed', phone: '' });
      });
    return () => {
      cancelled = true;
    };
  }, [activeListing?.id]);

  const handleOpenEditModal = (listing: Listing) => {
    // Second gate behind the hidden button: never open the editor for an ad
    // that isn't the signed-in user's.
    const owns = myListings.some((m) => m.id === listing.id);
    if (!owns) {
      setChatBlockedReason('not-your-listing');
      return;
    }
    setEditingListing(listing);
    setShowSellModal(true);
  };

  const handleCloseSellModal = () => {
    setShowSellModal(false);
    setEditingListing(null);
  };

  const handleUpdateListing = async (updatedListing: Listing): Promise<void> => {
    if (!myListings.some((m) => m.id === updatedListing.id)) {
      setShowSellModal(false);
      setEditingListing(null);
      setChatBlockedReason('not-your-listing');
      return;
    }

    let saved: Listing;
    try {
      saved = await sellApi.updateListing(updatedListing.id, updatedListing);
    } catch (err: any) {
      // Form stays open with the seller's changes.
      throw new Error(saveErrorMessage(err, true));
    }

    setShowSellModal(false);
    setEditingListing(null);
    const merged = listings.map((l) => (l.id === saved.id ? saved : l));
    setListings(merged);
    dealbrizStorage.saveListings(merged);
    if (activeListing && activeListing.id === saved.id) {
      setActiveListing(saved);
    }
    refreshMyListings().catch(() => {});
  };

  const handleDeleteListing = async (id: string) => {
    if (!myListings.some((m) => m.id === id)) {
      setChatBlockedReason('not-your-listing');
      return;
    }

    try {
      await sellApi.deleteListing(id);
      const updated = dealbrizStorage.deleteListing(id);
      setListings(updated);
      if (activeListing && activeListing.id === id) {
        setActiveListing(null);
      }
      refreshMyListings().catch(() => {});
    } catch (err: any) {
      setToast(err?.data?.error || 'Could not delete this ad. Please try again.');
    }
  };

  const handleToggleListingStatus = async (id: string) => {
    const target = listings.find((l) => l.id === id) || myListings.find((l) => l.id === id);
    if (!target) return;
    if (!myListings.some((m) => m.id === id)) {
      setChatBlockedReason('not-your-listing');
      return;
    }

    const newStatus = target.status === 'sold' ? 'active' : 'sold';
    try {
      // Section 3.4 uses dedicated sell/unsell endpoints.
      await sellApi.setSoldStatus(id, newStatus === 'sold');
      const updatedListing: Listing = { ...target, status: newStatus };
      const updated = dealbrizStorage.updateListing(updatedListing);
      setListings(updated);
      if (activeListing && activeListing.id === id) {
        setActiveListing(updatedListing);
      }
      refreshMyListings().catch(() => {});
    } catch (err: any) {
      setToast(err?.data?.error || 'Could not update this ad. Please try again.');
    }
  };

  const handleMarkAsSold = (id: string) => {
    handleToggleListingStatus(id);
  };

  const refreshSaved = useCallback(async () => {
    if (!userProfile.isAuthenticated || !userProfile.id) {
      setSavedIds([]);
      setSavedProducts([]);
      return;
    }
    try {
      // Saves made in the app before this update exist only on this phone.
      // Move them to the account once, then forget the phone copy.
      const legacy = dealbrizStorage.getSavedIds().filter((id) => id && !id.startsWith('local-'));
      if (legacy.length) {
        await Promise.all(legacy.map((id) => savedApi.save(id).catch(() => {})));
        dealbrizStorage.clearLegacySavedIds();
      }
      const list = await savedApi.getSaved();
      setSavedProducts(list);
      setSavedIds(list.map((l) => l.id));
    } catch {
      // Offline: keep what's shown.
    }
  }, [userProfile.isAuthenticated, userProfile.id]);

  useEffect(() => {
    if (!sessionResolved) return;
    refreshSaved();
  }, [refreshSaved, sessionResolved]);

  const refreshEmiApps = useCallback(async () => {
    if (!userProfile.isAuthenticated || !userProfile.id) {
      setEmiApps([]);
      return;
    }
    try {
      setEmiApps(await emiApi.getMyApplications());
    } catch {
      // Keep what's on screen; nothing is invented while offline.
    }
  }, [userProfile.isAuthenticated, userProfile.id]);

  useEffect(() => {
    if (!sessionResolved) return;
    refreshEmiApps();
  }, [refreshEmiApps, sessionResolved]);

  const handleEmiApplicationSubmit = (app: EmiApplication) => {
    // Called only after the server accepted it; show it at once, then
    // replace with the server's list.
    setEmiApps((prev) => [app, ...prev.filter((a) => a.id !== app.id)]);
    refreshEmiApps();
  };

  const handleMakeOfferFromDetail = (listing: Listing, offerPrice: number) => {
    handleOpenChat(listing);
    setTimeout(() => {
      handleSendMessage(
        `chat-${listing.id}`,
        `I would like to make an offer of ₹${offerPrice.toLocaleString('en-IN')}`,
        offerPrice
      );
    }, 300);
  };

  const handleMarkAllRead = () => {
    setNotifications(notifications.map((n) => ({ ...n, read: true })));
  };

  const unreadChatsCount = useMemo(() => {
    return chats.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  }, [chats]);

  // Leaving the results screen also clears whatever put us there, so the home
  // feed is never left silently filtered.
  const closeResultsView = useCallback(() => {
    setShowSearchResults(false);
    setCategoryResultsFor(null);
    setSelectedCategory('all');
    setFilters((prev) => ({ ...prev, searchQuery: '' }));
  }, []);

  closeResultsViewRef.current = closeResultsView;

  // Which side of the open thread the signed-in user is on. Buyers only reach
  // a chat from a listing, and that path already refuses your own listings;
  // sellers arrive at the same thread from the inbox. myListings is checked
  // first because a sold or removed listing can be missing from the public
  // feed, which would leave chatListingContext null.
  const activeChatRole: 'buyer' | 'seller' = useMemo(() => {
    if (!activeChat) return 'buyer';
    if (myListings.some((l) => l.id === activeChat.listingId)) return 'seller';
    if (
      chatListingContext?.seller_id &&
      String(chatListingContext.seller_id) === String(userProfile.id)
    ) {
      return 'seller';
    }
    return 'buyer';
  }, [activeChat, chatListingContext, myListings, userProfile.id]);

  const unreadNotificationsCount = useMemo(() => {
    return notifications.filter((n) => !n.read).length;
  }, [notifications]);

  return (
    <AndroidFrame onInstallPwaClick={() => setShowInstallModal(true)}>
      {/* Top App Bar with Logo, Location & Search */}
      <AndroidTopBar
        selectedCity={selectedCity}
        onSelectCity={handleCityChange}
        searchQuery={filters.searchQuery}
        onSearchChange={(q) => {
          setFilters({ ...filters, searchQuery: q });
          if (q.trim()) {
            setCategoryResultsFor(null);
            setShowSearchResults(true);
          }
        }}
        onOpenFilters={() => setShowFilterModal(true)}
        unreadNotificationsCount={unreadNotificationsCount}
        onOpenNotifications={() => setShowNotificationsModal(true)}
        userProfile={userProfile}
        onOpenAuth={handleOpenAuth}
        onNavigateProfile={() => setActiveTab('profile')}
      />

      {/* VIEW 1: HOME FEED */}
      {showSearchResults && (
        <SearchResultsView
          query={filters.searchQuery}
          onQueryChange={(q) => setFilters({ ...filters, searchQuery: q })}
          categoryLabel={
            categoryResultsFor
              ? CATEGORIES.find((c) => c.id === categoryResultsFor)?.name || 'Category'
              : undefined
          }
          results={filteredListings}
          savedIds={savedIds}
          onToggleSave={handleToggleSave}
          onSelectListing={(l) => setActiveListing(l)}
          onOpenFilters={() => setShowFilterModal(true)}
          onBack={closeResultsView}
        />
      )}

      {showOnboarding && (
        <OnboardingScreen
          onGetStarted={() => dismissOnboarding(false)}
          onSignIn={() => dismissOnboarding(true)}
        />
      )}

      {!showSearchResults && activeTab === 'home' && (
        <PullToRefresh
          className="pb-28"
          onRefresh={async () => {
            await Promise.all([
              loadLiveListings().catch(() => {}),
              refreshMyListings().catch(() => {}),
              refreshInbox().catch(() => {}),
            ]);
          }}
        >
          {/* Promo banner */}
          <div className="px-3.5 pt-3 pb-2">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-4 shadow-lg shadow-blue-600/20">
              <div className="absolute -right-8 -bottom-10 w-40 h-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
              <div className="absolute -right-2 -top-8 w-24 h-24 rounded-full bg-sky-300/20 blur-xl pointer-events-none" />

              <div className="relative z-10 max-w-[78%]">
                <h2 className="text-xl font-black tracking-tight text-white leading-tight">
                  Upgrade Your Everyday
                </h2>
                <p className="text-xs text-blue-100 mt-1 leading-relaxed">
                  Buy. Sell. Discover. All Near You.
                </p>

                <div className="mt-3.5 flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('categories')}
                    className="bg-white hover:bg-blue-50 text-blue-700 text-xs font-extrabold px-4 py-2 rounded-full shadow-md active:scale-95 transition-all flex items-center gap-1.5"
                  >
                    <span>Explore Deals</span>
                    <ArrowRight className="w-3.5 h-3.5 stroke-[3]" />
                  </button>
                  <button
                    onClick={() => {
                      setEmiListingContext(null);
                      setShowEmiModal(true);
                    }}
                    className="bg-white/15 hover:bg-white/25 text-white text-xs font-bold px-3 py-2 rounded-full backdrop-blur-xs border border-white/25 active:scale-95 transition-all flex items-center gap-1"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-300 fill-current" />
                    <span>EMI</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Deals Near You - horizontal rail */}
          {filteredListings.length > 0 && (
            <div className="pt-1 pb-1">
              <div className="px-3.5 flex items-center justify-between mb-2">
                <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                  Deals Near You
                </h3>
                <button
                  onClick={() => setActiveTab('categories')}
                  className="text-[11px] font-bold text-blue-600 flex items-center gap-0.5"
                >
                  See All <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex gap-2.5 overflow-x-auto no-scrollbar px-3.5 pb-1">
                {filteredListings.slice(0, 10).map((l) => (
                  <button
                    key={`rail-${l.id}`}
                    onClick={() => setActiveListing(l)}
                    className="shrink-0 w-36 bg-white rounded-2xl border border-slate-200 overflow-hidden text-left shadow-sm active:scale-[0.98] transition-transform"
                  >
                    <div className="w-full h-24 bg-slate-100 overflow-hidden">
                      <img
                        src={l.image_url?.trim() || defaultListingImage(l.title, l.category)}
                        alt={l.title}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-black text-slate-900 truncate">
                        ₹{Number(l.price || 0).toLocaleString('en-IN')}
                      </p>
                      <p className="text-[11px] text-slate-600 truncate mt-0.5">{l.title}</p>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">{l.location}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}


          {/* Section 1 & 2.2: OpenStreetMap Tile Service via Leaflet & Geolocation */}
          <ListingsNearYouMap
            listings={filteredListings}
            selectedCity={selectedCity}
            profileCity={userProfile.city || homeCity}
            onSelectCity={handleCityChange}
            onSelectListing={(l) => setActiveListing(l)}
          />

          {/* Active Filter Indicators */}
          {(selectedCategory !== 'all' ||
            selectedCity !== 'All Cities' ||
            filters.searchQuery ||
            filters.emiOnly) && (
            <div className="px-3.5 py-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
              <span className="text-[11px] text-slate-500 font-semibold">Active:</span>

              {selectedCategory !== 'all' && (
                <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full text-[11px] font-medium flex items-center gap-1">
                  <span>{selectedCategory}</span>
                  <button
                    onClick={() => setSelectedCategory('all')}
                    className="text-blue-700 hover:text-slate-900"
                  >
                    ×
                  </button>
                </span>
              )}

              {selectedCity !== 'All Cities' && (
                <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full text-[11px] font-medium flex items-center gap-1">
                  <span>{selectedCity}</span>
                  <button
                    onClick={() => handleCityChange('All Cities')}
                    className="text-blue-700 hover:text-slate-900"
                  >
                    ×
                  </button>
                </span>
              )}

              {filters.emiOnly && (
                <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full text-[11px] font-medium">
                  EMI Only
                </span>
              )}

              <button
                onClick={() => {
                  setSelectedCategory('all');
                  handleCityChange('All Cities');
                  setFilters({
                    ...filters,
                    searchQuery: '',
                    emiOnly: false,
                    condition: null,
                  });
                }}
                className="text-[11px] text-slate-500 hover:text-slate-900 underline ml-1"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Connection status */}
          {isOffline && (
            <div className="px-3.5 pt-2">
              <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-amber-500/10 border border-amber-200">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  {listings.length > 0 ? (
                    <>
                      <p className="text-[11px] font-bold text-amber-700">Showing saved listings</p>
                      <p className="text-[10px] text-amber-700/70 leading-tight">
                        Couldn't reach DealBriz. Prices and availability may be out of date.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-[11px] font-bold text-amber-700">Couldn't load listings</p>
                      <p className="text-[10px] text-amber-700/70 leading-tight">
                        Check your internet connection and tap Retry.
                      </p>
                    </>
                  )}
                </div>
                <button
                  onClick={() => {
                    loadLiveListings().catch(() => setIsOffline(true));
                  }}
                  disabled={isLoadingLive}
                  className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-amber-400 text-slate-950 disabled:opacity-60 shrink-0"
                >
                  {isLoadingLive ? 'Retrying…' : 'Retry'}
                </button>
              </div>
            </div>
          )}

          {/* Listings Feed Header */}
          <div className="px-3.5 pt-3 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <h3 className="font-extrabold text-sm text-slate-900 tracking-tight">Fresh Recommendations</h3>
              <span className="text-[10px] text-slate-500">({filteredListings.length} deals)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const el = document.getElementById('dealbriz-live-map');
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }}
                className="text-[11px] text-blue-400 hover:text-blue-700 font-semibold flex items-center gap-1 bg-blue-600/10 px-2 py-1 rounded-lg border border-blue-200 active:scale-95 transition-all"
              >
                <MapPin className="w-3 h-3" />
                <span>View on Map</span>
              </button>
              <button
                onClick={() => setShowFilterModal(true)}
                className="text-[11px] text-slate-600 hover:text-slate-900 font-semibold"
              >
                Filter & Sort
              </button>
            </div>
          </div>

          {/* Listings Grid (Responsive Android 2-Column Grid) */}
          <div className="px-3 pb-6">
            {filteredListings.length === 0 && isLoadingLive ? (
              <div className="grid grid-cols-2 gap-2.5">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-52 rounded-2xl bg-white border border-slate-200 animate-pulse"
                  />
                ))}
              </div>
            ) : filteredListings.length === 0 && isOffline && listings.length === 0 ? (
              // Nothing to show yet because the server hasn't answered - not
              // "no results", so don't suggest changing filters.
              <div className="text-center py-12 px-4 bg-white rounded-3xl border border-slate-200 my-4 space-y-2">
                <AlertCircle className="w-10 h-10 text-slate-400 mx-auto" />
                <h4 className="font-bold text-slate-900 text-sm">No connection to DealBriz</h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Listings will appear here once you're back online.
                </p>
              </div>
            ) : filteredListings.length === 0 ? (
              <div className="text-center py-12 px-4 bg-white rounded-3xl border border-slate-200 my-4 space-y-3">
                <AlertCircle className="w-10 h-10 text-slate-500 mx-auto" />
                <h4 className="font-bold text-slate-900 text-sm">No listings found</h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Try adjusting your search keywords, clearing your filters, or browsing other categories.
                </p>
                <button
                  onClick={() => {
                    setSelectedCategory('all');
                    handleCityChange('All Cities');
                    setFilters({
                      category: 'all',
                      searchQuery: '',
                      city: 'All Cities',
                      minPrice: null,
                      maxPrice: null,
                      condition: null,
                      emiOnly: false,
                      sortBy: 'recommended',
                    });
                  }}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-xl shadow"
                >
                  Reset All Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {filteredListings.map((item, index) => (
                  <React.Fragment key={item.id}>
                    {selectedCity !== 'All Cities' && index === localListingCount && (
                      <div className="col-span-2 flex items-center gap-2.5 py-2">
                        <span className="h-px flex-1 bg-slate-100" />
                        <span className="text-[10px] text-slate-500 font-semibold text-center px-1">
                          {localListingCount === 0
                            ? `No listings in ${selectedCity} yet — showing other areas`
                            : `That's everything in ${selectedCity} — more from other areas`}
                        </span>
                        <span className="h-px flex-1 bg-slate-100" />
                      </div>
                    )}
                    <ListingCard
                      listing={item}
                      isSaved={savedIds.includes(item.id)}
                      onToggleSave={handleToggleSave}
                      onClick={(it) => setActiveListing(it)}
                    />
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>

          {/* DealBriz Trust & Safety Banner */}
          <div className="px-3 pb-4">
            <div className="p-3.5 bg-white border border-slate-200 rounded-2xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div className="text-xs">
                <h5 className="font-bold text-slate-900">Trade safely</h5>
                <p className="text-slate-500 text-[11px] leading-tight mt-0.5">
                  Chat in the app, meet in a public place, inspect before you pay, and never pay in advance.
                </p>
              </div>
            </div>
          </div>
        </PullToRefresh>
      )}

      {/* VIEW 2: CATEGORIES SCREEN */}
      {!showSearchResults && activeTab === 'categories' && (
        <PullToRefresh
          className="p-4 space-y-4 pb-28"
          onRefresh={async () => {
            await loadLiveListings().catch(() => {});
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">All Categories</h3>
              <p className="text-xs text-slate-500">Browse listings by category</p>
            </div>
            <button
              onClick={() => handleSelectCategory('all')}
              className="text-xs text-blue-600 font-bold"
            >
              View All
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {CATEGORIES.filter((c) => c.id !== 'all').map((cat) => {
              const count = categoryCounts[cat.id] || 0;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    setFilters({ ...filters, searchQuery: '' });
                    setCategoryResultsFor(cat.id);
                    setShowSearchResults(true);
                  }}
                  className="p-3.5 bg-white hover:bg-slate-100 border border-slate-200 hover:border-blue-200 rounded-2xl text-left transition-all group shadow-md flex flex-col justify-between h-28"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-2xl p-2 rounded-xl bg-white border border-slate-200 group-hover:scale-110 transition-transform">
                      {cat.emoji}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {count} items
                    </span>
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-slate-900 group-hover:text-blue-600 transition-colors">
                      {cat.name}
                    </h4>
                    <p className="text-[10px] text-slate-500 line-clamp-1">{cat.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Popular searches suggestions */}
          <div className="pt-2">
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
              Trending Searches on DealBriz
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {[
                'iPhone X',
                'Ford Figo',
                'Royal Enfield',
                'MacBook M2',
                'Honda City',
                'Sofa Set',
                'Sector 34 Chandigarh',
                'EMI Cars',
              ].map((term, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setFilters({ ...filters, searchQuery: term });
                    setActiveTab('home');
                  }}
                  className="text-xs bg-white border border-slate-200 text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-xl transition-colors"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
        </PullToRefresh>
      )}

      {/* VIEW 3: SELL FLOW (Invoked via FAB or navigation) */}
      {!showSearchResults && activeTab === 'sell' && (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center p-6 text-center space-y-4 pb-24">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-xl shadow-blue-600/30">
            <Plus className="w-8 h-8 stroke-[3]" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900">List Your Item on DealBriz</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">
              Reach thousands of buyers in {selectedCity}. Get cash for your unused phone, car, bike, or electronics.
            </p>
          </div>
          <button
            onClick={openSellFlow}
            className="w-full max-w-xs bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-blue-600/30 active:scale-95 transition-all text-xs"
          >
            Create New Listing Now
          </button>
        </div>
      )}

      {/* VIEW 4: CHATS TAB (My Chats - exactly matching website) */}
      {!showSearchResults && activeTab === 'chats' && (
        <PullToRefresh
          className="p-4 space-y-3 pb-28"
          onRefresh={async () => {
            await Promise.all([
              refreshInbox().catch(() => {}),
              loadLiveListings().catch(() => {}),
            ]);
          }}
        >
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">Chats</h3>
            <div className="relative mt-2.5">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={chatSearch}
                onChange={(e) => setChatSearch(e.target.value)}
                placeholder="Search conversations..."
                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 shadow-sm"
              />
            </div>
          </div>

          {chats.length === 0 ? (
            <div className="text-center py-16 space-y-3 bg-white rounded-3xl border border-slate-200 p-6">
              <div className="w-14 h-14 rounded-2xl bg-blue-600/10 border border-blue-200 text-blue-400 flex items-center justify-center mx-auto">
                <MessageSquare className="w-7 h-7" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">No chats yet</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                  Start a chat by clicking "Chat with Seller" on any listing.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('home')}
                className="mt-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 active:scale-95 transition-all inline-flex items-center gap-2"
              >
                <span>Browse Listings</span>
              </button>
            </div>
          ) : (
            chats
              .filter((c) => {
                const q = chatSearch.trim().toLowerCase();
                if (!q) return true;
                return (
                  (c.sellerName || '').toLowerCase().includes(q) ||
                  (c.listingTitle || '').toLowerCase().includes(q)
                );
              })
              .map((chat) => {
              const lastMsg = chat.messages[chat.messages.length - 1];
              const isUnread = (chat.unreadCount || 0) > 0;
              return (
                <div
                  key={chat.id}
                  onClick={() => {
                    const matchedListing = listings.find((l) => l.id === chat.listingId);
                    setChatListingContext(matchedListing || null);
                    if (isUnread) {
                      setChats((prev) =>
                        prev.map((c) => (c.id === chat.id ? { ...c, unreadCount: 0 } : c))
                      );
                    }
                    setActiveChat({ ...chat, unreadCount: 0 });
                    openThreadFromInbox(chat);
                  }}
                  className={`p-3.5 border rounded-2xl flex items-center gap-3.5 cursor-pointer shadow-sm active:scale-[0.99] transition-all relative ${
                    isUnread
                      ? 'border-blue-300 bg-blue-50 hover:bg-blue-100'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  {/* Seller Avatar */}
                  <div className="relative shrink-0">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white text-sm overflow-hidden border border-slate-300">
                      {chat.sellerAvatar?.trim() ? (
                        <img
                          src={chat.sellerAvatar.trim()}
                          alt={chat.sellerName}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <span>{chat.sellerName ? chat.sellerName.charAt(0).toUpperCase() : 'U'}</span>
                      )}
                    </div>
                    {/* No presence indicator - the API exposes nothing about
                        whether a user is online, and the row already shows when
                        the last message arrived, which is a fact we have. */}
                  </div>

                  {/* Conversation Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h4 className="text-xs font-bold text-slate-900 truncate">{chat.sellerName}</h4>
                        <ShieldCheck className="w-3 h-3 text-blue-600 shrink-0" />
                      </div>
                      <span className="text-[10px] text-slate-500 shrink-0 ml-2">
                        {lastMsg?.timestamp || 'Recent'}
                      </span>
                    </div>

                    {/* Listing Title */}
                    <div className="text-[11px] font-semibold text-blue-600 truncate mb-1">
                      {chat.listingTitle}
                    </div>

                    {/* Last Message Snippet */}
                    <p
                      className={`text-xs truncate ${
                        isUnread ? 'text-slate-800 font-semibold' : 'text-slate-500'
                      }`}
                    >
                      {lastMsg ? lastMsg.text : 'Start conversation...'}
                    </p>
                  </div>

                  {/* Listing Thumbnail + Unread dot */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <img
                      src={chat.listingImage?.trim() || defaultListingImage(chat.listingTitle)}
                      alt={chat.listingTitle}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-lg object-cover border border-slate-300 shrink-0"
                    />
                    {isUnread && (
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </PullToRefresh>
      )}

      {/* VIEW 5: USER PROFILE VIEW */}
      {!showSearchResults && activeTab === 'profile' && (
        <ProfileView
          showPhone={Boolean(userProfile.showPhone)}
          onToggleShowPhone={async (on) => {
            const before = Boolean(userProfile.showPhone);
            setUserProfile((prev) => ({ ...prev, showPhone: on }));
            try {
              // The server applies this to every one of the user's listings
              // and to chat. If it fails, the switch must not claim otherwise.
              await profileApi.updateProfile({ show_phone: on });
              dealbrizStorage.setShowPhone(on);
              setToast(
                on
                  ? 'Your number is now visible on your ads and in chat.'
                  : 'Your number is now hidden from everyone.'
              );
            } catch {
              setUserProfile((prev) => ({ ...prev, showPhone: before }));
              setToast("Couldn't update this setting. Check your connection and try again.");
            }
          }}
          onOpenEmi={() => {
            setEmiListingContext(null);
            setShowEmiModal(true);
          }}
          onRefresh={async () => {
            await Promise.all([
              loadLiveListings().catch(() => {}),
              refreshMyListings().catch(() => {}),
              refreshInbox().catch(() => {}),
            ]);
          }}
          user={userProfile}
          myListings={myListings}
          savedListings={savedListings}
          emiApplications={emiApps}
          onSelectListing={(it) => setActiveListing(it)}
          onRemoveSaved={handleToggleSave}
          onMarkAsSold={handleMarkAsSold}
          onEditListing={handleOpenEditModal}
          onEditProfile={() => setShowEditProfile(true)}
          onDeleteListing={handleDeleteListing}
          onToggleStatus={handleToggleListingStatus}
          onOpenWebsite={() => {
            openDealBrizWebsite();
          }}
          onOpenSellModal={openSellFlow}
          onOpenFaqs={() => setShowFaqsModal(true)}
          onOpenChatbot={() => setShowChatbotModal(true)}
          onOpenReportProblem={() => setShowReportProblemModal(true)}
          onOpenAuth={handleOpenAuth}
          onLogout={async () => {
            // Before authApi.logout(): removing the push device needs the session cookie.
            await oneSignalService.unlinkUser().catch(() => {});
            await authApi.logout();
            clearSessionCookies();
            sessionVerifiedRef.current = false;
            // Per-account settings must not carry over to the next person
            // who signs in on this phone.
            dealbrizStorage.setShowPhone(false);
            const guestUser: UserProfile = {
              id: 'guest',
              name: 'Guest User',
              email: '',
              phone: '',
              city: selectedCity === 'All Cities' ? '' : selectedCity,
              pincode: '',
              avatar: initialsAvatar('Guest User'),
              isVerified: false,
              memberSince: '2026',
              isAuthenticated: false,
            };
            setUserProfile(guestUser);
            dealbrizStorage.saveUserProfile(guestUser);
          }}
        />
      )}

      {/* Floating 24/7 DealBriz Assistant Launcher (Section 3.17) */}
      <button
        onClick={() => setShowChatbotModal(true)}
        className="absolute db-above-nav right-3.5 z-40 bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 text-white px-3 py-2 rounded-full shadow-xl shadow-blue-600/40 border border-blue-200 flex items-center gap-1.5 active:scale-95 transition-transform hover:scale-105"
        aria-label="DealBriz Support Assistant"
      >
        <Bot className="w-4 h-4 text-white animate-pulse" />
        <span className="text-[11px] font-extrabold tracking-tight">AI Help</span>
      </button>

      {/* Android Bottom Navigation Bar */}
      <AndroidBottomNav
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab === 'sell') {
            openSellFlow();
          }
        }}
        unreadChatsCount={unreadChatsCount}
      />

      {/* MODALS */}
      {/* 1. Listing Detail Modal */}
      {activeListing && (
        <ListingDetailModal
          listing={{
            ...activeListing,
            seller_phone:
              phoneCheck?.id === activeListing.id && phoneCheck.status === 'ok' ? phoneCheck.phone : '',
          }}
          phoneStatus={
            phoneCheck?.id === activeListing.id ? phoneCheck.status : 'loading'
          }
          onClose={() => setActiveListing(null)}
          isSaved={savedIds.includes(activeListing.id)}
          onToggleSave={handleToggleSave}
          onOpenChat={handleOpenChat}
          onOpenEmi={handleOpenEmi}
          onMakeOffer={handleMakeOfferFromDetail}
          onEditListing={handleOpenEditModal}
          isOwner={myListings.some((m) => m.id === activeListing.id)}
          viewerPhone={userProfile.phone}
          viewerShowPhone={Boolean(userProfile.showPhone)}
          onToggleStatus={handleToggleListingStatus}
        />
      )}

      {/* 2. In-App Chat Modal */}
      {activeChat && (
        <ChatModal
          conversation={activeChat}
          listing={chatListingContext}
          onClose={() => {
            setActiveChat(null);
            refreshInbox().catch(() => {});
          }}
          onSendMessage={handleSendMessage}
          onViewListing={(listingId) => {
            const found = listings.find((l) => l.id === listingId);
            if (found) {
              setActiveChat(null);
              setActiveListing(found);
            }
          }}
          role={activeChatRole}
          viewerShowPhone={Boolean(userProfile.showPhone)}
          sendError={chatSendError}
          onDismissSendError={() => setChatSendError(null)}
        />
      )}

      {showEditProfile && (
        <EditProfileModal
          user={userProfile}
          onClose={() => setShowEditProfile(false)}
          onSaved={(updated) => {
            const merged = { ...userProfile, ...updated };
            setUserProfile(merged);
            dealbrizStorage.saveUserProfile(merged);
          }}
        />
      )}

      {toast && (
        <div className="fixed left-3 right-3 db-above-nav-lg z-[130] flex justify-center pointer-events-none">
          <div className="max-w-sm w-full bg-white border border-slate-300 rounded-xl px-3.5 py-3 shadow-2xl flex items-start gap-2.5 pointer-events-auto">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span className="text-[11px] text-slate-700 flex-1 leading-relaxed">{toast}</span>
            <button
              onClick={() => setToast(null)}
              className="text-[11px] font-bold text-slate-500 hover:text-slate-900 shrink-0"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {chatBlockedReason && (
        <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl p-5 space-y-3">
            <h3 className="text-base font-extrabold text-slate-900">
              {chatBlockedReason === 'signin'
                ? 'Sign in to message the seller'
                : chatBlockedReason === 'own-listing'
                ? 'This is your own listing'
                : chatBlockedReason === 'not-your-listing'
                ? "You can't edit this ad"
                : 'Messaging unavailable'}
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              {chatBlockedReason === 'signin'
                ? 'Messages are delivered to the seller\u2019s DealBriz account, so you need to be signed in for them to reply to you.'
                : chatBlockedReason === 'own-listing'
                ? 'You can\u2019t start a chat with yourself. Buyers who message this ad will show up in your Chats tab.'
                : chatBlockedReason === 'not-your-listing'
                ? 'Only the seller who posted an ad can change it. You can message them if something looks wrong.'
                : 'This listing has no linked seller account yet, so messages can\u2019t be delivered. Try the call button on the listing instead.'}
            </p>
            <div className="flex gap-2">
              {chatBlockedReason === 'signin' && (
                <button
                  onClick={() => {
                    setChatBlockedReason(null);
                    setAuthModalMode('login');
                    setShowAuthModal(true);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold"
                >
                  Sign in
                </button>
              )}
              <button
                onClick={() => setChatBlockedReason(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold border border-slate-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. EMI Calculator & Financing Modal */}
      {showEmiModal && (
        <EmiCalculatorModal
          listing={emiListingContext}
          onClose={() => setShowEmiModal(false)}
          onSubmitApplication={handleEmiApplicationSubmit}
        />
      )}

      {/* 4. Sell / Post Ad Modal */}
      {showSellModal && (
        <SellListingModal
          onClose={handleCloseSellModal}
          onPostListing={handlePostListing}
          onUpdateListing={handleUpdateListing}
          editingListing={editingListing}
          userCity={selectedCity}
        />
      )}

      {/* 5. Filter & Sort Modal */}
      {showFilterModal && (
        <FilterModal
          filters={filters}
          onUpdateFilters={(updated) => setFilters(updated)}
          onClose={() => setShowFilterModal(false)}
          onReset={() => {
            setFilters({
              category: selectedCategory,
              searchQuery: '',
              city: selectedCity,
              minPrice: null,
              maxPrice: null,
              condition: null,
              emiOnly: false,
              sortBy: 'recommended',
            });
          }}
        />
      )}

      {/* 6. Notifications Modal */}
      {showNotificationsModal && (
        <NotificationsModal
          onClose={() => setShowNotificationsModal(false)}
          notifications={notifications}
          onMarkAllRead={handleMarkAllRead}
          onNewNotification={(newN) => {
            setNotifications((prev) => [newN, ...prev]);
          }}
        />
      )}

      {/* 7. Android PWA Install Modal */}
      {showInstallModal && (
        <PwaInstallModal
          onClose={() => setShowInstallModal(false)}
          deferredPrompt={deferredPrompt}
        />
      )}

      {/* 8. DealBriz Chatbot Support Assistant Modal (Section 3.17) */}
      {showChatbotModal && (
        <DealBrizChatbotModal
          onClose={() => setShowChatbotModal(false)}
          onOpenEmi={() => {
            setShowChatbotModal(false);
            setEmiListingContext(null);
            setShowEmiModal(true);
          }}
          onOpenSell={() => {
            setShowChatbotModal(false);
            openSellFlow();
          }}
        />
      )}

      {/* 9. DealBriz Official Help & FAQs Modal (Section 3.12) */}
      {showFaqsModal && (
        <FaqsModal
          onClose={() => setShowFaqsModal(false)}
          onOpenEmi={() => {
            setShowFaqsModal(false);
            setEmiListingContext(null);
            setShowEmiModal(true);
          }}
          onOpenSell={() => {
            setShowFaqsModal(false);
            openSellFlow();
          }}
        />
      )}

      {/* 10. DealBriz Auth Modal (Section 3.1) */}
      {showAuthModal && (
        <AuthModal
          initialMode={authModalMode}
          onClose={() => {
            setShowAuthModal(false);
            setPendingSellAfterAuth(false);
          }}
          onSuccess={(usr: AuthUser) => {
            sessionVerifiedRef.current = true;
            saveSessionCookies().catch(() => {});
            const showPhone = reconcileShowPhone(usr);
            setUserProfile((prev) => {
              const updated: UserProfile = {
                ...prev,
                id: usr.id,
                name: `${usr.first_name || ''} ${usr.last_name || ''}`.trim() || usr.email?.split('@')[0] || prev.name,
                email: usr.email || prev.email,
                phone: usr.phone || prev.phone,
                city: usr.city || prev.city,
                avatar: usr.avatar_url || prev.avatar,
                showPhone,
                isVerified: true,
                isAuthenticated: true,
              };
              dealbrizStorage.saveUserProfile(updated);
              return updated;
            });
            setShowAuthModal(false);

            // Only bounce into the sell form if that's where they were headed.
            if (pendingSellAfterAuth) {
              setPendingSellAfterAuth(false);
              setActiveTab('sell');
              setEditingListing(null);
              setShowSellModal(true);
            }
          }}
        />
      )}

      {/* 11. Report Problem / Feedback Modal (Section 3.10) */}
      {showReportProblemModal && (
        <ReportModal
          onClose={() => setShowReportProblemModal(false)}
          reportType="problem"
        />
      )}
    </AndroidFrame>
  );
}
