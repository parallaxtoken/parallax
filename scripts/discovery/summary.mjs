// Reads every data/discovery/*.json and writes data/discovery/summary.json. All numbers in DISCOVERY.md come from here.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { session } from './e4_backfill_session.mjs';
const J = (f) => JSON.parse(readFileSync(`data/discovery/${f}`, 'utf8'));
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const e1 = J('e1_wrapper_map.json'), e2 = J('e2_unit_factors.json'), e3 = J('e3_reference_and_units.json'), e5 = J('e5_depth_curves.json');
const e11 = J('e11_pools.json'), e7 = J('e7_contract_receive.json'), e12 = J('e12_broken_quotes.json'), e9 = J('e9_geo_latency.json');
const list = J('e1_rwa_list_by_type.json'), bf = J('e4_backfill_summary.json');
const s = { generatedAt: new Date().toISOString() };
const wr = Object.values(e1.tickers).flat();
s.tickers = Object.keys(e1.tickers).length; s.wrappers = wr.length;
s.byIssuer = Object.fromEntries(['BSTOCKS', 'ONDO', 'XSTOCKS'].map((i) => [i, wr.filter((w) => w.issuer === i).length]));
const all = list.calls.find((c) => c.type === null);
s.api = { rowsAllTypes: all.rows, bscType1: Object.entries(all.byChainType).filter(([k]) => k.startsWith('chain56/type1/')).reduce((a, [, v]) => a + v, 0),
  bscType2: Object.entries(all.byChainType).filter(([k]) => k.startsWith('chain56/type2/')).reduce((a, [, v]) => a + v, 0),
  bscType3: Object.entries(all.byChainType).filter(([k]) => k.startsWith('chain56/type3/')).reduce((a, [, v]) => a + v, 0),
  typeParamEmpty: list.calls.filter((c) => c.type !== null && c.rows === 0).map((c) => c.type), nonOndoTypesReturnRows: list.calls.filter((c) => c.type !== null && c.type !== 1 && c.rows > 0).map((c) => c.type) };
// units
const unitNum = (w) => w.issuer === 'XSTOCKS' ? Number(BigInt(w.unit.value)) / 1e18 : Number(BigInt(w.sharesPerToken)) / 1e18;
const byT = {}; for (const w of e2.wrappers) (byT[w.ticker] ??= {})[w.issuer] = w;
s.units = { nonOneByIssuer: Object.fromEntries(['BSTOCKS', 'ONDO', 'XSTOCKS'].map((i) => [i, e2.wrappers.filter((w) => w.issuer === i && Math.abs(unitNum(w) - 1) > 1e-9).length])),
  maxUnitPct: Math.max(...e2.wrappers.map((w) => (unitNum(w) - 1) * 100)),
  maxOndoVsBstocksBps: Math.max(...Object.values(byT).filter((t) => t.ONDO && t.BSTOCKS).map((t) => Math.abs(unitNum(t.ONDO) / unitNum(t.BSTOCKS) - 1) * 1e4)),
  pausedAny: e2.wrappers.some((w) => w.pause?.paused), block: e2.block };
// api vs chain
const rows = e3.rows;
const x = rows.filter((r) => r.issuer === 'XSTOCKS');
s.apiVsChain = { bstocksMatch: rows.filter((r) => r.issuer === 'BSTOCKS' && r.multiplierMatchesChain).length, bstocksTotal: rows.filter((r) => r.issuer === 'BSTOCKS').length,
  ondoMatch: rows.filter((r) => r.issuer === 'ONDO' && r.multiplierMatchesChain).length, ondoTotal: rows.filter((r) => r.issuer === 'ONDO').length,
  xstocksMismatch: x.filter((r) => r.multiplierMatchesChain === false).length, xstocksTotal: x.length,
  xstocksMaxMultDeviationBps: Math.max(...x.map((r) => Math.abs(r.apiSharesMultiplier / r.chainUnitValue - 1) * 1e4)) };
s.reference = { bstocksWithoutStockPrice: rows.filter((r) => r.issuer === 'BSTOCKS' && r.stockInfoPrice == null).length, bstocksTotal: s.byIssuer.BSTOCKS,
  ondoDerivedVsStockMaxAbsPct: Math.max(...rows.filter((r) => r.issuer === 'ONDO' && r.derivedVsStockInfoPct != null).map((r) => Math.abs(r.derivedVsStockInfoPct))),
  xstocksApiPriceVsStockMaxAbsPct: Math.max(...x.map((r) => Math.abs(r.tokenVsStockInfoPct))), xstocksApiPriceOver5pct: x.filter((r) => Math.abs(r.tokenVsStockInfoPct) > 5).length };
