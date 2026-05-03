import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative paths so the build works on any host (Cloudflare Pages,
  // GitHub Pages, sideloaded TWA). Cloudflare serves at idle-game.pages.dev/
  // root, not under a /Idle-game/ subpath.
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@babylonjs/core')) return 'babylon-core';
          if (id.includes('node_modules/@babylonjs/loaders')) return 'babylon-loaders';
          if (id.includes('node_modules/idb')) return 'idb';
          return undefined;
        }
      }
    }
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      workbox: {
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,webmanifest}']
      },
      manifest: {
        name: 'Boarder',
        short_name: 'Boarder',
        description: 'Stylized snowboarding — half-pipe and downhill modes.',
        background_color: '#0b1320',
        theme_color: '#0b1320',
        display: 'fullscreen',
        orientation: 'landscape',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      }
    })
  ]
});
