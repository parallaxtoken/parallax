// Reads the live counters from the chain, the hosted keeper and Supabase and writes data/live/summary.json.
// README and PROOF render from this file, so the figures in the docs are read, never typed.
import { mkdirSync, writeFileSync } from 'node:fs';
import './mainnet/lib';
import { readLive } from '@parallax/registry';

const num = (v: unknown, d = 0) => (typeof v === 'number' ? v : d);
const live = await readLive({
  rpcUrl: process.env.BSC_RPC_URL,
  logsRpcUrl: process.env.BSC_LOGS_RPC_URL,
  book: (process.env.NEXT_PUBLIC_PARALLAXBOOK ?? process.env.NEXT_PUBLIC_TAREBOOK) as `0x${string}`,
  keeperUrl: process.env.KEEPER_URL ?? 'https://parallax-keeper.onrender.com',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  payTo: (process.env.B402_PAY_TO ?? process.env.USER_ADDRESS) as `0x${string}`,
  fromBlock: BigInt(process.env.NEXT_PUBLIC_PARALLAXBOOK_BLOCK ?? process.env.NEXT_PUBLIC_TAREBOOK_BLOCK ?? '0'),
});
mkdirSync('data/live', { recursive: true });
writeFileSync('data/live/summary.json', JSON.stringify(live, null, 2));
console.log(JSON.stringify(live, null, 2));
void num;
