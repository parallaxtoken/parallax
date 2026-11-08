import Link from 'next/link';
import { LiveCounters } from '@/components/LiveCounters';
import { Pen, Scale } from 'lucide-react';
import { BalanceArtifact } from '@/components/hero/BalanceArtifact';
import { LiveShelfStrip } from '@/components/LiveShelfStrip';
import { Weighing } from '@/components/Weighing';
import { Reveal } from '@/components/Reveal';
import { discovery, readData } from '@/lib/server/data';

export const revalidate = 60;

interface AutonomySummary {
  fills?: number;
  refusals?: number;
  ownerOfflineFills?: number;
  sharesPer50?: { parallax: number; naive: number };
}
interface CounterSummary {
  arms?: Record<string, { meanSharesPer50: number; medianSharesPer50: number; n: number }>;
  parallaxMinusNaiveBps?: number;
  parallaxMinusRandomBps?: number;
}

const TOKEN = 'inline-grid size-[0.78em] translate-y-[0.06em] place-items-center rounded-full align-baseline';

export default async function Landing() {
  const [d, auto, counter] = await Promise.all([discovery(), readData<AutonomySummary>('autonomy/summary.json'), readData<CounterSummary>('counterfactual/summary.json')]);
  const bestWrap = d ? Math.round(d.units.maxOndoVsBstocksBps) : null;

  return (
    <>
      {/* 1. Hero */}
      <section className="relative mx-auto w-[min(1180px,calc(100%-24px))] pb-16 pt-14 md:pt-20">
        <div className="relative z-10 min-[1024px]:w-[54%]">
          <h1 className="display">
            Sign{' '}
            <span className={`${TOKEN} bg-unit text-white glow-unit`} aria-hidden><Pen className="size-[52%]" strokeWidth={2.4} /></span>{' '}
            once.
            <br />
            <span className="text-graphite">
              Own the{' '}
              <span className={`${TOKEN} bg-net text-white glow-net`} aria-hidden><Scale className="size-[52%]" strokeWidth={2.4} /></span>{' '}
              <em className="font-serif font-medium not-italic italic text-ink">share</em>.
            </span>
          </h1>
          <p className="mt-8 max-w-[38rem] text-[1.05rem] text-graphite">
            A standing order for tokenized stocks on Stellar (Soroban) & Multi-chain. Tell Parallax what to buy or sell and the most you will pay per share. It fills at the best issuer, day or night, and the chain refuses anything worse. Your keys never leave your wallet.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/app" className="rounded-[var(--radius-capsule)] bg-ink px-6 py-3 font-medium text-paper transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">Open the Shelf</Link>
            <Link href="/proof" className="rounded-[var(--radius-capsule)] border border-rule bg-paper-3 px-6 py-3 font-medium transition hover:-translate-y-0.5">See the proof</Link>
          </div>
          <ol className="mt-10 flex flex-wrap gap-3 text-sm">
            {['Pick a stock and an amount', 'Sign once', 'Get the most real shares, any day'].map((t, i) => (
              <li key={t} className="flex items-center gap-2 rounded-full bg-paper-3 py-1.5 pl-1.5 pr-4 shadow-[var(--shadow-lift)]">
                <span className="grid size-7 place-items-center rounded-full bg-ink font-mono text-xs text-paper">{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>
        </div>
        <BalanceArtifact className="pointer-events-none z-0 mx-auto mt-10 block w-[88%] max-w-[560px] min-[640px]:w-[80%] min-[1024px]:absolute min-[1024px]:right-0 min-[1024px]:top-4 min-[1024px]:mt-0 min-[1024px]:w-[42%]" />
      </section>

      {/* 2. Live shelf strip */}
      <section className="mx-auto w-[min(1180px,calc(100%-24px))] pt-4" aria-label="Live counters"><LiveCounters /></section>

      <section className="mx-auto w-[min(1180px,calc(100%-24px))] py-10" aria-labelledby="strip">
        <h2 id="strip" className="sr-only">Live shelf</h2>
        <LiveShelfStrip />
      </section>

      {/* 3. The weighing */}
      <section className="mx-auto w-[min(1180px,calc(100%-24px))] py-16" aria-labelledby="weighing">
        <Reveal>
          <p className="font-mono text-xs uppercase tracking-widest text-graphite">The weighing</p>
          <h2 id="weighing" className="h2 mt-2 max-w-3xl">The gap you see is three things. Only one is a price.</h2>
        </Reveal>
        <Weighing unitBps={bestWrap} weekendPct={d?.weekendSharePct ?? null} />
      </section>

      {/* 4. Amara's Saturday */}
      <section className="mx-auto w-[min(1180px,calc(100%-24px))] py-16" aria-labelledby="amara">
        <div className="grid items-center gap-8 md:grid-cols-2">
          <figure className="overflow-hidden rounded-[var(--radius-card)] bg-paper-3 shadow-[var(--shadow-lift)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://images.unsplash.com/photo-1569706971306-de5d78f6418e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1400" alt="A city at night seen from above, lit windows and streets" className="aspect-[4/3] w-full object-cover" loading="lazy" />
          </figure>
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-graphite">Amara&apos;s Saturday</p>
            <h2 id="amara" className="h2 mt-2">She wanted a little Nvidia. She found three.</h2>
            <ol className="mt-6 space-y-5 text-graphite">
              <li><strong className="text-ink">What she saw.</strong> Three tokens called Nvidia, three prices, and a market that had been shut since Friday night.</li>
              <li><strong className="text-ink">What Parallax showed.</strong> Each token weighed in shares: the price you see, minus the wrapper, and the age of the reference stated plainly.</li>
              <li><strong className="text-ink">What she got.</strong> A standing order she signed once. It fills at the issuer that gives the most shares, or does nothing.</li>
            </ol>
          </div>
        </div>
      </section>

      {/* 5. Standing orders */}
      <section className="mx-auto w-[min(1180px,calc(100%-24px))] py-16" aria-labelledby="orders">
        <p className="font-mono text-xs uppercase tracking-widest text-graphite">Standing orders</p>
        <h2 id="orders" className="h2 mt-2 max-w-3xl">A ledger of what the chain allowed, and what it refused.</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <LedgerCard kind="Filled" tone="net" body={auto?.fills ? `${auto.fills} real fill(s) on BSC mainnet, recorded with the owner wallet untouched.` : 'The first mainnet fill appears here as soon as the keeper has signed one. Until then this card is empty by design, not decorated.'} />
          <LedgerCard kind="Refused" tone="gross" body={auto?.refusals ? `${auto.refusals} fill(s) reverted on-chain with ShareFloor.` : 'A deliberate refusal appears here: an order whose floor no market can meet, and the transaction that proves the chain said no.'} />
        </div>
      </section>

      {/* 6. The guarantee */}
      <section className="mx-auto w-[min(1180px,calc(100%-24px))] py-16" aria-labelledby="guarantee">
        <h2 id="guarantee" className="h2 max-w-3xl">Wrappers quote. <em className="font-serif italic font-medium">Shares</em> decide.</h2>
        <ol className="mt-8 grid gap-x-10 gap-y-4 md:grid-cols-2">
          {[
            ['T1', 'No comparison, ranking or limit uses raw token units.'],
            ['T2', 'A fill never delivers fewer shares than you signed for.'],
            ['T3', 'The unit is read on-chain in the fill transaction, never passed by the keeper.'],
            ['T4', 'No fill while the issuer has paused the token for a corporate action.'],
            ['T6', 'Your funds stay in your wallet until the fill; the contract holds nothing between transactions.'],
            ['T7', 'Output reaches you only. The keeper cannot redirect it.'],
            ['T8', 'An order fills at most once.'],
            ['T10', 'A stale reference is labelled and never used as live.'],
          ].map(([id, t]) => (
            <li key={id} className="flex gap-4 border-t border-rule py-3">
              <span className="font-mono text-sm text-unit">{id}</span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-graphite"><Link className="underline underline-offset-4" href="/proof">Each invariant links to its test and its evidence</Link>.</p>
      </section>

      {/* 7. Proof numbers (all generated) */}
      <section className="mx-auto w-[min(1180px,calc(100%-24px))] py-16" aria-labelledby="numbers">
        <h2 id="numbers" className="h2">The numbers, generated from files.</h2>
        <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Wrappers measured" value={d ? String(d.wrappers) : null} note={d ? `${d.tickers} tickers` : undefined} />
          <Stat label="Largest unit gap, one ticker" value={d ? `${d.units.maxOndoVsBstocksBps.toFixed(1)} bps` : null} note="Ondo vs bStocks, before any premium" />
          <Stat label="Quotes caught off-reference" value={d ? String(sumBroken(d)) : null} note={d ? `of ${d.brokenQuotes.observations} observations` : undefined} />
          <Stat label="Parallax vs naive pick" value={counter?.parallaxMinusNaiveBps !== undefined ? `${counter.parallaxMinusNaiveBps.toFixed(1)} bps` : null} note="shares per $50, counterfactual" />
        </dl>
      </section>

      {/* 8. For agents */}
      <section className="mx-auto w-[min(1180px,calc(100%-24px))] py-16" aria-labelledby="agents">
        <h2 id="agents" className="h2 max-w-3xl">Agents are users too.</h2>
        <p className="mt-4 max-w-2xl text-graphite">An Agentic Wallet can place the same order from one sentence. An MCP client can ask what a share costs. The keeper has an on-chain identity and sells a signed decomposition for a few cents.</p>
        <pre className="mt-6 overflow-x-auto rounded-[var(--radius-card)] bg-ink p-5 font-mono text-[13px] leading-6 text-paper" tabIndex={0}>
{`curl -s ${'$'}ORIGIN/api/mcp -H 'content-type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"parallax_shelf","arguments":{"ticker":"NVDA"}}}'`}
        </pre>
      </section>

      {/* 9. Honest limits */}
      <section className="mx-auto w-[min(1180px,calc(100%-24px))] py-16" aria-labelledby="limits">
        <h2 id="limits" className="h2">Honest limits.</h2>
        <ul className="mt-6 max-w-3xl list-disc space-y-2 pl-5 text-graphite">
          <li>The floor is a floor, not the best price: an untrusted filler can deliver exactly the shares you signed for.</li>
          <li>Ondo names fill by owner-signed RFQ through the aggregator. A contract cannot be that signer, so standing orders use direct pools only.</li>
          <li>Most Ondo and xStocks pools can be fragmented. The Shelf says so instead of pretending.</li>
          <li>Tokenized stocks are not shares. Read the issuer terms.</li>
        </ul>
      </section>
    </>
  );
}

function sumBroken(d: NonNullable<Awaited<ReturnType<typeof discovery>>>): number {
  let n = 0;
  for (const bySession of Object.values(d.brokenQuotes.bySessionIssuer)) for (const e of Object.values(bySession)) n += e.chainBroken + e.apiBroken;
  return n;
}

function LedgerCard({ kind, tone, body }: { kind: string; tone: 'net' | 'gross'; body: string }) {
  return (
    <article className="rounded-[var(--radius-card)] border border-rule bg-paper-3 p-6 shadow-[var(--shadow-lift)]">
      <p className={`font-mono text-xs uppercase tracking-widest ${tone === 'net' ? 'text-net' : 'text-gross'}`}>{kind}</p>
      <p className="mt-3">{body}</p>
    </article>
  );
}

function Stat({ label, value, note }: { label: string; value: string | null; note?: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-rule bg-paper-3 p-5">
      <dt className="text-sm text-graphite">{label}</dt>
      <dd className="num mt-2 font-display text-3xl font-semibold">
        {value ?? <span className="text-base font-normal text-graphite">Not generated yet</span>}
        {note ? <span className="mt-1 block font-sans text-xs font-normal text-graphite">{note}</span> : null}
      </dd>
    </div>
  );
}

