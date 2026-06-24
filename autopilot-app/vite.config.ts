import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version } = require('./package.json');

function getCommit(): string {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); }
  catch { return ''; }
}

// VITE_BASE overrides the base path. GitHub Pages needs /Autopilot/, Docker needs /.
const base = process.env.VITE_BASE ?? (process.env.NODE_ENV === 'production' ? '/Autopilot/' : '/');

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(getCommit()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'pwa-192.png', 'pwa-512.png'],
      manifest: {
        name: 'Autopilot',
        short_name: 'Autopilot',
        description: 'Local-first portfolio planning with PERT, Gantt, and critical path',
        theme_color: '#0D1117',
        background_color: '#0D1117',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
});
