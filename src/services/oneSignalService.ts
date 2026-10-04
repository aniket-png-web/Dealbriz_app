import OneSignal from 'react-onesignal';
import { Capacitor } from '@capacitor/core';
import { profileApi } from './dealbrizApi';

const STORAGE_KEY_APP_ID = 'dealbriz_onesignal_app_id';
// Configured OneSignal App ID for DealBriz (com.dealbriz.app)
export const DEFAULT_ONESIGNAL_APP_ID =
  (import.meta as any).env?.VITE_ONESIGNAL_APP_ID || 'a58e0f68-26db-4c02-a227-669ecba34afc';

export function getStoredOneSignalAppId(): string {
  try {
    const val = localStorage.getItem(STORAGE_KEY_APP_ID);
    // If previously saved with legacy placeholder, upgrade to active App ID
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
  appId: string;
  hasPermission: boolean;
  permissionState: 'default' | 'granted' | 'denied';
  subscriptionId?: string | null;
  optedIn: boolean;
  fcmSenderId: string;
  firebaseProjectId: string;
}

/**
 * Helper to obtain the Cordova OneSignal plugin instance when running on native Capacitor.
 * Waits for deviceready if needed.
 */
function getNativeOneSignal(): Promise<any> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      return resolve(null);
    }
    const win = window as any;
    if (win.plugins?.OneSignal) {
      return resolve(win.plugins.OneSignal);
    }
    if (!Capacitor.isNativePlatform()) {
      return resolve(null);
    }

    let resolved = false;
    const finish = (plugin: any) => {
      if (!resolved) {
        resolved = true;
        resolve(plugin || null);
      }
    };

    const onDeviceReady = () => {
      finish(win.plugins?.OneSignal);
    };
    document.addEventListener('deviceready', onDeviceReady, { once: true });

    // Poll briefly for 3 seconds in case deviceready already fired
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (win.plugins?.OneSignal) {
        clearInterval(interval);
        finish(win.plugins.OneSignal);
      } else if (attempts > 30) {
        clearInterval(interval);
        finish(null);
      }
    }, 100);
  });
}

class OneSignalManager {
  private initialized = false;
  private initializingPromise: Promise<boolean> | null = null;
  private listeners: ((status: OneSignalStatus) => void)[] = [];

