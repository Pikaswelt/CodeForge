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
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#111111',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
};

export default config;
