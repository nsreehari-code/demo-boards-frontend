import { defineConfig, devices } from '@playwright/test';

const FRONTEND_PORT = 5510;
const FRONTEND_HOST = '127.0.0.1';
const BASE_URL = `http://${FRONTEND_HOST}:${FRONTEND_PORT}`;

export default defineConfig({
  testDir: './tests',
  testMatch: ['smokestrategist-ui.spec.js', 'smokestrategist-fresh-ui.spec.js'],
  timeout: 20 * 60_000,
  expect: {
    timeout: 30_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node ../demo-boards-ns-code/demo-board/scripts/start-local-hosts.cjs',
      url: 'http://127.0.0.1:7799/healthz',
      reuseExistingServer: true,
      timeout: 240_000,
    },
    {
      command: `npm run dev -- --host ${FRONTEND_HOST} --strictPort`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
