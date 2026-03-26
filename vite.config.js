import { defineConfig, createLogger } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

// Suppress noisy sourcemap warnings from @antv packages
const logger = createLogger();
const _warn = logger.warn;
const _warnOnce = logger.warnOnce;
const _sourcemapFilter = (msg) =>
  typeof msg === 'string' && msg.includes('points to missing source files');
logger.warn = (msg, options) => {
  if (_sourcemapFilter(msg)) return;
  _warn(msg, options);
};
logger.warnOnce = (msg, options) => {
  if (_sourcemapFilter(msg)) return;
  _warnOnce(msg, options);
};

export default defineConfig({
  customLogger: logger,
  plugins: [
    wasm(),
    topLevelAwait(),
    react(),
  ],
  server: {
    port: 3000,
    host: '0.0.0.0',
    open: false,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
    watch: {
      usePolling: process.env.DOCKER_DEV === '1',
      interval: 300,
    },
    hmr: {
      clientPort: 3000,
    },
    sourcemapIgnoreList: (sourcePath) => sourcePath.includes('node_modules'),
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  css: {
    devSourcemap: false,
  },
  optimizeDeps: {
    exclude: ['@antv/layout-wasm'],
    include: ['dagre', 'ml-matrix'],
  },
  build: {
    sourcemap: false,
  },
  worker: {
    format: 'es',
    plugins: () => [wasm(), topLevelAwait()],
  },
});
