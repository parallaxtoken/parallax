// E6 (build leg): request swap calldata with ParallaxBook as taker for one wrapper per issuer and record
// who the router is, whether the output recipient is the book, and whether the Transaction API simulates it.
import { writeFileSync } from 'node:fs';
import '../mainnet/lib';
import { SignedClient } from '@parallax/binance';
import { USDT, wrappersFor } from '@parallax/registry';

const client = new SignedClient({ apiKey: process.env.BINANCE_WEB3_API_KEY!, secretKey: process.env.BINANCE_WEB3_SECRET_KEY!, origin: process.env.BINANCE_WEB3_ORIGIN });
const BOOK = (process.env.NEXT_PUBLIC_PARALLAXBOOK ?? process.env.NEXT_PUBLIC_TAREBOOK)!;
const out: Record<string, unknown>[] = [];
for (const issuer of ['BSTOCKS', 'ONDO'] as const) {
  const w = wrappersFor('NVDA').find((x) => x.issuer === issuer)!;
  const amountRaw = (10n * 10n ** 18n).toString(); // 10 USDT: the API enforces a 5 USD minimum order; calldata is built, never sent
  const q = await client.quote({ from: USDT, to: w.token, amountRaw, taker: BOOK });
  if (!q.ok || !q.data[0]) { out.push({ issuer, quote: 'degraded' in q ? q.degraded : 'none' }); continue; }
  const route = q.data[0];
  const s = await client.swap({ quoteId: route.quoteId, from: USDT, to: w.token, amountRaw, taker: BOOK, slippagePercent: '1' });
  let sim: unknown = null;
  if (s.ok) {
    const r = await client.simulate({ from: BOOK, to: s.data.to, data: s.data.data, value: s.data.value });
    sim = r.ok ? r.data : 'degraded' in r ? r.degraded : 'none';
  }
  out.push({ issuer, symbol: w.symbol, route: { vendor: route.vendorName, mode: route.executionMode, approveTarget: route.approveTarget, toTokenAmount: route.toTokenAmount },
    swap: s.ok ? { to: s.data.to, from: s.data.from, dataBytes: (s.data.data.length - 2) / 2, selector: s.data.data.slice(0, 10), value: s.data.value, gas: s.data.gas, containsBookInCalldata: s.data.data.toLowerCase().includes(BOOK.slice(2).toLowerCase()) } : ('degraded' in s ? s.degraded : 'none'), simulation: sim });
  console.log(JSON.stringify(out.at(-1)));
}
writeFileSync('data/discovery/e6_swap_build.json', JSON.stringify({ generatedAt: new Date().toISOString(), taker: BOOK, results: out }, null, 2));
