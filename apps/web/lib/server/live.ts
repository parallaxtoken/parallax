import 'server-only';
import { readLive, type LiveCounters } from '@parallax/registry';

let cache: { at: number; v: LiveCounters } | null = null;

/** Live counters from the chain, the hosted keeper and Supabase, cached for 30 seconds. */
export async function getLive(): Promise<LiveCounters> {
  if (cache && Date.now() - cache.at < 30_000) return cache.v;
  const v = await readLive({
    rpcUrl: process.env.BSC_RPC_URL,
    logsRpcUrl: process.env.BSC_LOGS_RPC_URL ?? process.env.BSC_RPC_URL,
    book: process.env.NEXT_PUBLIC_PARALLAXBOOK as `0x${string}` | undefined,
    keeperUrl: process.env.KEEPER_URL,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    payTo: process.env.B402_PAY_TO as `0x${string}` | undefined,
    fromBlock: process.env.NEXT_PUBLIC_PARALLAXBOOK_BLOCK ? BigInt(process.env.NEXT_PUBLIC_PARALLAXBOOK_BLOCK) : undefined,
  });
  cache = { at: Date.now(), v };
  return v;
}
