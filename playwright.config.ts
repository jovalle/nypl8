import { defineConfig, devices } from '@playwright/test';

const basePath =
  process.env.NEXT_PUBLIC_PLATE_PANTRY_BASE_PATH ?? process.env.NEXT_PUBLIC_NYPL8_BASE_PATH ?? '';
const frontendPort = process.env.PLAYWRIGHT_PORT ?? '15360';
const backendPort = process.env.PLAYWRIGHT_BACKEND_PORT ?? '18080';
const origin = `http://127.0.0.1:${frontendPort}`;
const serverUrl = `${origin}${basePath}`;

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'line',
  use: {
    baseURL: origin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run build && npm start',
    url: serverUrl,
    env: {
      PORT: frontendPort,
      DMV_BACKEND_PORT: backendPort,
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
