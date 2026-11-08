import { notFound } from 'next/navigation';
import { PublicRwaClient } from '@parallax/binance';
import { wrappersFor } from '@parallax/registry';
import { SessionBadge } from '@/components/SessionBadge';
import { ShelfTable } from '@/components/ShelfTable';
import { TradePanel } from '@/components/TradePanel';
import { WeighingChart } from '@/components/WeighingChart';
import { TickerIcon } from '@/components/TickerIcon';
import { getShelf } from '@/lib/server/shelf';
import { bscscan } from '@/lib/format';

export const revalidate = 20;
export const preferredRegion = ['sin1', 'hkg1'];

const rwa = new PublicRwaClient({ origin: process.env.BINANCE_API_ORIGIN });

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  return { title: ticker.toUpperCase() };
}

export default async function TickerPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: raw } = await params;
  const ticker = raw.toUpperCase();
  const ws = wrappersFor(ticker);
  if (ws.length === 0) notFound();
  const [shelf, meta] = await Promise.all([getShelf(ticker, 50).catch(() => null), rwa.meta(ws[0]!.token)]);
  const m = meta.ok ? meta.data : null;

  return (
    <div className="mx-auto w-[min(1180px,calc(100%-24px))] py-10">
      <header className="flex flex-wrap items-center gap-4">
        <TickerIcon src={m?.iconUrl ?? null} ticker={ticker} size={56} />
        <div>
          <h1 className="h2">{ticker}</h1>
          <p className="text-graphite">{m?.companyName ?? 'Tokenized equity'}{m?.industry ? `, ${m.industry}` : ''}</p>
        </div>
        {shelf ? <div className="ml-auto"><SessionBadge session={shelf.session.session} ageSec={shelf.session.referenceAgeSec} /></div> : null}
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-8">
          <section aria-labelledby="shelf" className="rounded-[var(--radius-card)] border border-rule bg-paper-3 p-5 shadow-[var(--shadow-lift)]">
            <h2 id="shelf" className="font-display text-xl font-semibold">Weighed in shares</h2>
            {shelf ? <ShelfTable shelf={shelf} /> : <p className="mt-3 rounded-[14px] bg-gross/10 p-3 text-sm" role="alert">The shelf could not be read. A data source is unreachable; this is not an empty market.</p>}
            {shelf?.session.session === 'CLOSED_WEEKEND' || shelf?.session.session === 'CLOSED_HOLIDAY' ? (
              <p className="mt-3 text-sm text-graphite">New York is closed, so the equity reference is aged and is never presented as live. The unit and the share floor still hold.</p>
            ) : null}
          </section>
          <section aria-labelledby="chart" className="rounded-[var(--radius-card)] border border-rule bg-paper-3 p-5 shadow-[var(--shadow-lift)]">
            <h2 id="chart" className="font-display text-xl font-semibold">The weighing chart</h2>
            <p className="mb-3 text-sm text-graphite">USD per share for each wrapper, last 7 days, hourly.</p>
            <WeighingChart ticker={ticker} />
          </section>
          <section aria-labelledby="provenance" className="rounded-[var(--radius-card)] border border-rule bg-paper-3 p-5">
            <h2 id="provenance" className="font-display text-xl font-semibold">Where each number comes from</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {ws.map((w) => (
                <li key={w.token} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">{w.symbol}</span>
                  <a className="font-mono text-xs underline" href={bscscan('token', w.token)} target="_blank" rel="noreferrer">{w.token.slice(0, 10)}…</a>
                  <span className="text-graphite">unit: {w.unit.kind.replace(/_/g, ' ').toLowerCase()} at <a className="underline" href={bscscan('address', w.unit.source)} target="_blank" rel="noreferrer">{w.unit.source.slice(0, 8)}…</a></span>
                </li>
              ))}
            </ul>
            {m?.attestationDailyUrl ? <p className="mt-3 text-sm"><a className="underline" href={m.attestationDailyUrl} target="_blank" rel="noreferrer">Daily attestation report</a></p> : null}
          </section>
        </div>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <TradePanel ticker={ticker} bookDeployed={Boolean(process.env.NEXT_PUBLIC_PARALLAXBOOK)} />
        </aside>
      </div>
    </div>
  );
}
