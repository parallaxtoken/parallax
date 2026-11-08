import { headers } from 'next/headers';
import { REFUSAL_REASONS } from '@parallax/kernel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Keeper agent' };

interface Keeper {
  available: boolean;
  source?: string;
  note?: string;
  reason?: string;
  keeper?: string | null;
  book?: string | null;
  mode?: string;
  transactionApi?: string;
  passes?: number | null;
  fills?: number;
  longestGapSec?: number;
  lastPassAt?: string | null;
  refusalsByReason?: Record<string, number>;
  lastError?: { at: string; message: string } | null;
  notifications?: { telegram: { state: 'off' | 'ok' | 'unreachable'; detail: string | null; since: string | null } };
  recorder?: { cycles: number; lastCycleAt: string | null; errors: number };
  selfFunding?: { earnedUsdtWei: string; gasSpentWei: string };
  recent?: { t: string; orderId: string; status: string; decision: string; reasons: string[]; simSource?: string; simResult?: string; txHash?: string }[];
}

async function load(origin: string): Promise<Keeper> {
  try {
    const r = await fetch(`${origin}/api/agent/keeper`, { cache: 'no-store', signal: AbortSignal.timeout(9000) });
    return (await r.json()) as Keeper;
  } catch {
    return { available: false, reason: 'The keeper status endpoint did not answer.' };
  }
}

export default async function AgentPage() {
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
  const k = await load(origin);
  const agentId = process.env.KEEPER_AGENT_ID;
  return (
    <div className="mx-auto w-[min(1180px,calc(100%-24px))] py-10">
      <h1 className="h2">The keeper</h1>
      <p className="mt-3 max-w-2xl text-graphite">An untrusted agent that watches every order. It proposes; the contract decides. Everything below is read from the keeper&apos;s own status endpoint and from the chain.</p>

      {!k.available ? (
        <p role="status" className="mt-8 rounded-[var(--radius-card)] border border-rule bg-paper-3 p-6">
          The keeper is not reachable from here ({k.reason}). Its last on-chain actions remain verifiable on <a className="underline" href="/verify">Verify</a>.
        </p>
      ) : (
        <>
          {k.note ? <p role="status" className="mt-6 rounded-[14px] bg-session/20 p-3 text-sm">{k.note}</p> : null}
          <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card l="Mode" v={k.mode ?? '–'} />
            <Card l="Passes" v={k.passes === null || k.passes === undefined ? 'n/a' : String(k.passes)} />
            <Card l="Fills" v={String(k.fills ?? 0)} />
            <Card l="Longest gap" v={`${k.longestGapSec ?? 0}s`} />
          </dl>
          <section className="mt-8 rounded-[var(--radius-card)] border border-rule bg-paper-3 p-5">
            <h2 className="font-display text-xl font-semibold">Refusals, by reason</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {REFUSAL_REASONS.map((r) => (
                <li key={r} className="flex items-center justify-between rounded-[12px] bg-paper-2 px-3 py-2 font-mono text-xs">
                  <span>{r}</span><span className="num">{k.refusalsByReason?.[r] ?? 0}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-graphite">Simulation source: {k.transactionApi ?? 'unknown'}. Last pass {k.lastPassAt ?? 'never'}.</p>
            {k.lastError && !k.lastError.message.startsWith('telegram:') ? <p className="mt-2 text-xs text-gross">Last error ({k.lastError.at}): {k.lastError.message}</p> : <p className="mt-2 text-xs text-graphite">No keeper errors since start.</p>}
            {k.notifications ? (
              <p className="mt-2 text-xs text-graphite">
                Order diary on Telegram: {k.notifications.telegram.state === 'ok' ? 'delivering' : k.notifications.telegram.state === 'off' ? 'not configured' : `waiting on the network${k.notifications.telegram.detail ? ` (${k.notifications.telegram.detail})` : ''}`}. Fills and refusals are always in the journal above.
              </p>
            ) : null}
          </section>
          <section className="mt-6 rounded-[var(--radius-card)] border border-rule bg-paper-3 p-5">
            <h2 className="font-display text-xl font-semibold">Recent decisions</h2>
            {k.recent && k.recent.length ? (
              <ul className="mt-3 space-y-2 font-mono text-xs">
                {k.recent.slice().reverse().map((e, i) => (
                  <li key={`${e.t}-${i}`} className="rounded-[10px] bg-paper-2 px-3 py-2">
                    <span className="text-graphite">{e.t}</span> order {e.orderId} <strong>{e.status}</strong> {e.reasons.join(', ')} {e.simResult ? `sim ${e.simResult}` : ''} {e.txHash ? <a className="underline" href={`https://bscscan.com/tx/${e.txHash}`}>tx</a> : null}
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 text-sm text-graphite">No decisions yet. Once an order exists, every pass writes a line here with its reason.</p>}
          </section>
        </>
      )}

      <section className="mt-6 rounded-[var(--radius-card)] border border-rule bg-paper-3 p-5">
        <h2 className="font-display text-xl font-semibold">Identity</h2>
        <p className="mt-2 text-sm">
          {agentId ? <>ERC-8004 agent <span className="font-mono">#{agentId}</span> on BNB Smart Chain, with an agent card at <a className="underline" href="/.well-known/agent-card.json">/.well-known/agent-card.json</a>.</> : 'The keeper has no on-chain identity registered yet. Registration is a mainnet transaction and is recorded in EVIDENCE.md when it happens.'}
        </p>
      </section>
    </div>
  );
}

function Card({ l, v }: { l: string; v: string }) {
  return <div className="rounded-[var(--radius-card)] border border-rule bg-paper-3 p-5"><dt className="text-sm text-graphite">{l}</dt><dd className="num mt-1 font-display text-3xl font-semibold">{v}</dd></div>;
}
