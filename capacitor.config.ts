import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.codeforge.desktop',
  appName: 'CodeForge',
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
    // Light status bar icons for the dark default themes; insets are exposed as CSS variables.
    SystemBars: {
      style: 'DARK',
      insetsHandling: 'css',
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
