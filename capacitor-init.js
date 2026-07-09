// Capacitor / Android WebView Init
// Setzt Standardwerte für die App beim ersten Start auf Android
(function() {
  const PREFIX = 'agentWorkspace.';
  
  function read(key, fallback) {
    try {
      const val = localStorage.getItem(PREFIX + key);
      return val ? JSON.parse(val) : fallback;
    } catch {
      return fallback;
    }
  }
  
  function write(key, value) {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  }

  // Nur ausführen, wenn wir in einer Capacitor-Umgebung sind
  const isCapacitor = typeof (window as any).Capacitor !== 'undefined' || 
                       window.location.protocol === 'file:' ||
                       navigator.userAgent.includes('CodeForge');

  if (!isCapacitor) return;

  // App läuft im Browser-Modus (WebView = Web-App)
  (window as any).agentWorkspace = (window as any).agentWorkspace || {};
  (window as any).agentWorkspace.isWeb = true;

  // Standardwerte nur setzen wenn noch nichts konfiguriert wurde
  if (read('setup', false) === false) {
    // Remote-Server vorkonfigurieren (wird später vom Benutzer eingestellt)
    write('setup', false);
    write('theme', 'modern-dark');
    write('provider', 'antigravity');
    write('model', 'Gemini 3.5 Flash (Medium)');
    write('reasoningEffort', 'medium');
    write('access', 'full');
    write('responseDisplayMode', 'bullets');
  }

  console.log('CodeForge Capacitor initialized');
})();
