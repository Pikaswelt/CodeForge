import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.codeforge.desktop',
  appName: 'FancyCode',
  webDir: 'dist',
  backgroundColor: '#111111',
  android: {
    allowMixedContent: true,
    backgroundColor: '#111111',
  },
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
  },
  plugins: {
    // Edge-to-edge behind the status and navigation bars: the theme wallpaper stays visible
    // under them, while the app pads its own buttons with env(safe-area-inset-*).
    // 'css' would shrink the web view on older Android WebViews and cut the wallpaper off.
    SystemBars: {
      style: 'DARK',
      insetsHandling: 'disable',
    },
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#111111',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
};

export default config;
