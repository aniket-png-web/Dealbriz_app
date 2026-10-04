import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dealbriz.app',
  appName: 'DealBriz',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#0A1628',
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0A1628',
    },
    // Route fetch/XHR through the native HTTP stack. The web layer runs on
    // https://localhost, so browser-level CORS and third-party cookie rules
    // would otherwise block every call to https://dealbriz.com/api.
    CapacitorHttp: {
      enabled: true,
    },
    CapacitorCookies: {
      enabled: true,
    },
  },
};

export default config;
