import OneSignal from 'react-onesignal';
import { Capacitor } from '@capacitor/core';
import { profileApi } from './dealbrizApi';

/**
 * Push notifications for DealBriz.
 *
 * Android (the Capacitor app) uses the native OneSignal Cordova plugin. The
 * browser build uses the OneSignal web SDK. These two must never mix: the web
 * SDK loaded inside the Android WebView can do nothing useful (the WebView has
 * no Notification API) and it overwrites window.OneSignal, which is where the
 * native plugin lives.
 *
 * How a chat push reaches a phone:
 *   1. App launches -> initialize() with the App ID.
 *   2. User grants POST_NOTIFICATIONS (Android 13+) -> device gets a
 *      subscription id from OneSignal.
 *   3. Signed-in user + subscription id -> POST /api/profile/push-device,
 *      so the server knows which subscription(s) belong to which user.
 *   4. Server saves a chat message -> calls the OneSignal REST API for the
 *      receiver's subscription ids, with data {type:'chat', product_id, sender_id}.
 *   5. User taps the notification -> onChatOpen handler opens that thread.
 *
 * Steps 3 and 4 need the Flask routes; everything here is the app side.
 */

const STORAGE_KEY_APP_ID = 'dealbriz_onesignal_app_id';
export const DEFAULT_ONESIGNAL_APP_ID =
  (import.meta as any).env?.VITE_ONESIGNAL_APP_ID || 'a58e0f68-26db-4c02-a227-669ecba34afc';

// Native log level for `adb logcat`: 0 None ... 3 Warn, 4 Info, 6 Verbose.
const NATIVE_LOG_LEVEL = 4;

export function getStoredOneSignalAppId(): string {
  try {
    const val = localStorage.getItem(STORAGE_KEY_APP_ID);
    if (val && val.trim() && val.trim() !== 'b84b5c77-4b8b-4a5e-b2d9-dealbriz001') {
      return val.trim();
    }
  } catch {
    // ignore
  }
  return DEFAULT_ONESIGNAL_APP_ID;
}

export function saveStoredOneSignalAppId(appId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_APP_ID, appId.trim());
  } catch {
    // ignore
  }
}

export interface OneSignalStatus {
  isInitialized: boolean;
  isNative: boolean;
  /** False when running natively but the plugin never loaded - a build problem. */
  pluginAvailable: boolean;
  appId: string;
  hasPermission: boolean;
  permissionState: 'default' | 'granted' | 'denied';
  subscriptionId?: string | null;
  optedIn: boolean;
  /** True once this device's subscription id has been stored on the server. */
  registeredWithServer: boolean;
  fcmSenderId: string;
  firebaseProjectId: string;
}

/** A chat thread as identified by a push payload, from the receiver's side. */
export interface PushChatTarget {
  productId: string;
  otherUserId: string;
}

/** Pull {type:'chat', product_id, sender_id} out of a notification. */
function chatTargetFromNotification(notification: any): PushChatTarget | null {
  if (!notification) return null;
  let data: any = notification.additionalData;
  if (!data) {
    // Fallback: OneSignal puts custom data under custom.a in the raw payload.
    try {
      const raw =
        typeof notification.rawPayload === 'string'
          ? JSON.parse(notification.rawPayload)
          : notification.rawPayload;
      const custom = typeof raw?.custom === 'string' ? JSON.parse(raw.custom) : raw?.custom;
      data = custom?.a;
    } catch {
      data = null;
    }
  }
  if (!data || data.type !== 'chat') return null;
  const productId = data.product_id != null ? String(data.product_id) : '';
  const otherUserId = data.sender_id != null ? String(data.sender_id) : '';
  if (!productId || !otherUserId) return null;
  return { productId, otherUserId };
}

/**
 * Resolves with the native OneSignal plugin, or null if it isn't there.
 *
 * The plugin is attached by cordova.js as window.plugins.OneSignal (and also
 * clobbers window.OneSignal). It exists only after `deviceready`, so wait for
 * that rather than a short fixed poll - the previous 3s poll could give up on
 * a slow cold start and then silently fall through to the web SDK.
 */
