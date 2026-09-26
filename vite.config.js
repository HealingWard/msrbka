import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps the build portable (GitHub Pages sub-path, any static host).
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    // Сервер тестируется своим раннером: cd server && npm test
    exclude: ['server/**', 'node_modules/**', 'dist/**'],
  },
});
