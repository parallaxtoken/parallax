// Builds the read-only RWA catalogue snapshot: every BSC tokenized-equity token the Binance list endpoint returns,
// with its company name, industry and issuer type, so the Shelf can show the whole universe with search and sectors.
// Re-run to refresh. Output: apps/web/lib/catalogue.generated.json
import { writeFileSync } from 'node:fs';
import { PublicRwaClient } from '@parallax/binance';

const rwa = new PublicRwaClient({ origin: process.env.BINANCE_API_ORIGIN });
const list = await rwa.list();
if (!list.ok) throw new Error('list failed: ' + JSON.stringify(list));
const bsc = list.data.filter((r) => r.chainId === '56');
console.log('rows', list.data.length, 'bsc', bsc.length);

const TYPE: Record<number, 'ONDO' | 'XSTOCKS' | 'BSTOCKS'> = { 1: 'ONDO', 2: 'XSTOCKS', 3: 'BSTOCKS' };
const byTicker = new Map<string, { ticker: string; tokens: { symbol: string; token: string; issuer: string; multiplier: string | null }[] }>();
for (const r of bsc) {
  const e = byTicker.get(r.ticker) ?? { ticker: r.ticker, tokens: [] };
  e.tokens.push({ symbol: r.symbol, token: r.contractAddress, issuer: TYPE[r.type] ?? `TYPE_${r.type}`, multiplier: r.multiplier });
  byTicker.set(r.ticker, e);
}
const tickers = [...byTicker.values()];
const meta: Record<string, { name: string | null; industry: string | null; icon: string | null }> = {};
let i = 0;
async function worker() {
  while (i < tickers.length) {
    const t = tickers[i++]!;
    const m = await rwa.meta(t.tokens[0]!.token).catch(() => null);
    if (m && m.ok) meta[t.ticker] = { name: m.data.companyName ?? m.data.name, industry: m.data.industry, icon: m.data.iconUrl };
    else meta[t.ticker] = { name: null, industry: null, icon: null };
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
const out = tickers
  .map((t) => ({ ticker: t.ticker, name: meta[t.ticker]?.name ?? null, industry: meta[t.ticker]?.industry ?? null, icon: meta[t.ticker]?.icon ?? null, tokens: t.tokens }))
  .sort((a, b) => a.ticker.localeCompare(b.ticker));
writeFileSync('apps/web/lib/catalogue.generated.json', JSON.stringify({ generatedAt: new Date().toISOString(), tokenCount: bsc.length, tickerCount: out.length, tickers: out }));
console.log('tickers', out.length, 'with industry', out.filter((x) => x.industry).length);
