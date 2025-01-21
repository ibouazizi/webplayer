import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      },
      output: {
        manualChunks: {
          three: ['three'],
          vendor: ['dashjs']
        }
      }
    },
    // Copy static assets
    copyPublicDir: true,
    // Ensure WASM files are handled
    assetsInlineLimit: 0,
    target: 'esnext',
    minify: false
  },
  worker: {
    rollupOptions: {
      output: {
        format: 'es',
        inlineDynamicImports: true
      }
    }
  },
  optimizeDeps: {
    include: ['three', 'dashjs']
  },
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'cross-origin'
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      'three-gltf-extensions': resolve(__dirname, './src/js/three-gltf-extensions')
    }
  }
});