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
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          recharts: ['recharts'],
          xyflow: ['@xyflow/react'],
          markdown: ['react-markdown', 'remark-gfm'],
        },
      },
    },
  },
}));
