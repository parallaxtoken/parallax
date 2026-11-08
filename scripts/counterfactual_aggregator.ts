// Counterfactual on the keyed aggregator snapshot (E5/E6): per ticker and size, naive = most tokens (lowest token
// price) vs Parallax = most shares, among wrappers that returned a SWAP route with the book as taker.
import { readFileSync, writeFileSync } from 'node:fs';
import { wrapperByToken, wrappersFor, readUnit, makeClient } from '@parallax/registry';

const snap = JSON.parse(readFileSync('data/discovery/e6_contract_taker.json', 'utf8')) as { generatedAt: string; rows: { ticker: string; symbol: string; issuer: string; usd: number; ok: boolean; routes: { toTokenAmount: string; mode: string }[] }[] };
const chain = makeClient(process.env.BSC_RPC_URL);
const units: Record<string, number> = {};
for (const r of snap.rows) {
  if (units[r.symbol] !== undefined) continue;
  const w = wrappersFor(r.ticker).find((x) => x.symbol === r.symbol);
  if (!w) continue;
  units[r.symbol] = w.issuer === 'XSTOCKS' ? 1 : Number((await readUnit(chain, w)).unit) / 1e18;
}
const groups = new Map<string, { symbol: string; tokens: number; shares: number }[]>();
for (const r of snap.rows) {
  const best = r.routes.filter((x) => x.mode === 'SWAP').map((x) => Number(BigInt(x.toTokenAmount)) / 1e18).sort((a, b) => b - a)[0];
  if (!r.ok || best === undefined) continue;
  const k = `${r.ticker}:${r.usd}`;
  groups.set(k, [...(groups.get(k) ?? []), { symbol: r.symbol, tokens: best, shares: best * (units[r.symbol] ?? 1) }]);
}
const rows = [...groups.entries()].filter(([, v]) => v.length >= 2).map(([k, v]) => {
  const naive = v.reduce((a, b) => (b.tokens > a.tokens ? b : a));
  const parallax = v.reduce((a, b) => (b.shares > a.shares ? b : a));
  return { key: k, candidates: v.map((x) => x.symbol), naive: naive.symbol, parallax: parallax.symbol, differs: naive.symbol !== parallax.symbol, parallaxOverNaiveBps: (parallax.shares / naive.shares - 1) * 1e4 };
});
const out = { generatedAt: new Date().toISOString(), source: 'data/discovery/e6_contract_taker.json', snapshotAt: snap.generatedAt, groups: rows.length, differs: rows.filter((r) => r.differs).length, meanParallaxOverNaiveBps: rows.length ? rows.reduce((a, r) => a + r.parallaxOverNaiveBps, 0) / rows.length : null, maxParallaxOverNaiveBps: Math.max(0, ...rows.map((r) => r.parallaxOverNaiveBps)), rows };
writeFileSync('data/counterfactual/aggregator_snapshot.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({ groups: out.groups, differs: out.differs, mean: out.meanParallaxOverNaiveBps, max: out.maxParallaxOverNaiveBps }));
void wrapperByToken;
