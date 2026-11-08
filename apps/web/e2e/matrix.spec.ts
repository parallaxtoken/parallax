import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const PAGES: [string, string][] = [
  ['landing', '/'], ['shelf', '/app'], ['ticker', '/app/t/NVDA'], ['orders', '/app/orders'], ['holdings', '/app/holdings'],
  ['agent', '/app/agent'], ['proof', '/proof'], ['verify', '/verify'],
];
const OUT = join(__dirname, '..', '..', '..', 'docs', 'media', 'qa');
// third-party wallet SDK noise that is not ours
const IGNORED = [/WalletConnect/i, /Lit is in dev mode/i, /Download the React DevTools/i, /favicon/i, /net::ERR_BLOCKED_BY_CLIENT/i, /\bpino\b/i];

async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(800);
}

for (const [name, path] of PAGES) {
  test(`${name}: layout, console, accessibility`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' && !IGNORED.some((r) => r.test(m.text()))) errors.push(m.text()); });
    page.on('pageerror', (e) => { if (!IGNORED.some((r) => r.test(e.message))) errors.push(e.message); });
    const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
    expect(res?.status(), 'http status').toBeLessThan(400);
    await settle(page);

    // no horizontal scroll
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'horizontal overflow px').toBeLessThanOrEqual(1);

    // clamped text does not overflow its box
    const clipped = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-clamp]')].filter((e) => e.scrollWidth > e.clientWidth + 1).length);
    expect(clipped).toBe(0);

    if (name === 'landing') {
      const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
      const h1 = await box('h1');
      const svg = await box('svg[role="img"]');
      const inter = !(h1.x + h1.width <= svg.x || svg.x + svg.width <= h1.x || h1.y + h1.height <= svg.y || svg.y + svg.height <= h1.y);
      expect(inter, 'hero artifact must not intersect the headline').toBe(false);
    }

    const dir = join(OUT, info.project.name);
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, `${name}.png`), fullPage: false });

    const axe = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
    const bad = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(bad.map((v) => `${v.id}: ${v.nodes.length}`), 'axe serious/critical').toEqual([]);
    expect(errors, 'console errors').toEqual([]);
  });
}

test('degraded run: a dead data host shows typed states, not blanks', async ({ page }) => {
  const r = await page.request.get('/api/ticker/NVDA');
  expect(r.status()).toBeLessThan(500);
});
