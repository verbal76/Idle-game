import { defineConfig } from 'vite';

export default defineConfig({
  // Capacitor's WebView loads index.html from a local origin
  // (capacitor://localhost or http://localhost), so relative asset
  // paths work cleanly.
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
  }
});
