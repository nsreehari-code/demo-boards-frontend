import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const YAML_FLOW_BROWSER_ROUTE = '/yaml-flow-browser/';
const yamlFlowBrowserRoot = resolve(import.meta.dirname, '..', 'yaml-flow', 'browser');
const contentTypes = {
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function createYamlFlowBrowserMiddleware() {
  const rootPrefix = `${yamlFlowBrowserRoot}${sep}`;

  return async (req, res, next) => {
    const requestUrl = typeof req.url === 'string' ? req.url : '';
    const pathname = requestUrl.split('?')[0];

    if (!pathname.startsWith(YAML_FLOW_BROWSER_ROUTE)) {
      next();
      return;
    }

    const relativePath = decodeURIComponent(pathname.slice(YAML_FLOW_BROWSER_ROUTE.length));
    const filePath = resolve(yamlFlowBrowserRoot, relativePath);

    if (filePath !== yamlFlowBrowserRoot && !filePath.startsWith(rootPrefix)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    try {
      const body = await readFile(filePath);
      res.statusCode = 200;
      res.setHeader('Content-Type', contentTypes[extname(filePath)] || 'application/octet-stream');
      res.end(body);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        next();
        return;
      }
      res.statusCode = 500;
      res.end(`Failed to read yaml-flow browser asset: ${error?.message || 'unknown error'}`);
    }
  };
}

function manualChunks(id) {
  if (id.includes('/node_modules/react/')) return 'react';
  if (id.includes('/node_modules/react-dom/')) return 'react';
  if (id.includes('/node_modules/recharts/')) return 'recharts';
  if (id.includes('/node_modules/@xyflow/react/')) return 'xyflow';
  if (id.includes('/node_modules/react-markdown/') || id.includes('/node_modules/remark-gfm/')) return 'markdown';
  if (id.includes('/yaml-flow/browser/')) return 'browser-runtime';
  return undefined;
}

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/demo-boards-frontend/' : '/',
  plugins: [
    react(),
    {
      name: 'serve-yaml-flow-browser-assets',
      configureServer(server) {
        server.middlewares.use(createYamlFlowBrowserMiddleware());
      },
      configurePreviewServer(server) {
        server.middlewares.use(createYamlFlowBrowserMiddleware());
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
