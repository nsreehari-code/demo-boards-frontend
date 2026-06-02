import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function manualChunks(id) {
  if (id.includes('/node_modules/react/')) return 'react';
  if (id.includes('/node_modules/react-dom/')) return 'react';
  if (id.includes('/node_modules/recharts/')) return 'recharts';
  if (id.includes('/node_modules/@xyflow/react/')) return 'xyflow';
  if (id.includes('/node_modules/react-markdown/') || id.includes('/node_modules/remark-gfm/')) return 'markdown';
  if (id.includes('/node_modules/firebase/') || id.includes('/node_modules/@firebase/')) return 'firebase';
  if (id.includes('/yaml-flow/browser/') || id.includes('/src/lib/client-board-runtime.js')) return 'browser-runtime';
  return undefined;
}

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/demo-boards-frontend/' : '/',
  plugins: [react()],
  server: {
    port: 5510,
    fs: {
      allow: ['..'],
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
}));
