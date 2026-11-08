import 'server-only';
import { parseAbi } from 'viem';
import { TICKERS, makeClient, tickerIdOf, wrapperByToken } from '@parallax/registry';
import { retainedJournal } from './journal';
import { SignedClient } from '@parallax/binance';

export const BOOK = (process.env.NEXT_PUBLIC_PARALLAXBOOK || '') as `0x${string}` | '';
const chain = makeClient(process.env.BSC_RPC_URL);
const abi = parseAbi([
  'function nextId() view returns (uint256)',
  'function orders(uint256) view returns (address owner, uint8 side, uint8 status, uint32 wrapperMask, uint64 deadline, bytes32 tickerId, uint128 amount, uint128 limit)',
]);

const okey = process.env.BINANCE_WEB3_API_KEY, osecret = process.env.BINANCE_WEB3_SECRET_KEY;
const detailClient = okey && osecret ? new SignedClient({ apiKey: okey, secretKey: osecret, origin: process.env.BINANCE_WEB3_ORIGIN }) : null;
const detailCache = new Map<string, { at: number; v: Reconciliation }>();

/** One diary fill line checked against the Wallet API transaction detail (an independent index of the same chain). */
export interface Reconciliation {
  tx: string;
  state: 'MATCH' | 'MISMATCH' | 'NOT_INDEXED' | 'UNAVAILABLE';
  txStatus: string | null;
  block: string | null;
  feeBnb: string | null;
}

async function reconcile(tx: string): Promise<Reconciliation> {
  const hit = detailCache.get(tx);
  if (hit && Date.now() - hit.at < 600_000) return hit.v;
  let v: Reconciliation = { tx, state: 'UNAVAILABLE', txStatus: null, block: null, feeBnb: null };
  if (detailClient) {
    const r = await detailClient.txDetail(tx);
    if (r.ok) v = { tx, state: r.data.status.toLowerCase() === 'success' ? 'MATCH' : 'MISMATCH', txStatus: r.data.status, block: r.data.height, feeBnb: r.data.fee };
    else if ('notFound' in r || ('degraded' in r && r.degraded.kind === 'MALFORMED')) v = { tx, state: 'NOT_INDEXED', txStatus: null, block: null, feeBnb: null };
  }
  if (v.state !== 'UNAVAILABLE') detailCache.set(tx, { at: Date.now(), v });
  return v;
}

export interface OrderView {
  id: string;
  owner: `0x${string}`;
  side: 'BUY' | 'SELL';
  status: 'open' | 'filled' | 'cancelled' | 'expired';
  ticker: string | null;
  amount: string;
  limit: string;
  deadline: string;
  wrapperMask: number;
  /** plain sentences written only from the keeper journal and receipts */
  diary: string[];
  /** Each confirmed fill in the diary, reconciled with the Binance transaction detail. */
  reconciliation: Reconciliation[];
}

interface JournalRow { t: string; orderId: string; status: string; decision: string; reasons: string[]; wrapper?: string; sharesWad?: string; txHash?: string }

const WORDS: Record<string, string> = {
  PREMIUM_ABOVE_LIMIT: 'the price was above the limit',
  UNIT_PAUSED: 'the issuer had paused the token for a corporate action',
  NO_CONTRACT_ROUTE: 'no wrapper had a route a contract can fill',
  BROKEN_QUOTE: 'a quote was far from its own reference and was not treated as a deal',
  SIM_FAILED: 'the pre-flight simulation failed, so nothing was sent',
  API_DEGRADED: 'a data source was unreachable, so no order was evaluated',
  REFERENCE_DISAGREE: 'two independent price references disagreed, so nothing was filled',
};

const stamp = (iso: string): string => {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  const hm = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false });
  return `${day} ${hm} UTC`;
};

