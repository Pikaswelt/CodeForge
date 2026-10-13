import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// 1. Build web dist
console.log('==> Building web assets with Vite...');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
let r = spawnSync(npmCmd, ['run', 'build'], { stdio: 'inherit', shell: true });
if (r.status !== 0) process.exit(r.status || 1);

// 2. Sync Capacitor
console.log('==> Syncing Capacitor Android...');
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
r = spawnSync(npxCmd, ['cap', 'sync', 'android'], { stdio: 'inherit', shell: true });
if (r.status !== 0) process.exit(r.status || 1);

// 3. Patch generated cordova plugins build.gradle to use aliyun google maven mirror (prevents dl.google.com hang)
const cordovaGradle = path.join('android', 'capacitor-cordova-android-plugins', 'build.gradle');
if (fs.existsSync(cordovaGradle)) {
  let content = fs.readFileSync(cordovaGradle, 'utf8');
  content = content.replace(/google\(\)/g, "maven { url 'https://maven.aliyun.com/repository/google' }");
  fs.writeFileSync(cordovaGradle, content, 'utf8');
  console.log('==> Patched capacitor-cordova-android-plugins to use reliable Google mirror.');
}

// 4. Assemble APK via Gradle
console.log('==> Assembling Android APK...');
const isWin = process.platform === 'win32';
const gradlew = isWin ? 'gradlew.bat' : './gradlew';
const env = { ...process.env };
if (isWin && fs.existsSync('C:\\Program Files\\Android\\Android Studio\\jbr')) {
  env.JAVA_HOME = 'C:\\Program Files\\Android\\Android Studio\\jbr';
}
r = spawnSync(gradlew, ['assembleDebug', '--no-daemon', '--console=plain'], {
  cwd: 'android',
  stdio: 'inherit',
  shell: true,
  env,
});
if (r.status !== 0) process.exit(r.status || 1);

// 5. Copy APK to release/
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = pkg.version;
const srcApk = path.join('android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const outDir = path.join('release');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const targetApk = path.join(outDir, `CodeForge-${version}.apk`);
fs.copyFileSync(srcApk, targetApk);
console.log(`\n🎉 APK erfolgreich erstellt: ${targetApk} (${(fs.statSync(targetApk).size / 1024 / 1024).toFixed(2)} MB)`);
