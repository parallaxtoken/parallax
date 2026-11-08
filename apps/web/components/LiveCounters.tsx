import { REFUSAL_REASONS } from '@parallax/kernel';
import { getLive } from '@/lib/server/live';

const fmt = (n: number) => n.toLocaleString('en-US');
const uptime = (s: number) => (s >= 86_400 ? `${Math.floor(s / 86_400)}d ${Math.floor((s % 86_400) / 3600)}h` : s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}m`);

/** Server-rendered live counters. A source that cannot be read says so; it is never shown as zero. */
export async function LiveCounters({ heading = 'Alive right now' }: { heading?: string }) {
  const l = await getLive();
  const orders = 'unavailable' in l.orders ? null : l.orders;
  const k = 'unavailable' in l.keeper ? null : l.keeper;
  const cert = 'unavailable' in l.certificatesSold ? null : l.certificatesSold;
  const quotes = typeof l.quotesRecorded === 'number' ? l.quotesRecorded : null;
  const cell = (label: string, value: string, note?: string) => (
    <div className="rounded-[14px] border border-rule bg-paper-3 p-4">
      <p className="font-mono text-[11px] uppercase tracking-wider text-graphite">{label}</p>
      <p className="num mt-1 font-display text-3xl font-semibold">{value}</p>
      {note ? <p className="mt-1 text-xs text-graphite">{note}</p> : null}
    </div>
  );
  return (
    <section aria-label={heading} data-testid="live-counters">
      <p className="font-mono text-xs uppercase tracking-widest text-graphite">{heading} · read {l.asOf.slice(11, 19)} UTC from the chain, the keeper and Supabase</p>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {cell('Orders', orders ? fmt(orders.total) : 'n/a', orders ? `${orders.open} open · ${orders.filled} filled · ${orders.cancelled} cancelled` : 'chain read failed')}
        {cell('Fills by the keeper', k ? fmt(k.fills) : orders ? fmt(orders.filled) : 'n/a', k ? 'since the hosted keeper started' : 'from order status on-chain')}
        {cell('Keeper passes', k ? fmt(k.passes) : 'n/a', k ? `longest gap ${k.longestGapSec}s · up ${uptime(k.uptimeSec)}` : 'keeper not reachable')}
        {cell('Certificates sold', cert ? fmt(cert.count) : 'n/a', cert ? 'settled B402 payments, counted on-chain' : 'chain scan failed')}
      </div>
      {k ? (
        <ul className="mt-3 flex flex-wrap gap-2 font-mono text-xs" aria-label="Refusals by reason">
          {REFUSAL_REASONS.map((r) => (
            <li key={r} className="rounded-full border border-rule bg-paper-2 px-3 py-1">{r} <span className="num font-medium">{k.refusalsByReason[r] ?? 0}</span></li>
          ))}
          {quotes !== null ? <li className="rounded-full border border-rule bg-paper-2 px-3 py-1">QUOTES RECORDED <span className="num font-medium">{fmt(quotes)}</span></li> : null}
        </ul>
      ) : null}
    </section>
  );
}
