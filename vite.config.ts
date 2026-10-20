import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
// Release channel, same source as the updater (electron/updater.cjs): move it in one place.
const updateTarget = pkg.codeforge?.update ?? {};
const UPDATE_REPO_SLUG = `${updateTarget.owner || 'Pikaswelt'}/${updateTarget.repo || 'CodeForge'}`;

export default defineConfig(() => ({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __UPDATE_REPO__: JSON.stringify(UPDATE_REPO_SLUG),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
}));
