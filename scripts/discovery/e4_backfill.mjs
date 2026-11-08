// E4 backfill: 1h klines (300 candles) for every wrapper from the public Market endpoint; converts each close to
// USD per share with the CURRENT on-chain unit (documented limitation: units move slowly) and compares wrappers
// per ticker by session. Writes e4_klines_raw.json and e4_backfill_summary.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { kline } from './lib_binance.mjs';
const e2 = JSON.parse(readFileSync('data/discovery/e2_unit_factors.json', 'utf8'));
import { session } from './e4_backfill_session.mjs';
const raw = {};
for (const w of e2.wrappers) {
  const r = await kline(w.token, '1h', 300);
  raw[w.token] = { symbol: w.symbol, ticker: w.ticker, issuer: w.issuer, http: r.http, code: r.code, candles: r.data?.klineInfos ?? [] };
  console.log(w.symbol.padEnd(8), r.http, r.code, (r.data?.klineInfos ?? []).length);
}
writeFileSync('data/discovery/e4_klines_raw.json', JSON.stringify(raw));
const unitOf = Object.fromEntries(e2.wrappers.map((w) => [w.token, w.issuer === 'XSTOCKS' ? 1 : Number(BigInt(w.sharesPerToken)) / 1e18]));
const byTicker = {};
for (const [tok, v] of Object.entries(raw)) for (const k of v.candles) {
  const ts = k[0], close = Number(k[4]); if (!close) continue;
  ((byTicker[v.ticker] ??= {})[ts] ??= {})[v.issuer] = close / unitOf[tok];
}
const stats = {};
for (const [t, bins] of Object.entries(byTicker)) for (const [ts, px] of Object.entries(bins)) {
  if (!px.BSTOCKS || !px.ONDO) continue;
  const s = session(Number(ts)); const spread = (px.ONDO / px.BSTOCKS - 1) * 1e4;
  const e = ((stats[s] ??= {}).all ??= []); e.push(Math.abs(spread));
  ((stats[s][t] ??= [])).push(spread);
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const summary = { generatedAt: new Date().toISOString(), interval: '1h', unitNote: 'closes divided by CURRENT on-chain unit', pair: 'Ondo vs bStocks USD/share, bps (Ondo over bStocks)', sessions: {} };
for (const [s, o] of Object.entries(stats)) summary.sessions[s] = { n: o.all.length, medianAbsBps: med(o.all), p90AbsBps: [...o.all].sort((a, b) => a - b)[Math.floor(o.all.length * 0.9)] };
writeFileSync('data/discovery/e4_backfill_summary.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 1));
