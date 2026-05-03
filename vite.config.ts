import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/Idle-game/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Boarder',
        short_name: 'Boarder',
        description: 'Stylized snowboarding — half-pipe and downhill modes.',
        background_color: '#0b1320',
        theme_color: '#0b1320',
        display: 'fullscreen',
        orientation: 'landscape',
        scope: '/Idle-game/',
        start_url: '/Idle-game/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      }
    })
  ]
});
