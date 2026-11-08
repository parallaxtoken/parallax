import { createServer } from 'node:http';
import dns from 'node:dns';
import net from 'node:net';
import { createPublicClient, createWalletClient, http, type Account } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import { PublicRwaClient, SignedClient } from '@parallax/binance';
import { TICKERS, tickerIdOf } from '@parallax/registry';
import { bookAbi } from './abi';
import { Engine, type OpenOrder } from './engine';
import { Journal } from './journal';
import { SupabaseMirror } from './mirror';
import { NoopNotifier, TelegramNotifier, type Notifier } from './notify';
import { Recorder } from './recorder';
import { Stats } from './stats';

// Some hosts have no IPv6 egress; try IPv4 first and give each address family a fair attempt window.
dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamilyAttemptTimeout?.(2000);

const env = (k: string): string | undefined => (process.env[k] && process.env[k] !== '' ? process.env[k] : undefined);
const PASS_MS = Number(env('KEEPER_PASS_SEC') ?? 30) * 1000;
const PORT = Number(env('PORT') ?? 8787);
const BOOK = (env('NEXT_PUBLIC_PARALLAXBOOK') ?? env('NEXT_PUBLIC_TAREBOOK')) as `0x${string}` | undefined;

const chain = createPublicClient({ chain: bsc, transport: http(env('BSC_RPC_URL') ?? 'https://bsc-dataseed1.defibit.io') });
const rwa = new PublicRwaClient({ origin: env('BINANCE_API_ORIGIN') });
const apiKey = env('BINANCE_WEB3_API_KEY');
const secret = env('BINANCE_WEB3_SECRET_KEY');
const signed = apiKey && secret ? new SignedClient({ apiKey, secretKey: secret, origin: env('BINANCE_WEB3_ORIGIN') }) : null;
const account: Account | null = env('KEEPER_PRIVATE_KEY') ? privateKeyToAccount(env('KEEPER_PRIVATE_KEY') as `0x${string}`) : null;
const wallet = account ? createWalletClient({ account, chain: bsc, transport: http(env('BSC_RPC_URL') ?? 'https://bsc-dataseed1.defibit.io') }) : null;
const mirror = env('SUPABASE_URL') && env('SUPABASE_SERVICE_ROLE_KEY') ? new SupabaseMirror(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!) : null;
const journal = new Journal(env('KEEPER_JOURNAL') ?? 'data/keeper/journal.jsonl', mirror ? (e) => mirror.push(e) : undefined);
const stats = new Stats();
const tickerById = new Map(TICKERS.map((t) => [tickerIdOf(t).toLowerCase(), t]));

async function readOrders(): Promise<(OpenOrder & { status: number })[]> {
  if (!BOOK) return [];
  const next = await chain.readContract({ address: BOOK, abi: bookAbi, functionName: 'nextId' });
  const out: (OpenOrder & { status: number })[] = [];
  for (let i = 0n; i < next; i++) {
    const [owner, side, status, wrapperMask, deadline, tickerId, amount, limit] = await chain.readContract({ address: BOOK, abi: bookAbi, functionName: 'orders', args: [i] });
    out.push({ id: i, owner, side: side === 0 ? 'BUY' : 'SELL', status, wrapperMask, deadline, tickerId, amount, limit });
  }
  return out;
}

let notifier: Notifier = NoopNotifier;
let telegram: TelegramNotifier | null = null;
const tg = env('TELEGRAM_BOT_TOKEN');
if (tg) {
  stats.channel('unreachable', 'not contacted yet');
  telegram = new TelegramNotifier(tg, env('PUBLIC_WEB_ORIGIN') ?? 'http://localhost:3000', async (owner) => {
    return (await readOrders()).filter((o) => o.owner.toLowerCase() === owner).map((o) => ({ id: o.id.toString(), side: o.side, status: ['open', 'filled', 'cancelled'][o.status] ?? '?' }));
  });
  notifier = telegram;
}

const engine = new Engine({ chain, wallet, account, book: (BOOK ?? '0x0000000000000000000000000000000000000000') as `0x${string}`, rwa, signed, registry: env('NEXT_PUBLIC_REGISTRY') as `0x${string}` | undefined, journal, notifier, stats,
  referenceMaxBps: Number(env('REFERENCE_MAX_DISAGREE_BPS') ?? 200), referenceRequired: env('REFERENCE_REQUIRED') !== 'false', broadcast: env('KEEPER_BROADCAST') !== 'rpc' });

