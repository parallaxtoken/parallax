import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');
const desktopDir = join(root, 'docs', 'media', 'qa', 'desktop');
const mediaDir = join(root, 'docs', 'media');

async function main() {
  console.log('Capturing shelf with extended timeout...');
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto('http://localhost:3000/app', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(desktopDir, 'shelf.png'), fullPage: false });
  await page.screenshot({ path: join(mediaDir, 'parallax-shelf.png'), fullPage: false });
  console.log('Shelf screenshot saved successfully!');
  await browser.close();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

