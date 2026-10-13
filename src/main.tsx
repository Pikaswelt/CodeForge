import { Capacitor } from '@capacitor/core';

// The Android app (Capacitor) gets its own UI that works only on the V-Server; the desktop
// keeps the full Electron UI. ?mobile opens the Android UI in a browser for development.
const mobile = Capacitor.isNativePlatform() || new URLSearchParams(window.location.search).has('mobile');

if (mobile) void import('./mobile/main');
else void import('./desktopMain');
