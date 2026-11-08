// Saves the vendor developer docs (behind a bot challenge) by fetching from inside a real browser context.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const ORIGIN = 'https://web3.binance.com';
mkdirSync('docs/vendor', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${ORIGIN}/en/dev-docs/introduction`, { waitUntil: 'networkidle', timeout: 60000 });
for (const f of ['llms.txt', 'llms-full.txt']) {
  const text = await page.evaluate(async (u) => { const r = await fetch(u); return r.ok ? await r.text() : `HTTP ${r.status}`; }, `/en/dev-docs/${f}`);
  writeFileSync(`docs/vendor/binance-web3-${f}`, text);
  console.log(f, text.length);
}
writeFileSync('docs/vendor/README.md', `# Vendor documentation snapshots\n\nFetched ${new Date().toISOString()} from ${ORIGIN}/en/dev-docs/ with \`scripts/vendor_docs.mjs\`.\nThe origin sits behind a bot challenge, so a plain HTTP client receives an empty \`202\`; the script fetches from inside a browser context.\n`);
await browser.close();
