import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageJson = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8'));
const yamlFlowCdnVersion = String(packageJson.yamlFlowCdnVersion || '').trim();

if (!yamlFlowCdnVersion) {
  throw new Error('package.json must define a non-empty yamlFlowCdnVersion');
}

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
  plugins: [
    react(),
    {
      name: 'inject-yaml-flow-cdn-version',
      transformIndexHtml(html) {
        return html.replaceAll('%YAML_FLOW_CDN_VERSION%', yamlFlowCdnVersion);
      },
    },
  ],
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
