import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import viteCompression from 'vite-plugin-compression';
import { resolve } from 'path';

export default defineConfig(({ command, mode }) => {
  const isProd = mode === 'production';

  return {
    root: '.',
    base: './',
    publicDir: 'public',
    
    build: {
      target: 'es2015',
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: true,
      minify: isProd ? 'terser' : false,
      terserOptions: {
        compress: {
          drop_console: isProd,
          drop_debugger: isProd
        }
      },
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html')
        },
        output: {
          manualChunks: {
            three: ['three'],
            vendor: ['dashjs', 'mp4box']
          }
        }
      },
      chunkSizeWarningLimit: 500
    },

    server: {
      host: true,
      port: 3000,
      open: true,
      cors: true,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp'
      }
    },

    preview: {
      port: 3000,
      open: true,
      cors: true,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp'
      }
    },

    plugins: [
      // Legacy browsers support
      legacy({
        targets: ['defaults', 'not IE 11']
      }),
      
      // Compression
      ...(isProd ? [
        viteCompression({
          verbose: true,
          algorithm: 'gzip',
          ext: '.gz'
        }),
        viteCompression({
          verbose: true,
          algorithm: 'brotliCompress',
          ext: '.br'
        })
      ] : [])
    ],

    optimizeDeps: {
      include: ['three', 'dashjs', 'mp4box'],
      exclude: []
    },

    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
        'three-examples': resolve(__dirname, './node_modules/three/examples/jsm')
      }
    }
  };
});
