// Calibration (6.1): empirical distribution of absolute moves over weekend gaps, from daily closes of the
// wrappers on the public Market endpoint (in-sample, token period only). Output: data/calibration/weekend_moves.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { PublicRwaClient } from '@parallax/binance';
import { CORE_TICKERS, readUnit, makeClient, wrappersFor } from '@parallax/registry';

const rwa = new PublicRwaClient();
const chain = makeClient(process.env.BSC_RPC_URL);
const moves: number[] = [];
const perTicker: Record<string, number> = {};
let from = Infinity, to = 0;

for (const t of CORE_TICKERS) {
  // bStocks have the deepest history; per-share conversion uses the current unit (units move slowly)
  const w = wrappersFor(t).find((x) => x.issuer === 'BSTOCKS');
  if (!w) continue;
  const [k, u] = await Promise.all([rwa.klines(w.token, '1d', 300), readUnit(chain, w).catch(() => null)]);
  if (!k.ok || !u) continue;
  const unit = Number(u.unit) / 1e18;
  const c = k.data.map((x) => ({ day: new Date(x.openTime).getUTCDay(), t: x.openTime, close: Number(x.close) / unit }));
  let n = 0;
  for (let i = 0; i < c.length; i++) {
    // Friday close to Monday close: the gap New York is shut
    if (c[i]!.day !== 5) continue;
    const mon = c.slice(i + 1, i + 5).find((x) => x.day === 1);
    if (!mon) continue;
    moves.push(Math.abs(mon.close / c[i]!.close - 1));
    n++;
    from = Math.min(from, c[i]!.t);
    to = Math.max(to, mon.t);
  }
  perTicker[t] = n;
}
moves.sort((a, b) => a - b);
const q = (p: number) => (moves.length ? moves[Math.min(moves.length - 1, Math.floor(moves.length * p))]! : null);
// exceedance table: P(|move| > x) for premium sizes in basis points
const exceed = Object.fromEntries([5, 10, 25, 50, 100, 200].map((b) => [`${b}bps`, moves.length ? moves.filter((m) => m > b / 1e4).length / moves.length : null]));
mkdirSync('data/calibration', { recursive: true });
writeFileSync('data/calibration/weekend_moves.json', JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: 'Binance Web3 public Market endpoint, 1d candles of the bStocks wrapper per ticker, converted to per share with the current on-chain unit',
  inSample: true,
  gap: 'Friday daily close to the following Monday daily close (UTC candle boundaries)',
  n: moves.length, perTicker, from: Number.isFinite(from) ? new Date(from).toISOString() : null, to: to ? new Date(to).toISOString() : null,
  quantiles: { p50: q(0.5), p75: q(0.75), p90: q(0.9), p95: q(0.95), max: moves.at(-1) ?? null },
  exceedance: exceed,
}, null, 2));
console.log('n', moves.length, 'p50', q(0.5), 'p90', q(0.9));
