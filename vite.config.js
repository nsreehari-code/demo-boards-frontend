import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/demo-boards-frontend/' : '/',
  plugins: [react()],
  server: {
    port: 5510,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
}));
