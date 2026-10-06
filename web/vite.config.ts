import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the same build works at / (served by the API server) and at
  // /<repo>/ on GitHub Pages.
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    fs: { allow: ['..'] },
    proxy: { '/api': 'http://localhost:3000' },
  },
});