let nativePluginPromise: Promise<any> | null = null;
function getNativeOneSignal(): Promise<any> {
  if (nativePluginPromise) return nativePluginPromise;
  nativePluginPromise = new Promise((resolve) => {
    if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) {
      resolve(null);
      return;
    }
    const win = window as any;
    const find = () => {
      const p = win.plugins?.OneSignal;
      // Cordova shape has initialize(); the web SDK has init(). Never return the web one.
      return p && typeof p.initialize === 'function' ? p : null;
    };

    const immediate = find();
    if (immediate) {
      resolve(immediate);
      return;
    }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearInterval(poll);
      window.clearTimeout(giveUp);
      document.removeEventListener('deviceready', onReady);
      const plugin = find();
      if (!plugin) {
        console.error(
          '[OneSignal] Native plugin not found after deviceready. Run `npx cap sync android` and rebuild.'
        );
      }
      resolve(plugin);
    };
    const onReady = () => finish();
    document.addEventListener('deviceready', onReady);
    const poll = window.setInterval(() => {
      if (find()) finish();
    }, 200);
    const giveUp = window.setTimeout(finish, 15000);
  });
  return nativePluginPromise;
}

class OneSignalManager {
  private initialized = false;
  private initializingPromise: Promise<boolean> | null = null;
  private listeners: ((status: OneSignalStatus) => void)[] = [];

  private pluginAvailable = true;
  private nativePermissionGranted = false;
  private nativeSubscriptionId: string | null = null;
  private nativeOptedIn = false;

  /** DealBriz (MySQL) user id the device is linked to, or null when signed out. */
  private linkedUserId: string | null = null;
  /** `${userId}:${subscriptionId}` last stored on the server, to avoid re-posting. */
  private registeredKey: string | null = null;
  private registering: Promise<void> | null = null;

  private askedThisLaunch = false;

  // Chat handlers are set by App. Kept as single slots (not listener lists) so
  // a re-render can never stack duplicates.
  private chatOpenHandler: ((t: PushChatTarget) => void) | null = null;
  private pendingChatOpen: PushChatTarget | null = null;
  private foregroundChatHandler: ((t: PushChatTarget) => boolean) | null = null;

  public getStatus(): OneSignalStatus {
    const isNative = Capacitor.isNativePlatform();
    let hasPermission = false;
    let permissionState: 'default' | 'granted' | 'denied' = 'default';
    let subId: string | null = null;
    let optedIn = false;

    if (isNative) {
      hasPermission = this.nativePermissionGranted;
      permissionState = this.nativePermissionGranted ? 'granted' : 'default';
      subId = this.nativeSubscriptionId;
      optedIn = this.nativeOptedIn;
    } else {
      if (typeof Notification !== 'undefined') {
        permissionState = Notification.permission;
        hasPermission = permissionState === 'granted';
      }
      try {
        subId = OneSignal.User?.PushSubscription?.id || null;
        optedIn = Boolean(OneSignal.User?.PushSubscription?.optedIn);
      } catch {
        // web SDK not ready
      }
    }

    return {
      isInitialized: this.initialized,
      isNative,
      pluginAvailable: this.pluginAvailable,
      appId: getStoredOneSignalAppId(),
      hasPermission,
      permissionState,
      subscriptionId: subId,
      optedIn,
      registeredWithServer: Boolean(
        this.registeredKey && subId && this.registeredKey === `${this.linkedUserId}:${subId}`
      ),
      fcmSenderId: '383335232871',
      firebaseProjectId: 'gen-lang-client-0464797306',
    };
  }

