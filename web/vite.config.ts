import { defineConfig } from 'vitest/config';
import type { ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** HTML reload stays on the SPA; fetch still goes to the API. */
function toApi(): ProxyOptions {
  return {
    target: 'http://localhost:3000',
    bypass(req) {
      if (req.headers.accept?.includes('text/html')) return '/index.html';
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/auth': toApi(),
      '/health': toApi(),
      '/movies': toApi(),
      '/events': toApi(),
      '/tickets': toApi(),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
