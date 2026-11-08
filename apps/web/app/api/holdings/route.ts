import { NextResponse } from 'next/server';
import { parseAbi } from 'viem';
import { WRAPPERS, makeClient, readUnit } from '@parallax/registry';
import { shares, sharesFor, sharesPerToken, tokens } from '@parallax/kernel';
import { SignedClient } from '@parallax/binance';

export const preferredRegion = ['sin1', 'hkg1'];
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const chain = makeClient(process.env.BSC_RPC_URL);
const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)']);
const key = process.env.BINANCE_WEB3_API_KEY, secret = process.env.BINANCE_WEB3_SECRET_KEY;
const signed = key && secret ? new SignedClient({ apiKey: key, secretKey: secret, origin: process.env.BINANCE_WEB3_ORIGIN }) : null;

export interface Pnl {
  source: 'ADDRESS_PORTFOLIO';
  /** USD paid per share held, from the portfolio API's average buy price per token divided by the unit. */
  costBasisUsdPerShare: string | null;
  costUsd: string | null;
  valueUsd: string | null;
  unrealizedUsd: string | null;
  unrealizedPct: string | null;
  realizedUsd: string | null;
  holdingSeconds: number | null;
}

/** Cost basis and PnL from `GET /market/portfolio/token/latest-pnl`; null when the API has no record or is unreachable. */
async function pnlFor(owner: string, token: string, unit: bigint | null, tokensHeld: bigint): Promise<Pnl | null> {
  if (!signed) return null;
  const r = await signed.tokenLatestPnl(owner, token);
  if (!r.ok) return null;
  const d = r.data as Record<string, string | undefined>;
  const num = (v: string | undefined): number | null => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  const avg = num(d.buyAvgPrice), buyVol = num(d.buyTxVolume), balUsd = num(d.tokenBalanceUsd), realized = num(d.realizedPnlUsd);
  if (avg === null || avg === 0 || unit === null) return realized === null ? null : { source: 'ADDRESS_PORTFOLIO', costBasisUsdPerShare: null, costUsd: null, valueUsd: balUsd === null ? null : balUsd.toFixed(6), unrealizedUsd: null, unrealizedPct: null, realizedUsd: realized.toFixed(6), holdingSeconds: num(d.holdingDuration) };
  const unitN = Number(unit) / 1e18;
  const heldN = Number(tokensHeld) / 1e18;
  const cost = avg * heldN; // cost of the tokens still held, at the average buy price
  const value = balUsd ?? null;
  const unreal = value === null ? null : value - cost;
  return {
    source: 'ADDRESS_PORTFOLIO',
    costBasisUsdPerShare: (avg / unitN).toFixed(4),
    costUsd: cost.toFixed(6),
    valueUsd: value === null ? null : value.toFixed(6),
    unrealizedUsd: unreal === null ? null : unreal.toFixed(6),
    unrealizedPct: unreal === null || cost === 0 ? null : ((unreal / cost) * 100).toFixed(2),
    realizedUsd: realized === null ? null : realized.toFixed(6),
    holdingSeconds: num(d.holdingDuration),
  };
}

/** Holdings in shares across all wrappers of each ticker, read straight from the chain. */
export async function GET(req: Request) {
  const owner = new URL(req.url).searchParams.get('owner') ?? '';
  if (!/^0x[0-9a-fA-F]{40}$/.test(owner)) return NextResponse.json({ error: 'owner must be an address' }, { status: 400 });
  try {
    const balances = await Promise.all(
      WRAPPERS.map((w) => chain.readContract({ address: w.token, abi: erc20, functionName: 'balanceOf', args: [owner as `0x${string}`] }).then((b) => ({ w, b }))),
    );
    const held = balances.filter((x) => x.b > 0n);
    const rows = await Promise.all(
      held.map(async ({ w, b }) => {
        try {
          const u = await readUnit(chain, w);
          const sh = w.issuer === 'XSTOCKS' ? shares(b) : sharesFor(tokens(b), sharesPerToken(u.unit));
          const pnl = await pnlFor(owner, w.token, u.unit, b).catch(() => null);
          return { ticker: w.ticker, symbol: w.symbol, issuer: w.issuer, token: w.token, tokensWad: b.toString(), unitWad: u.unit.toString(), sharesWad: sh.toString(), paused: u.paused, error: null as string | null, pnl };
        } catch (e) {
          return { ticker: w.ticker, symbol: w.symbol, issuer: w.issuer, token: w.token, tokensWad: b.toString(), unitWad: null, sharesWad: null, paused: null, error: e instanceof Error ? e.message.split('\n')[0]! : 'unit unreadable', pnl: null as Pnl | null };
        }
      }),
    );
    const byTicker: Record<string, { sharesWad: string; wrappers: number }> = {};
    for (const r of rows) {
      if (r.sharesWad === null) continue;
      const t = (byTicker[r.ticker] ??= { sharesWad: '0', wrappers: 0 });
      t.sharesWad = (BigInt(t.sharesWad) + BigInt(r.sharesWad)).toString();
      t.wrappers++;
    }
    return NextResponse.json({ owner, rows, byTicker, scanned: WRAPPERS.length });
  } catch (e) {
    return NextResponse.json({ error: 'UNREACHABLE', message: e instanceof Error ? e.message : 'chain read failed' }, { status: 502 });
  }
}
