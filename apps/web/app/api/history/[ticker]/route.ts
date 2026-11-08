import { NextResponse } from 'next/server';
import { PublicRwaClient } from '@parallax/binance';
import { readUnit, wrappersFor, makeClient } from '@parallax/registry';

export const preferredRegion = ['sin1', 'hkg1'];
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const rwa = new PublicRwaClient({ origin: process.env.BINANCE_API_ORIGIN });
const chain = makeClient(process.env.BSC_RPC_URL);

/**
 * Hourly USD per share per wrapper: kline close divided by the CURRENT on-chain unit. Units move slowly, so the
 * unit of the day is a documented approximation; each series states it.
 */
export async function GET(_: Request, ctx: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await ctx.params;
  const ws = wrappersFor(ticker);
  if (!ws.length) return NextResponse.json({ error: 'unknown ticker' }, { status: 404 });
  type Degraded = { symbol: string; issuer: string; points: never[]; note: string };
  type Live = { symbol: string; issuer: string; unit: number; base: string; raw: { time: number; value: number }[] };
  const series: (Degraded | Live)[] = await Promise.all(
    ws.map(async (w): Promise<Degraded | Live> => {
      const [k, u] = await Promise.all([rwa.klines(w.token, '1h', 168), readUnit(chain, w).catch(() => null)]);
      if (!k.ok) return { symbol: w.symbol, issuer: w.issuer, points: [] as never[], note: 'degraded' in k ? `unavailable: ${k.degraded.kind}` : 'no candles' };
      const unit = u ? Number(u.unit) / 1e18 : null;
      if (unit === null) return { symbol: w.symbol, issuer: w.issuer, points: [] as never[], note: 'unit unreadable, series withheld' };
      const raw = k.data.map((c) => ({ time: Math.floor(c.openTime / 1000), value: Number(c.close) / unit }));
      return { symbol: w.symbol, issuer: w.issuer, unit, base: w.issuer === 'XSTOCKS' ? 'balance is share units' : 'close divided by the current on-chain unit', raw };
    }),
  );
  // Points more than five percent from the cross-wrapper median are broken quotes (E12) and are withheld, with a count.
  const all = series.flatMap((s) => ('raw' in s ? s.raw.map((p) => p.value) : [])).sort((a, b) => a - b);
  const median = all.length ? all[Math.floor(all.length / 2)]! : null;
  const out = series.map((s) => {
    if (!('raw' in s) || median === null) return s;
    const kept = s.raw.filter((p) => Math.abs(p.value / median - 1) <= 0.05);
    const withheld = s.raw.length - kept.length;
    return { symbol: s.symbol, issuer: s.issuer, unit: s.unit, note: `${s.base}${withheld ? `; ${withheld} broken quote(s) withheld` : ''}`, points: kept };
  });
  return NextResponse.json({ ticker, interval: '1h', series: out });
}
