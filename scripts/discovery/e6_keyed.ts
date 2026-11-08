// E3 (keyed leg), E5 (aggregator depth), E6 (contract taker) and E11 (route kinds): with an API key, ask the
// Trading API for quotes per wrapper with ParallaxBook as the taker, at four sizes, and record route detail.
import { writeFileSync } from 'node:fs';
import '../mainnet/lib';
import { SignedClient } from '@parallax/binance';
import { CORE_TICKERS, USDT, wrappersFor } from '@parallax/registry';

const key = process.env.BINANCE_WEB3_API_KEY, secret = process.env.BINANCE_WEB3_SECRET_KEY;
if (!key || !secret) throw new Error('BINANCE_WEB3_API_KEY and BINANCE_WEB3_SECRET_KEY are required');
const client = new SignedClient({ apiKey: key, secretKey: secret, origin: process.env.BINANCE_WEB3_ORIGIN });
const BOOK = (process.env.NEXT_PUBLIC_PARALLAXBOOK ?? process.env.NEXT_PUBLIC_TAREBOOK) as string;
const SIZES = [10, 50, 250, 1000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Row { ticker: string; symbol: string; issuer: string; usd: number; ok: boolean; latencyMs: number; degraded?: string; routes: { vendor: string | null; mode: string; toTokenAmount: string; approveTarget: string | null; quoteId: string }[] }
const rows: Row[] = [];
const sample: Record<string, unknown> = {};

for (const t of CORE_TICKERS) {
  for (const w of wrappersFor(t).filter((x) => x.core)) {
    for (const usd of SIZES) {
      const amountRaw = (BigInt(usd) * 10n ** 18n).toString();
      const r = await client.quote({ from: USDT, to: w.token, amountRaw, taker: BOOK });
      const row: Row = { ticker: t, symbol: w.symbol, issuer: w.issuer, usd, ok: r.ok, latencyMs: r.latencyMs, routes: [] };
      if (r.ok) {
        row.routes = r.data.map((x) => ({ vendor: x.vendorName, mode: x.executionMode, toTokenAmount: x.toTokenAmount, approveTarget: x.approveTarget, quoteId: x.quoteId }));
        if (!sample[w.issuer]) sample[w.issuer] = r.data[0]?.raw ?? null;
      } else row.degraded = 'degraded' in r ? `${r.degraded.kind}: ${'code' in r.degraded ? r.degraded.code + ' ' : ''}${r.degraded.message}` : 'not found';
      rows.push(row);
      console.log(t.padEnd(6), w.symbol.padEnd(8), `$${usd}`.padEnd(6), r.ok ? row.routes.map((x) => `${x.vendor}/${x.mode}`).join(' ') || 'no routes' : row.degraded);
      await sleep(250);
    }
  }
}
writeFileSync('data/discovery/e6_contract_taker.json', JSON.stringify({ generatedAt: new Date().toISOString(), taker: BOOK, sizes: SIZES, rows, sampleRawByIssuer: sample }, null, 2));
