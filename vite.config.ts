import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

// The Android app uploads the harness and the remote MCP server to the V-Server. Emitting them
// next to the web bundle keeps one source of truth (resources/fancycode) for desktop and mobile.
function fancyCodeAssets(): Plugin {
  const files = ['fancycode.mjs', 'fancycode-remote-mcp.mjs'];
  const source = (name: string) => path.resolve(__dirname, 'resources/fancycode', name);
  return {
    name: 'fancycode-assets',
    apply: 'build',
    generateBundle() {
      for (const name of files) {
        if (existsSync(source(name))) this.emitFile({ type: 'asset', fileName: name, source: readFileSync(source(name)) });
      }
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const name = String(request.url || '').split('?')[0].replace(/^\//, '');
        if (!files.includes(name) || !existsSync(source(name))) return next();
        response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        response.end(readFileSync(source(name)));
      });
    },
  };
}

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
  plugins: [react(), tailwindcss(), fancyCodeAssets()],
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