  public subscribe(cb: (status: OneSignalStatus) => void) {
    this.listeners.push(cb);
    cb(this.getStatus());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notify() {
    const status = this.getStatus();
    this.listeners.forEach((cb) => cb(status));
  }

  /** Called when the user taps a chat notification. A tap that launched the app is held until a handler exists. */
  public setChatOpenHandler(handler: ((t: PushChatTarget) => void) | null) {
    this.chatOpenHandler = handler;
    if (handler && this.pendingChatOpen) {
      const t = this.pendingChatOpen;
      this.pendingChatOpen = null;
      handler(t);
    }
  }

  /**
   * Called when a chat push arrives while the app is open.
   * Return true to suppress the banner (e.g. that thread is already on screen).
   */
  public setForegroundChatHandler(handler: ((t: PushChatTarget) => boolean) | null) {
    this.foregroundChatHandler = handler;
  }

  private async refreshNativeState(): Promise<void> {
    try {
      const os = await getNativeOneSignal();
      if (!os) return;
      this.nativePermissionGranted = Boolean(await os.Notifications.getPermissionAsync());
      this.nativeSubscriptionId = (await os.User.pushSubscription.getIdAsync()) || null;
      this.nativeOptedIn = Boolean(await os.User.pushSubscription.getOptedInAsync());
    } catch (e) {
      console.warn('[OneSignal] refreshNativeState:', e);
    }
  }

  /**
   * Stores (user, subscription id) on the server whenever both are known and
   * that pair hasn't been stored yet. Runs from sign-in AND from the
   * subscription-change event, because on a fresh install the subscription id
   * usually arrives a few seconds after sign-in - registering only at sign-in
   * missed it.
   */
  private syncServerRegistration(): Promise<void> {
    if (this.registering) return this.registering;
    this.registering = (async () => {
      try {
        const userId = this.linkedUserId;
        const subId = Capacitor.isNativePlatform()
          ? this.nativeSubscriptionId
          : OneSignal.User?.PushSubscription?.id || null;
        if (!userId || !subId) return;
        const key = `${userId}:${subId}`;
        if (this.registeredKey === key) return;
        await profileApi.registerPushDevice(subId);
        this.registeredKey = key;
        this.notify();
      } catch (e) {
        console.warn('[OneSignal] Could not register device with server:', e);
      } finally {
        this.registering = null;
      }
    })();
    return this.registering;
  }

  public async initOneSignal(customAppId?: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    const appId = customAppId || getStoredOneSignalAppId();
    if (customAppId) saveStoredOneSignalAppId(customAppId);

    if (this.initialized) return true;
    if (this.initializingPromise) return this.initializingPromise;

    this.initializingPromise = (async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          const os = await getNativeOneSignal();
          if (!os) {
            this.pluginAvailable = false;
            this.notify();
            return false; // no web fallback inside the WebView - see header comment
          }
          this.pluginAvailable = true;

          try {
            os.Debug?.setLogLevel?.(NATIVE_LOG_LEVEL);
          } catch {
            // ignore
          }

          os.initialize(appId);

          os.Notifications.addEventListener('permissionChange', async (granted: boolean) => {
            this.nativePermissionGranted = Boolean(granted);
            await this.refreshNativeState();
            this.notify();
            this.syncServerRegistration();
          });

          os.User.pushSubscription.addEventListener('change', (state: any) => {
            this.nativeSubscriptionId = state?.current?.id || null;
            this.nativeOptedIn = Boolean(state?.current?.optedIn);
            this.notify();
            this.syncServerRegistration();
          });

          os.Notifications.addEventListener('foregroundWillDisplay', (event: any) => {
            const target = chatTargetFromNotification(event?.getNotification?.());
            if (!target || !this.foregroundChatHandler) return; // default: show it
            let suppress = false;
            try {
              suppress = this.foregroundChatHandler(target);
            } catch {
              suppress = false;
            }
            // preventDefault must be called synchronously inside the listener.
            if (suppress) event.preventDefault(true);
          });

          os.Notifications.addEventListener('click', (event: any) => {
            const target = chatTargetFromNotification(event?.notification);
            if (!target) return;
            if (this.chatOpenHandler) this.chatOpenHandler(target);
            else this.pendingChatOpen = target; // cold start: App not mounted yet
          });

          await this.refreshNativeState();
          this.initialized = true;
          this.notify();
          return true;
        }

        // Browser build only.
        await OneSignal.init({
          appId,
          allowLocalhostAsSecureOrigin: true,
          serviceWorkerPath: 'OneSignalSDKWorker.js',
          serviceWorkerParam: { scope: '/' },
        });
        this.initialized = true;
        try {
          OneSignal.User?.PushSubscription?.addEventListener('change', () => {
            this.notify();
            this.syncServerRegistration();
          });
        } catch {
          // ignore
        }
        this.notify();
        return true;
      } catch (err) {
        console.warn('[OneSignal] Initialization error:', err);
        this.initialized = false;
        this.notify();
        return false;
      } finally {
        this.initializingPromise = null;
      }
    })();

    return this.initializingPromise;
  }

  /**
   * Shows the Android permission dialog.
   *
   * @param fallbackToSettings when the user has already said no, Android won't
   *   show the dialog again; true opens the app's notification settings instead.
   *   Use true only from an explicit tap (bell / "Turn on"), never on launch.
   */
  public async requestNotificationPermission(fallbackToSettings = false): Promise<boolean> {
    try {
      await this.initOneSignal();

      if (Capacitor.isNativePlatform()) {
        const os = await getNativeOneSignal();
        if (!os) return false;
        const granted = await os.Notifications.requestPermission(fallbackToSettings);
        this.nativePermissionGranted = Boolean(granted);
        await this.refreshNativeState();
        this.notify();
        this.syncServerRegistration();
        return this.nativePermissionGranted;
      }

      if (typeof OneSignal.Notifications?.requestPermission === 'function') {
        await OneSignal.Notifications.requestPermission();
      } else if (typeof Notification !== 'undefined') {
        await Notification.requestPermission();
      }
      const granted = typeof Notification !== 'undefined' && Notification.permission === 'granted';
      this.notify();
      return granted;
    } catch (err) {
      console.warn('[OneSignal] Request permission failed:', err);
      return false;
    }
  }

  /**
   * Launch-time prompt. Asks only when notifications are off AND Android will
   * actually show its dialog (i.e. the user hasn't already refused). Android
   * tracks that itself, so there's no localStorage flag to get stuck - the old
   * `dealbriz_push_asked_v1` flag was written before asking, so one failed
   * attempt meant the app never asked again on that install.
   */
  public async promptOnLaunchIfNeeded(): Promise<void> {
    if (!Capacitor.isNativePlatform() || this.askedThisLaunch) return;
    this.askedThisLaunch = true;
    try {
      const ok = await this.initOneSignal();
      if (!ok) return;
      const os = await getNativeOneSignal();
      if (!os) return;
      if (await os.Notifications.getPermissionAsync()) return;
      if (!(await os.Notifications.canRequestPermission())) return;
      await this.requestNotificationPermission(false);
    } catch (e) {
      console.warn('[OneSignal] Launch prompt failed:', e);
    }
  }

  /** True if tapping "Turn on" will show the system dialog; false means it will open Settings. */
  public async canShowSystemPrompt(): Promise<boolean> {
    try {
      const os = await getNativeOneSignal();
      if (!os) return false;
      return Boolean(await os.Notifications.canRequestPermission());
    } catch {
      return false;
    }
  }

  /** Re-reads permission (e.g. after returning from the Settings screen). */
  public async refresh(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await this.refreshNativeState();
      this.notify();
      this.syncServerRegistration();
    } else {
      this.notify();
    }
  }

  /** Ties this device to the signed-in DealBriz user (MySQL id). */
  public async linkUser(userId: string, email?: string) {
    if (!userId) return;
    this.linkedUserId = String(userId);
    try {
      await this.initOneSignal();

      if (Capacitor.isNativePlatform()) {
        const os = await getNativeOneSignal();
        if (os) {
          // External id is only a label in the OneSignal dashboard. The server
          // targets subscription ids it stored via /profile/push-device, which
          // are tied to the authenticated session and can't be spoofed by a
          // client calling login() with someone else's id.
          os.login(String(userId));
          if (email) os.User?.addEmail?.(email);
          await this.refreshNativeState();
        }
      } else {
        if (typeof OneSignal.login === 'function') await OneSignal.login(String(userId));
      }

      await this.syncServerRegistration();
      this.notify();
    } catch (err) {
      console.warn('[OneSignal] Link user error:', err);
    }
  }

  /**
   * Call BEFORE the auth logout request: removing the device needs the
   * session cookie. Otherwise a shared phone keeps getting the old user's chats.
   */
  public async unlinkUser() {
    const subId = Capacitor.isNativePlatform()
      ? this.nativeSubscriptionId
      : OneSignal.User?.PushSubscription?.id || null;
    if (subId && this.linkedUserId) {
      try {
        await profileApi.unregisterPushDevice(subId);
      } catch (e) {
        console.warn('[OneSignal] Could not unregister device:', e);
      }
    }
    this.linkedUserId = null;
    this.registeredKey = null;
    try {
      if (Capacitor.isNativePlatform()) {
        const os = await getNativeOneSignal();
        os?.logout?.();
      } else if (typeof OneSignal.logout === 'function') {
        await OneSignal.logout();
      }
    } catch {
      // ignore
    }
    this.notify();
  }
}

export const oneSignalService = new OneSignalManager();
