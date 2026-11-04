import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', timeout: 90000, workers: 1,
  use: { baseURL: 'http://localhost:3417', launchOptions: { executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } },
  webServer: { command: 'npm run dev -w @z-pay/frontend -- --port 3417', url: 'http://localhost:3417', reuseExistingServer: false, timeout: 60000 },
});
