import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  // Capacitor / Expo WebView load this index.html from a local file:// URI;
  // relative paths work cleanly there.
  base: './',
  build: {
    // Single self-contained HTML so Expo Asset bundling only needs one file
    // and EAS Update can ship gameplay changes OTA without juggling chunks.
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  },
  plugins: [viteSingleFile()]
});