  // Cached state for native Android platform
  private nativePermissionGranted = false;
  private nativeSubscriptionId: string | null = null;
  private nativeOptedIn = false;

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
        // web OneSignal User not ready
      }
    }

    return {
      isInitialized: this.initialized,
      isNative,
      appId: getStoredOneSignalAppId(),
      hasPermission,
      permissionState,
      subscriptionId: subId,
      optedIn,
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

  /**
   * Refreshes native Android push subscription ID and permission state
   */
  private async refreshNativeState(): Promise<void> {
    try {
      const nativeOS = await getNativeOneSignal();
      if (!nativeOS) return;

      if (typeof nativeOS.Notifications?.getPermissionAsync === 'function') {
        this.nativePermissionGranted = await nativeOS.Notifications.getPermissionAsync();
      }
      if (typeof nativeOS.User?.pushSubscription?.getIdAsync === 'function') {
        this.nativeSubscriptionId = await nativeOS.User.pushSubscription.getIdAsync();
      }
      if (typeof nativeOS.User?.pushSubscription?.getOptedInAsync === 'function') {
        this.nativeOptedIn = await nativeOS.User.pushSubscription.getOptedInAsync();
      }
    } catch (e) {
      console.warn('[OneSignal] refreshNativeState warning:', e);
    }
  }

  public async initOneSignal(customAppId?: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    const appId = customAppId || getStoredOneSignalAppId();
    if (customAppId) {
      saveStoredOneSignalAppId(customAppId);
    }

    if (this.initialized && this.getStatus().appId === appId) {
      return true;
    }

    if (this.initializingPromise) return this.initializingPromise;

    this.initializingPromise = (async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          const cordovaOneSignal = await getNativeOneSignal();
          if (cordovaOneSignal) {
            // Initialize OneSignal with App ID for Android
            cordovaOneSignal.initialize(appId);

            // Register event listeners for Android push events
            try {
              cordovaOneSignal.Notifications?.addEventListener('permissionChange', (hasPermission: boolean) => {
                this.nativePermissionGranted = hasPermission;
                this.notify();
              });
            } catch (e) {
              console.warn('[OneSignal] Native permission listener error:', e);
            }

            try {
              cordovaOneSignal.Notifications?.addEventListener('foregroundWillDisplay', (event: any) => {
                console.log('[OneSignal] Foreground notification received:', event?.getNotification()?.title);
              });
            } catch (e) {
              console.warn('[OneSignal] Foreground listener error:', e);
            }

            try {
              cordovaOneSignal.Notifications?.addEventListener('click', (event: any) => {
                console.log('[OneSignal] Notification clicked:', event);
              });
            } catch (e) {
              console.warn('[OneSignal] Click listener error:', e);
            }

            try {
              cordovaOneSignal.User?.pushSubscription?.addEventListener('change', async (state: any) => {
                this.nativeSubscriptionId = state?.current?.id || null;
                this.nativeOptedIn = Boolean(state?.current?.optedIn);
                this.notify();
              });
            } catch (e) {
              console.warn('[OneSignal] Push subscription listener error:', e);
            }

            await this.refreshNativeState();
            this.initialized = true;
            this.notify();
            return true;
          }
          console.warn('[OneSignal] Running on native platform but OneSignal plugin not found.');
        }

        // Web SDK initialization fallback
        await OneSignal.init({
          appId,
          allowLocalhostAsSecureOrigin: true,
          serviceWorkerPath: 'OneSignalSDKWorker.js',
          serviceWorkerParam: { scope: '/' },
        });

        this.initialized = true;

        // Listen for web subscription changes
        try {
          OneSignal.User?.PushSubscription?.addEventListener('change', () => {
            this.notify();
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

  public async requestNotificationPermission(): Promise<boolean> {
    try {
      if (!this.initialized) {
        await this.initOneSignal();
      }

      if (Capacitor.isNativePlatform()) {
        const cordovaOneSignal = await getNativeOneSignal();
        if (cordovaOneSignal?.Notifications?.requestPermission) {
          // On Android 13+ this triggers POST_NOTIFICATIONS system prompt
          const granted = await cordovaOneSignal.Notifications.requestPermission(true);
          this.nativePermissionGranted = Boolean(granted);
          await this.refreshNativeState();
          this.notify();
          return this.nativePermissionGranted;
        }
      }

      // Web Push fallback
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

  public async linkUser(userId: string, email?: string) {
    try {
      if (!this.initialized) await this.initOneSignal();

      if (Capacitor.isNativePlatform()) {
        const cordovaOneSignal = await getNativeOneSignal();
        if (cordovaOneSignal) {
          if (userId && typeof cordovaOneSignal.login === 'function') {
            await cordovaOneSignal.login(userId);
          }
          if (email && typeof cordovaOneSignal.User?.addEmail === 'function') {
            await cordovaOneSignal.User.addEmail(email);
          }
          await this.refreshNativeState();
          if (userId && this.nativeSubscriptionId) {
            await profileApi.registerPushDevice(this.nativeSubscriptionId);
          }
          this.notify();
          return;
        }
      }

      // Web fallback
      if (userId && typeof OneSignal.login === 'function') {
        await OneSignal.login(userId);
      }

      if (email && typeof OneSignal.User?.addEmail === 'function') {
        await OneSignal.User.addEmail(email);
      }

      const subId = OneSignal.User?.PushSubscription?.id;
      if (userId && subId) {
        await profileApi.registerPushDevice(subId);
      }

      this.notify();
    } catch (err) {
      console.warn('[OneSignal] Link user error:', err);
    }
  }

  public async unlinkUser() {
    try {
      if (Capacitor.isNativePlatform()) {
        const cordovaOneSignal = await getNativeOneSignal();
        if (cordovaOneSignal && typeof cordovaOneSignal.logout === 'function') {
          await cordovaOneSignal.logout();
          await this.refreshNativeState();
          this.notify();
          return;
        }
      }

      if (typeof OneSignal.logout === 'function') {
        await OneSignal.logout();
      }
      this.notify();
    } catch {
      // ignore
    }
  }

  public async triggerTestNotification(title: string, message: string) {
    // 1. If on native Android, verify permission and opt-in state
    if (Capacitor.isNativePlatform()) {
      if (!this.nativePermissionGranted) {
        const granted = await this.requestNotificationPermission();
        if (!granted) {
          return {
            success: false,
            message: 'Android notification permission was not granted. Please allow notifications in device settings.',
          };
        }
      }
      return {
        success: true,
        method: 'android_onesignal',
        message: 'Device subscribed to OneSignal. Test notifications sent from the OneSignal console or API will be delivered to this device.',
      };
    }

    // 2. Web browser Notification API
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body: message,
          icon: '/favicon.svg',
          badge: '/favicon.svg',
        });
        return { success: true, method: 'browser_notification' };
      } catch {
        // fall through
      }
    }

    // 3. Request web permission if not granted
    const granted = await this.requestNotificationPermission();
    if (granted && typeof Notification !== 'undefined') {
      new Notification(title, {
        body: message,
        icon: '/favicon.svg',
      });
      return { success: true, method: 'browser_notification' };
    }

    return {
      success: false,
      message: 'Notification permission not granted. Please allow notifications in your browser or device settings.',
    };
  }
}

export const oneSignalService = new OneSignalManager();
