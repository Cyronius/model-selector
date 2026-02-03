import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'example',
  build: {
    outDir: '../dist-example',
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
