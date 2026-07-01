import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Split large, stable vendors out of the entry chunk: the frequently-changing
        // app code stays in a small index.js, while maplibre-gl (the bulk) caches
        // separately and loads in parallel. See wishlist #34.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('maplibre-gl') || id.includes('@mapbox')) return 'maplibre'
            return 'vendor'
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
})
