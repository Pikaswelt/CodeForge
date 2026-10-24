import { Native } from './native';

// In-app update for the Android build. GitHub releases are the only source (no Play Store),
// so the app checks the latest release, downloads the APK and hands it to Android's installer.

export type UpdateInfo = {
  version: string;
  notes: string;
  publishedAt?: string;
  asset?: { name: string; url: string; size: number; sha256: string };
};

const [owner, repo] = (__UPDATE_REPO__ || 'Pikaswelt/CodeForge').split('/');

function parts(version: string) {
  return String(version)
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .map((item) => Number.parseInt(item, 10))
    .map((item) => (Number.isFinite(item) ? item : 0));
}

export function isNewerVersion(candidate: string, current: string) {
  const next = parts(candidate);
  const now = parts(current);
  for (let index = 0; index < Math.max(next.length, now.length); index += 1) {
    const a = next[index] || 0;
    const b = now[index] || 0;
    if (a !== b) return a > b;
  }
  return false;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const release = await Native.checkUpdate({ owner, repo });
  if (!release?.version || !release.asset) return null;
  return isNewerVersion(release.version, __APP_VERSION__) ? release : null;
}

export async function installUpdate(info: UpdateInfo) {
  if (!info.asset) throw new Error('Kein APK im Release gefunden.');
  await Native.downloadAndInstall({ url: info.asset.url, sha256: info.asset.sha256 || undefined });
}

const CHECK_KEY = 'codeforge.mobile.lastUpdateCheck';
export const UPDATE_EVENT = 'fancycode:check-update';

export function requestUpdateCheck() {
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

export function shouldAutoCheck() {
  try {
    const last = Number(localStorage.getItem(CHECK_KEY) || 0);
    return Date.now() - last > 24 * 60 * 60 * 1000;
  } catch {
    return true;
  }
}

export function markChecked() {
  try {
    localStorage.setItem(CHECK_KEY, String(Date.now()));
  } catch {
    // Storage unavailable; checking again next start is harmless.
  }
}
