import { defineConfig } from '@playwright/test';

const sizes = [
  ['iphone-se', 375, 667], ['iphone-15-pro', 393, 852], ['pixel-7', 412, 915], ['galaxy-s', 360, 800],
  ['ipad-mini', 768, 1024], ['ipad-pro', 1024, 1366], ['laptop', 1366, 768], ['desktop', 1440, 900], ['wide', 1920, 1080],
] as const;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  workers: 3,
  reporter: [['list']],
  use: { baseURL: process.env.BASE_URL ?? 'http://localhost:3000', trace: 'off' },
  projects: sizes.map(([name, width, height]) => ({ name, use: { browserName: 'chromium' as const, viewport: { width, height }, isMobile: width < 700 } })),
});
