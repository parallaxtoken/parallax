// E3: for every wrapper, compare (a) the API's tokenInfo.price, (b) API sharesMultiplier, (c) the
// on-chain unit from E2, (d) stockInfo.price (the only non-derived reference the API exposes), and the
// documented derivation referencePrice = tokenPrice / sharesMultiplier. Writes e3_reference_and_units.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { dynamicV2, assetStatus } from './lib_binance.mjs';
const e2 = JSON.parse(readFileSync('data/discovery/e2_unit_factors.json', 'utf8'));
const rows = [];
for (const w of e2.wrappers) {
  const d = await dynamicV2(w.token); const s = await assetStatus(w.token);
  const ti = d.data?.tokenInfo ?? {}, si = d.data?.stockInfo ?? {};
  const price = ti.price ? Number(ti.price) : null, apiMult = ti.sharesMultiplier ? Number(ti.sharesMultiplier) : null;
  const chainUnit = w.issuer === 'XSTOCKS' ? Number(BigInt(w.unit.value)) / 1e18 : Number(BigInt(w.sharesPerToken)) / 1e18;
  const stockPx = si.price ? Number(si.price) : null;
  const derivedRef = price != null && apiMult ? price / apiMult : null;
  rows.push({ ticker: w.ticker, issuer: w.issuer, symbol: w.symbol, token: w.token, apiType: d.data?.type ?? null, tokenPrice: price, apiSharesMultiplier: apiMult, chainUnitValue: chainUnit,
    multiplierMatchesChain: apiMult != null ? Math.abs(apiMult - chainUnit) < 1e-9 : null, stockInfoPrice: stockPx, derivedReference: derivedRef,
    derivedVsStockInfoPct: derivedRef && stockPx ? (derivedRef / stockPx - 1) * 100 : null,
    tokenVsStockInfoPct: price && stockPx ? (price / stockPx - 1) * 100 : null,
    status: s.data ?? null, dynamicHttp: d.http, dynamicCode: d.code, ms: d.ms });
}
const out = { generatedAt: new Date().toISOString(), rows };
writeFileSync('data/discovery/e3_reference_and_units.json', JSON.stringify(out, null, 2));
const f = (x, n = 4) => x == null ? '-' : x.toFixed(n);
for (const r of rows) console.log(r.ticker.padEnd(6), r.issuer.padEnd(8), r.symbol.padEnd(8), 'tok', f(r.tokenPrice, 2).padStart(9), 'mult', f(r.apiSharesMultiplier, 6), 'chain', f(r.chainUnitValue, 6), r.multiplierMatchesChain, 'stk', f(r.stockInfoPrice, 2).padStart(9), 'drv', f(r.derivedReference, 2).padStart(9), 'tok/stk%', f(r.tokenVsStockInfoPct, 3), 'drv/stk%', f(r.derivedVsStockInfoPct, 3), r.status?.reasonCode);
