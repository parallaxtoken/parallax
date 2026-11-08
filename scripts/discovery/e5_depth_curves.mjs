// E5: on-chain buy quotes (USDT->wrapper) at $10/$50/$250/$1000 per wrapper, expressed per share using the
// E2 unit factor and compared with the equity reference share price (Ondo stockInfo.price, the only
// non-derived reference the API exposes). Writes data/discovery/e5_depth_curves.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { quoteBuy, A } from './lib_pancake.mjs';
const e2 = JSON.parse(readFileSync('data/discovery/e2_unit_factors.json', 'utf8'));
const e3 = JSON.parse(readFileSync('data/discovery/e3_reference_and_units.json', 'utf8'));
const ref = {}; for (const r of e3.rows) if (r.issuer === 'ONDO' && r.stockInfoPrice) ref[r.ticker] = r.stockInfoPrice;
const SIZES = [10, 50, 250, 1000];
const out = { generatedAt: new Date().toISOString(), block: null, referenceSource: 'Ondo dynamic stockInfo.price', rows: [] };
for (const w of e2.wrappers) {
  const unit = w.issuer === 'XSTOCKS' ? 1 : Number(BigInt(w.sharesPerToken)) / 1e18;
  const row = { ticker: w.ticker, issuer: w.issuer, symbol: w.symbol, token: w.token, unit, referenceUsdPerShare: ref[w.ticker] ?? null, curve: {} };
  for (const usd of SIZES) {
    const qs = await quoteBuy(A.USDT, w.token, usd);
    const ok = qs.filter((q) => q.tokensOut).map((q) => { const tokens = Number(q.tokensOut) / 1e18; const shares = tokens * unit; const perShare = usd / shares; return { venue: q.venue, pool: q.pool, tokens, shares, usdPerShare: perShare, netVsRef: ref[w.ticker] ? perShare / ref[w.ticker] - 1 : null }; });
    ok.sort((a, b) => b.shares - a.shares);
    row.curve[usd] = { best: ok[0] ?? null, venues: ok };
  }
  out.rows.push(row);
  const b = row.curve[50].best;
  console.log(w.ticker.padEnd(6), w.issuer.padEnd(8), w.symbol.padEnd(8), b ? `$50 -> ${b.shares.toFixed(5)} sh @ ${b.usdPerShare.toFixed(2)} (${b.venue}) net ${(b.netVsRef * 100).toFixed(2)}%` : 'no route');
}
writeFileSync('data/discovery/e5_depth_curves.json', JSON.stringify(out, null, 2));
