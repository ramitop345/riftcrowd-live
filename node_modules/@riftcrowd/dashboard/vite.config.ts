/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/health': 'http://127.0.0.1:8787',
      '/status': 'http://127.0.0.1:8787',
      '/config': 'http://127.0.0.1:8787',
      '/control': 'http://127.0.0.1:8787',
      '/events': 'http://127.0.0.1:8787',
      '/commands': 'http://127.0.0.1:8787',
      '/director': 'http://127.0.0.1:8787',
      '/mock': 'http://127.0.0.1:8787',
      '/gifts': 'http://127.0.0.1:8787',
      '/engagement': 'http://127.0.0.1:8787',
      '/viewer': 'http://127.0.0.1:8787',
      '/version': 'http://127.0.0.1:8787',
      '/diagnostics': 'http://127.0.0.1:8787',
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
  },
});
