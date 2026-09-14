import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendPort = process.env.DEMO_BACKEND_PORT || '4000';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': `http://localhost:${backendPort}`,
      '/uploads': `http://localhost:${backendPort}`,
    },
  },
});
