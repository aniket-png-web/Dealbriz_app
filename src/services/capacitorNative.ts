import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';

export const isNativeAndroid = (): boolean => {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
};

export const initAndroidNativeBridge = (onBackPressed: () => boolean) => {
  if (!Capacitor.isNativePlatform()) return () => {};

  // Configure Android native status bar. Keeping the web view below the status
  // bar (rather than under it) means the top app bar is never clipped; the
  // db-safe-* CSS covers the devices where the system forces edge-to-edge.
  try {
    // Style.Light means "dark text for light backgrounds" in this plugin.
    StatusBar.setStyle({ style: Style.Light }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#FFFFFF' }).catch(() => {});
    StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
  } catch {
    // Ignore in unsupported environments
  }

  // Register Android hardware & navigation gesture back button listener
  const backListenerPromise = CapApp.addListener('backButton', ({ canGoBack }) => {
    // Return true if handled internally (closed modal or returned to home), false to let app exit
    const handled = onBackPressed();
    if (!handled) {
      if (canGoBack) {
        window.history.back();
      } else {
        CapApp.exitApp().catch(() => {});
      }
    }
  });

  return () => {
    backListenerPromise.then((handle) => handle.remove()).catch(() => {});
  };
};
