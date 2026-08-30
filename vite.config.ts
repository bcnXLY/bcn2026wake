import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon-16x16.png',
        'favicon-32x32.png',
        'apple-touch-icon.png',
        'logo-mark.png',
      ],
      manifest: {
        name: 'Awakening ',
        short_name: 'Awakening',
        description: 'Your personal companion for the event.',
        theme_color: '#e8ecf3',
        background_color: '#e8ecf3',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            // Separate file: the maskable variant carries extra padding so the
            // figure survives Android's circular/squircle crop.
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Cache Google Drive thumbnails so the gallery works offline-ish and fast.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(www\.)?googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'gdrive-api-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/(lh3|drive)\.google(usercontent)?\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gdrive-thumb-cache',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 3 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