export function diaryFor(orderId: string, rows: JournalRow[], tickerSymbol: string | null): string[] {
  const out: string[] = [];
  let lastKey = '';
  for (const r of rows.filter((x) => x.orderId === orderId)) {
    let line: string | null = null;
    if (r.status === 'CONFIRMED') {
      const w = r.wrapper ? wrapperByToken(r.wrapper) : undefined;
      const sh = r.sharesWad ? (Number(BigInt(r.sharesWad) / 10n ** 12n) / 1e6).toFixed(4) : null;
      line = `${stamp(r.t)}. Filled${sh ? `: ${sh} ${tickerSymbol ?? ''} shares` : ''}${w ? ` as ${w.symbol}` : ''}.${r.txHash ? ` ${r.txHash.slice(0, 10)}…` : ''}`;
    } else if (r.status === 'WAIT' || r.status === 'SKIP' || r.status === 'REFUSED') {
      const key = r.reasons.join(',');
      if (key !== lastKey) line = `${stamp(r.t)}. Waiting: ${r.reasons.map((x) => WORDS[x] ?? x).join('; ') || r.decision}.`;
      lastKey = key;
    } else if (r.status === 'REVERTED') {
      line = `${stamp(r.t)}. A fill transaction reverted on-chain; the order stays open.`;
    }
    if (line) out.push(line);
  }
  return out.slice(-12);
}

export async function ordersOf(owner: string): Promise<{ deployed: boolean; orders: OrderView[]; keeper: 'ok' | 'unconfigured' | 'unreachable' }> {
  if (!BOOK) return { deployed: false, orders: [], keeper: 'unconfigured' };
  const next = await chain.readContract({ address: BOOK, abi, functionName: 'nextId' });
  const from = next > 400n ? next - 400n : 0n;
  const ids = Array.from({ length: Number(next - from) }, (_, i) => from + BigInt(i));
  const raw = await Promise.all(ids.map((id) => chain.readContract({ address: BOOK as `0x${string}`, abi, functionName: 'orders', args: [id] }).then((o) => ({ id, o }))));
  let journal: JournalRow[] = [];
  let keeper: 'ok' | 'unconfigured' | 'unreachable' = 'unconfigured';
  if (process.env.KEEPER_URL) {
    try {
      const base = process.env.KEEPER_URL.replace(/\/$/, '');
      const full = await fetch(`${base}/api/agent/journal`, { signal: AbortSignal.timeout(6000), cache: 'no-store' }).then((r) => (r.ok ? (r.json() as Promise<{ rows?: JournalRow[] }>) : null)).catch(() => null);
      if (full?.rows?.length) {
        journal = full.rows;
      } else {
        const j = (await (await fetch(`${base}/api/agent/keeper`, { signal: AbortSignal.timeout(6000), cache: 'no-store' })).json()) as { recent?: JournalRow[] };
        journal = j.recent ?? [];
      }
      keeper = 'ok';
    } catch {
      keeper = 'unreachable';
    }
  }
  if (journal.length === 0) {
    // the live keeper is not reachable: fall back to the retained journal shipped with this deployment
    journal = (await retainedJournal(1000)) as unknown as JournalRow[];
    if (journal.length) keeper = 'ok';
  }
  const byId = new Map(TICKERS.map((t) => [tickerIdOf(t).toLowerCase(), t]));
  const now = Math.floor(Date.now() / 1000);
  const orders = raw
    .filter(({ o }) => o[0].toLowerCase() === owner.toLowerCase())
    .map(({ id, o }): OrderView => {
      const ticker = byId.get(o[5].toLowerCase()) ?? null;
      const status = o[2] === 1 ? 'filled' : o[2] === 2 ? 'cancelled' : Number(o[4]) < now ? 'expired' : 'open';
      return { id: id.toString(), owner: o[0], side: o[1] === 0 ? 'BUY' : 'SELL', status, ticker, amount: o[6].toString(), limit: o[7].toString(), deadline: new Date(Number(o[4]) * 1000).toISOString(), wrapperMask: o[3], diary: diaryFor(id.toString(), journal, ticker), reconciliation: [] };
    })
    .reverse();
  // Reconcile every confirmed fill hash with the Wallet API (cached ten minutes, at most eight hashes per request).
  const fills = orders.flatMap((o) => journal.filter((r) => r.orderId === o.id && r.status === 'CONFIRMED' && r.txHash).map((r) => ({ o, tx: r.txHash as string })));
  const seen = new Set<string>();
  await Promise.all(fills.filter((f) => (seen.has(f.tx) ? false : (seen.add(f.tx), true))).slice(0, 8).map(async (f) => { f.o.reconciliation.push(await reconcile(f.tx)); }));
  return { deployed: true, orders, keeper };
}
