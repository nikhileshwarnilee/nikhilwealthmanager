import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const rawBase = String(env.VITE_APP_BASE || '/').trim() || '/';
  const withLeadingSlash = rawBase.startsWith('/') ? rawBase : `/${rawBase}`;
  const appBase = withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;

  return {
    base: appBase,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'offline.html', 'icons/icon-192.svg', 'icons/icon-512.svg'],
        manifest: {
          name: 'Expense Manager PWA',
          short_name: 'ExpenseMgr',
          description: 'Smart personal finance manager for income, expenses, transfers, budgets, and insights.',
          theme_color: '#7c3aed',
          background_color: '#f6f7fb',
          display: 'standalone',
          orientation: 'portrait',
          start_url: appBase,
          scope: appBase,
          icons: [
            {
              src: 'icons/icon-192.svg',
              sizes: '192x192',
              type: 'image/svg+xml',
              purpose: 'any'
            },
            {
              src: 'icons/icon-512.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          navigateFallback: `${appBase}offline.html`,
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.destination === 'document',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'pages-cache',
                networkTimeoutSeconds: 4
              }
            },
            {
              urlPattern: ({ request }) => ['style', 'script', 'image', 'font'].includes(request.destination),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'assets-cache'
              }
            }
          ]
        },
        devOptions: {
          enabled: true
        }
      })
    ],
    server: {
      host: true,
      port: 5173
    }
  };
});
