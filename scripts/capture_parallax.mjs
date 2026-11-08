import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');
const desktopDir = join(root, 'docs', 'media', 'qa', 'desktop');
const mediaDir = join(root, 'docs', 'media');

mkdirSync(desktopDir, { recursive: true });
mkdirSync(mediaDir, { recursive: true });

async function main() {
  console.log('Launching installed Chrome browser...');
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // retina 2x crispness
  });
  const page = await context.newPage();

  const pages = [
    { url: 'http://localhost:3000/', name: 'landing', waitMs: 1500 },
    { url: 'http://localhost:3000/app', name: 'shelf', waitMs: 1500 },
    { url: 'http://localhost:3000/app/t/NVDA', name: 'ticker', waitMs: 1500 },
    { url: 'http://localhost:3000/app/orders', name: 'orders', waitMs: 1500 },
    { url: 'http://localhost:3000/app/holdings', name: 'holdings', waitMs: 1500 },
    { url: 'http://localhost:3000/app/agent', name: 'agent', waitMs: 1500 },
    { url: 'http://localhost:3000/proof', name: 'proof', waitMs: 1500 },
    { url: 'http://localhost:3000/verify', name: 'verify', waitMs: 1500 },
  ];

  for (const item of pages) {
    console.log(`Navigating to ${item.url} (${item.name})...`);
    try {
      await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(item.waitMs);
      
      const qaPath = join(desktopDir, `${item.name}.png`);
      const mediaPath = join(mediaDir, `parallax-${item.name}.png`);
      
      await page.screenshot({ path: qaPath, fullPage: false });
      await page.screenshot({ path: mediaPath, fullPage: false });
      console.log(`Saved screenshot: ${item.name}.png`);
    } catch (err) {
      console.error(`Error on ${item.name}:`, err.message);
    }
  }

  // Also capture Mobile viewports
  const mobileContext = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  const mobilePage = await mobileContext.newPage();
  console.log('Capturing mobile view of landing...');
  await mobilePage.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await mobilePage.waitForTimeout(1500);
  await mobilePage.screenshot({ path: join(mediaDir, 'parallax-mobile-landing.png'), fullPage: false });

  console.log('Capturing mobile view of shelf...');
  await mobilePage.goto('http://localhost:3000/app', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await mobilePage.waitForTimeout(1500);
  await mobilePage.screenshot({ path: join(mediaDir, 'parallax-mobile-shelf.png'), fullPage: false });

  console.log('Capturing mobile view of ticker...');
  await mobilePage.goto('http://localhost:3000/app/t/NVDA', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await mobilePage.waitForTimeout(1500);
  await mobilePage.screenshot({ path: join(mediaDir, 'parallax-mobile-ticker.png'), fullPage: false });

  await browser.close();
  console.log('All 9 pages and mobile screenshots captured successfully!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