async function resolveUnresolved(): Promise<void> {
  for (const e of journal.unresolved()) {
    try {
      await engine.observe({ owner: '0x0000000000000000000000000000000000000000', id: BigInt(e.orderId) }, e.txHash as string, e);
    } catch (err) {
      stats.error(`unresolved ${e.txHash}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

let passIndex = 0;
let telegramResumeAt = 0;
function telegramReason(err: unknown): string {
  const cause = err instanceof Error ? (err.cause as { code?: string; errors?: { code?: string; address?: string }[] } | undefined) : undefined;
  const codes = cause?.errors?.map((e) => `${e.code ?? '?'}${e.address ? ` ${e.address}` : ''}`) ?? (cause?.code ? [cause.code] : []);
  return codes.length ? `network: ${[...new Set(codes)].slice(0, 3).join(', ')}` : err instanceof Error ? err.message : String(err);
}

async function pass(): Promise<void> {
  try {
    const orders = await readOrders();
    for (const o of orders) {
      if (o.status !== 0) continue;
      const ticker = tickerById.get(o.tickerId.toLowerCase());
      if (!ticker) continue;
      try {
        await engine.process(o, ticker);
      } catch (err) {
        stats.error(`order ${o.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    stats.pass();
    if (telegram && passIndex++ >= telegramResumeAt) {
      try {
        await telegram.pollOnce();
        stats.channel('ok');
      } catch (err) {
        // Back off for about five minutes; an unreachable channel never counts as a keeper error.
        telegramResumeAt = passIndex + 10;
        stats.channel('unreachable', telegramReason(err));
      }
    }
  } catch (err) {
    stats.error(err instanceof Error ? err.message : String(err));
  }
}

const recorder = new Recorder({ chain, rwa, journalPath: env('RECORDER_FILE') ?? 'data/keeper/quotes.jsonl', supabaseUrl: env('SUPABASE_URL'), supabaseKey: env('SUPABASE_SERVICE_ROLE_KEY') });

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  res.setHeader('content-type', 'application/json');
  res.setHeader('access-control-allow-origin', '*');
  if (url.pathname === '/api/agent/keeper' || url.pathname === '/') {
    res.end(JSON.stringify({ ...stats.snapshot(), keeper: account?.address ?? null, book: BOOK ?? null, mode: wallet ? 'LIVE' : 'OBSERVE', transactionApi: signed ? 'KEYED' : 'ETH_CALL_FALLBACK', recorder: recorder.snapshot(), mirror: mirror ? { sent: mirror.sent, failed: mirror.failed } : null, recent: journal.all().slice(-25) }));
    return;
  }
  if (url.pathname === '/api/agent/journal') {
    // Compact history for the diary: every non-waiting entry, and a waiting entry only when its reason changes.
    const last = new Map<string, string>();
    const rows = journal.all().filter((r) => {
      if (r.status !== 'WAIT' && r.status !== 'SKIP' && r.status !== 'REFUSED') return true;
      const key = r.reasons.join(',');
      if (last.get(r.orderId) === key) return false;
      last.set(r.orderId, key);
      return true;
    });
    res.end(JSON.stringify({ rows: rows.slice(-1500) }));
    return;
  }
  if (url.pathname === '/.well-known/agent-card.json' || url.pathname === '/agent-card.json') {
    const origin = env('PUBLIC_KEEPER_URL') ?? env('RENDER_EXTERNAL_URL') ?? `http://localhost:${PORT}`;
    const web = env('PUBLIC_WEB_ORIGIN') ?? 'https://parallax.network';
    res.end(JSON.stringify({
      name: 'Parallax Keeper',
      description: 'Untrusted keeper agent for ParallaxBook standing orders. It proposes fills, simulates first, and the contract refuses anything below the signed share floor. It also sells a decomposition certificate over x402.',
      url: `${web}/api/mcp`,
      version: '0.1.0',
      provider: { organization: 'parallax-protocol' },
      capabilities: { streaming: false, pushNotifications: false },
      defaultInputModes: ['application/json'],
      defaultOutputModes: ['application/json'],
      skills: [
        { id: 'keeper_status', name: 'Keeper status', description: `Passes, fills, refusals by typed reason and reference checks at ${origin}/api/agent/keeper.` },
        { id: 'keeper_journal', name: 'Decision journal', description: `Compact decision history at ${origin}/api/agent/journal.` },
        { id: 'parallax_certificate', name: 'Parallax Certificate', description: `A hash-committed decomposition of one ticker across wrappers, paid per call over x402 at ${web}/api/certificate.` },
      ],
      identity: env('KEEPER_AGENT_ID') ? { standard: 'ERC-8004', chainId: 56, agentId: env('KEEPER_AGENT_ID'), registry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' } : null,
      payments: { standard: 'x402', endpoint: `${web}/api/certificate`, networks: ['eip155:56'] },
      runtime: { host: 'Render web service, Singapore', selfHosted: true },
    }));
    return;
  }
  if (url.pathname === '/healthz') { res.end('{"ok":true}'); return; }
  res.statusCode = 404;
  res.end('{"error":"not found"}');
}).listen(PORT);

// A free Render web service sleeps after 15 minutes without inbound traffic. Hitting our own public URL while awake
// keeps the loop alive; the scheduled workflow in .github/workflows/keepalive.yml wakes it if it ever slept.
const selfUrl = env('RENDER_EXTERNAL_URL');
if (selfUrl) setInterval(() => { void fetch(`${selfUrl.replace(/\/$/, '')}/healthz`, { signal: AbortSignal.timeout(10_000) }).catch(() => undefined); }, 10 * 60_000);

await resolveUnresolved();
void (async () => { for (;;) { await recorder.cycle().catch((e) => stats.error(`recorder: ${String(e)}`)); await new Promise((r) => setTimeout(r, 60_000)); } })();
for (;;) {
  const s = Date.now();
  await pass();
  await new Promise((r) => setTimeout(r, Math.max(1000, PASS_MS - (Date.now() - s))));
}
