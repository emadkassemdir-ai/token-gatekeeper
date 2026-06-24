import { defineConfig } from 'vite';

// Build tooling pipeline for the voxel engine.
// - Three.js is pre-bundled into its own chunk to keep the main bundle lean.
// - Source maps are emitted for production debugging of the game loop.
export default defineConfig({
  root: '.',
  base: './',
  server: {
    host: true,
    port: 5173,
    open: true
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three']
        }
      }
    }
  },
  optimizeDeps: {
    include: ['three']
  }
});
