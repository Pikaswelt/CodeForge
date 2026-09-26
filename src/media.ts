export function isVideoPath(filePath: string) {
  if (!filePath) return false;
  if (filePath.startsWith('data:video/')) return true;
  if (filePath.startsWith('blob:')) return true;
  return /\.(mp4|webm|mov|m4v|ogg|ogv|avi|mkv)$/i.test(filePath);
}

export function toFileUrl(filePath: string) {
  // Handle data: URLs (images read as data URL on mobile)
  if (filePath.startsWith('data:')) {
    return filePath;
  }
  // Handle blob: URLs (videos created via URL.createObjectURL)
  if (filePath.startsWith('blob:')) {
    return filePath;
  }
  if ((window as any).agentWorkspace?.isWeb) {
    let baseUrl = '';
    try {
      const storedConfig = localStorage.getItem('mobileConnectionConfig');
      if (storedConfig) {
        const config = JSON.parse(storedConfig);
        if (config.connected && config.type === 'vps' && config.vpsUrl) {
          baseUrl = config.vpsUrl;
        }
      }
    } catch (e) {}
    return `${baseUrl}/media?path=${encodeURIComponent(filePath)}`;
  }
  // In Capacitor Android, file:// URLs with content:// or file:/// work
  if (typeof (window as any).Capacitor !== 'undefined' || filePath.startsWith('content://')) {
    return filePath;
  }
  const normalized = filePath.replace(/\\/g, '/');
  return `codeforge-media:///${normalized}`;
}