// liquidity: deepest pool per wrapper
const deepest = e11.wrappers.map((w) => ({ issuer: w.issuer, usd: Math.max(0, ...w.pools.map((p) => p.reserveUsd || 0)) }));
s.liquidity = Object.fromEntries(['BSTOCKS', 'ONDO', 'XSTOCKS'].map((i) => { const v = deepest.filter((d) => d.issuer === i).map((d) => d.usd); return [i, { medianDeepestPoolUsd: med(v), under10k: v.filter((u) => u < 1e4).length, n: v.length }]; }));
// E5 naive vs per-share at $50
const flips = []; let bothRouted = 0;
for (const t of Object.keys(e1.tickers)) {
  const c = e5.rows.filter((r) => r.ticker === t && r.curve['50'].best);
  if (c.length < 2) continue; bothRouted++;
  const naive = c.reduce((a, b) => (a.curve['50'].best.usdPerShare * a.unit < b.curve['50'].best.usdPerShare * b.unit ? a : b)); // lowest USD per TOKEN
  const naiveTok = c.reduce((a, b) => ((50 / a.curve['50'].best.tokens) < (50 / b.curve['50'].best.tokens) ? a : b));
  const parallax = c.reduce((a, b) => (a.curve['50'].best.shares > b.curve['50'].best.shares ? a : b));
  flips.push({ ticker: t, naive: naiveTok.symbol, parallax: parallax.symbol, differs: naiveTok.token !== parallax.token, parallaxOverNaiveBps: (parallax.curve['50'].best.shares / naiveTok.curve['50'].best.shares - 1) * 1e4 });
}
s.perShareRouting = { tickersWithTwoRoutes: bothRouted, naiveDiffersFromParallax: flips.filter((f) => f.differs).length, detail: flips, maxParallaxOverNaiveBps: Math.max(0, ...flips.map((f) => f.parallaxOverNaiveBps)) };
// E7
const t7 = e7.rows.filter((r) => typeof r.results === 'object');
s.contractReceive = { tested: t7.length, allOk: t7.filter((r) => Object.values(r.results).every((v) => v === 'OK')).length, noHolder: e7.rows.length - t7.length, anyRevert: t7.filter((r) => Object.values(r.results).some((v) => v !== 'OK')).length };
let flagged = 0;
for (const bySess of Object.values(e12.bySessionIssuer)) for (const e of Object.values(bySess)) flagged += e.chainBroken + e.apiBroken;
s.brokenQuotes = { cycles: e12.cycles, observations: e12.observations, flaggedTotal: flagged, bySessionIssuer: e12.bySessionIssuer };
s.latency = { egress: e9.egress.country, p50: Object.fromEntries(Object.entries(e9.endpoints).map(([k, v]) => [k, v.p50])), p95: Object.fromEntries(Object.entries(e9.endpoints).map(([k, v]) => [k, v.p95])) };
s.backfill = bf.sessions;
if (existsSync('data/discovery/e8_unit_history.json')) {
  const e8 = J('e8_unit_history.json'); const kinds = {}; for (const e of e8.ondoOracleEvents) kinds[e.event] = (kinds[e.event] ?? 0) + 1;
  const assets = new Set(e8.ondoOracleEvents.filter((e) => e.event === 'SValueUpdated').map((e) => e.asset));
  s.history = { days: e8.days, windows: e8.windows, failedWindows: e8.failedWindows.length, ondoEvents: e8.ondoOracleEvents.length, ondoByKind: kinds, ondoAssetsWithSValueUpdate: assets.size,
    bstockMultiplierEvents: e8.bstockMultiplierEvents.length, xstocksUpdateArrays: Object.fromEntries(Object.entries(e8.xstocksUpdates).map(([k, v]) => [k, v.n ?? null])) };
}
// share of a calendar week by session label (hourly, one Monday-start week), NYSE holidays not modelled
{ const c = {}; const t0 = Date.UTC(2026, 9, 5, 4); for (let h = 0; h < 168; h++) { const k = session(t0 + h * 3600e3); c[k] = (c[k] ?? 0) + 1; } s.weekHours = c; s.weekendSharePct = (c.WEEKEND ?? 0) / 168 * 100; s.regularSharePct = (c.REGULAR ?? 0) / 168 * 100; }
writeFileSync('data/discovery/summary.json', JSON.stringify(s, null, 2));
console.log(JSON.stringify(s, null, 1));
