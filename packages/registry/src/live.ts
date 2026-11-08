import { createPublicClient, http, parseAbi, parseAbiItem, type PublicClient } from 'viem';
import { bsc } from 'viem/chains';

/**
 * Live counters, generated from the chain, the hosted keeper's status endpoint and Supabase. Nothing is typed in:
 * every figure is read at call time and carries the source it came from. A source that cannot be read is reported
 * as unavailable, never as zero.
 */
export interface LiveCounters {
  asOf: string;
  orders: { total: number; open: number; filled: number; cancelled: number; expired: number } | { unavailable: string };
  keeper: {
    passes: number;
    fills: number;
    longestGapSec: number;
    startedAt: string;
    uptimeSec: number;
    lastPassAt: string | null;
    refusalsByReason: Record<string, number>;
    reference: { checks: number; agree: number; disagree: number; single: number; unavailable: number } | null;
  } | { unavailable: string };
  certificatesSold: { count: number; fromBlock: string; asset: string } | { unavailable: string };
  quotesRecorded: number | { unavailable: string };
  keeperActionsMirrored: number | { unavailable: string };
}

export interface LiveOptions {
  rpcUrl?: string;
  logsRpcUrl?: string;
  book?: `0x${string}`;
  keeperUrl?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
  payTo?: `0x${string}`;
  fromBlock?: bigint;
  priceWei?: bigint;
  now?: () => number;
}

const U = '0xcE24439F2D9C6a2289F741120FE202248B666666' as const;
const USDT = '0x55d398326f99059fF775485246999027B3197955' as const;
const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
const bookAbi = parseAbi([
  'function nextId() view returns (uint256)',
  'function orders(uint256) view returns (address owner, uint8 side, uint8 status, uint32 wrapperMask, uint64 deadline, bytes32 tickerId, uint128 amount, uint128 limit)',
]);

const certCache = new Map<string, { upTo: bigint; count: number }>();

async function countCertificates(client: PublicClient, o: Required<Pick<LiveOptions, 'payTo' | 'fromBlock' | 'priceWei'>>): Promise<number> {
  const key = `${o.payTo}:${o.priceWei}`;
  const hit = certCache.get(key) ?? { upTo: o.fromBlock - 1n, count: 0 };
  const head = await client.getBlockNumber();
  let from = hit.upTo + 1n;
  let count = hit.count;
  const STEP = 4_999n;
  while (from <= head) {
    const to = from + STEP > head ? head : from + STEP;
    const logs = await client.getLogs({ address: [U, USDT], event: TRANSFER, args: { to: o.payTo }, fromBlock: from, toBlock: to });
    count += logs.filter((l) => l.args.value === o.priceWei).length;
    from = to + 1n;
  }
  certCache.set(key, { upTo: head, count });
  return count;
}

async function supabaseCount(url: string, key: string, table: string): Promise<number> {
  const r = await fetch(`${url}/rest/v1/${table}?select=*`, { headers: { apikey: key, authorization: `Bearer ${key}`, prefer: 'count=exact', range: '0-0' }, signal: AbortSignal.timeout(8000), cache: 'no-store' } as RequestInit);
  const range = r.headers.get('content-range') ?? '';
  const m = /\/(\d+)$/.exec(range);
  if (!m) throw new Error(`no count (HTTP ${r.status})`);
  return Number(m[1]);
}

const why = (e: unknown): { unavailable: string } => ({ unavailable: e instanceof Error ? e.message.split('\n')[0]! : String(e) });

export async function readLive(o: LiveOptions): Promise<LiveCounters> {
  const now = (o.now ?? Date.now)();
  const rpc = createPublicClient({ chain: bsc, transport: http(o.rpcUrl ?? 'https://bsc-dataseed1.defibit.io') }) as PublicClient;
  const logs = createPublicClient({ chain: bsc, transport: http(o.logsRpcUrl ?? o.rpcUrl ?? 'https://bsc-dataseed1.defibit.io') }) as PublicClient;

  const orders = (async (): Promise<LiveCounters['orders']> => {
    if (!o.book) return { unavailable: 'book address not configured' };
    const next = await rpc.readContract({ address: o.book, abi: bookAbi, functionName: 'nextId' });
    const total = Number(next);
    const rows = await Promise.all(Array.from({ length: total }, (_, i) => rpc.readContract({ address: o.book!, abi: bookAbi, functionName: 'orders', args: [BigInt(i)] })));
    const t = Math.floor(now / 1000);
    let open = 0, filled = 0, cancelled = 0, expired = 0;
    for (const r of rows) {
      if (r[2] === 1) filled++;
      else if (r[2] === 2) cancelled++;
      else if (Number(r[4]) < t) expired++;
      else open++;
    }
    return { total, open, filled, cancelled, expired };
  })().catch(why);

  const keeper = (async (): Promise<LiveCounters['keeper']> => {
    if (!o.keeperUrl) return { unavailable: 'keeper url not configured' };
    const r = await fetch(`${o.keeperUrl.replace(/\/$/, '')}/api/agent/keeper`, { signal: AbortSignal.timeout(9000), cache: 'no-store' } as RequestInit);
    const k = (await r.json()) as { passes: number; fills: number; longestGapSec: number; startedAt: string; lastPassAt: string | null; refusalsByReason: Record<string, number>; reference?: LiveCounters['keeper'] extends infer T ? (T extends { reference: infer R } ? R : never) : never };
    return {
      passes: k.passes, fills: k.fills, longestGapSec: k.longestGapSec, startedAt: k.startedAt,
      uptimeSec: Math.max(0, Math.round((now - Date.parse(k.startedAt)) / 1000)), lastPassAt: k.lastPassAt,
      refusalsByReason: k.refusalsByReason, reference: (k.reference as never) ?? null,
    };
  })().catch(why);

  const certificatesSold = (async (): Promise<LiveCounters['certificatesSold']> => {
    if (!o.payTo || o.fromBlock === undefined) return { unavailable: 'pay-to address or start block not configured' };
    const price = o.priceWei ?? 10n ** 16n;
    const count = await countCertificates(logs, { payTo: o.payTo, fromBlock: o.fromBlock, priceWei: price });
    return { count, fromBlock: o.fromBlock.toString(), asset: 'U or USDT transfers of exactly the certificate price to the pay-to address' };
  })().catch(why);

  const quotes = o.supabaseUrl && o.supabaseKey ? supabaseCount(o.supabaseUrl, o.supabaseKey, 'quotes').catch(why) : Promise.resolve({ unavailable: 'supabase not configured' });
  const actions = o.supabaseUrl && o.supabaseKey ? supabaseCount(o.supabaseUrl, o.supabaseKey, 'keeper_actions').catch(why) : Promise.resolve({ unavailable: 'supabase not configured' });

  const [ordersR, keeperR, certR, quotesR, actionsR] = await Promise.all([orders, keeper, certificatesSold, quotes, actions]);
  return { asOf: new Date(now).toISOString(), orders: ordersR, keeper: keeperR, certificatesSold: certR, quotesRecorded: quotesR, keeperActionsMirrored: actionsR };
}
