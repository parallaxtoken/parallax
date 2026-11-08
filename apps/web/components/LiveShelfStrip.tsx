import Link from 'next/link';
import { getShelf, type ShelfView } from '@/lib/server/shelf';
import { SessionBadge } from './SessionBadge';
import { ShelfTable } from './ShelfTable';

async function safe(t: string): Promise<ShelfView | null> {
  try {
    return await getShelf(t, 50);
  } catch {
    return null;
  }
}

/** Server component: the live NVDA and SPY shelves. Every cell is real data or a typed degraded state. */
export async function LiveShelfStrip() {
  const [nvda, spy] = await Promise.all([safe('NVDA'), safe('SPY')]);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {[nvda, spy].map((s, i) =>
        s ? (
          <article key={s.ticker} className="rounded-[var(--radius-card)] border border-rule bg-paper-3 p-5 shadow-[var(--shadow-lift)]">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-2xl font-semibold">{s.ticker}</h3>
              <SessionBadge session={s.session.session} ageSec={s.session.referenceAgeSec} />
            </header>
            <ShelfTable shelf={s} compact />
            <Link href={`/app/t/${s.ticker}`} className="mt-3 inline-block text-sm underline underline-offset-4">Open {s.ticker}</Link>
          </article>
        ) : (
          <article key={i} className="rounded-[var(--radius-card)] border border-rule bg-paper-3 p-5">
            <p className="font-mono text-xs text-gross">UNREACHABLE</p>
            <p className="mt-2 text-graphite">The live shelf could not be read right now. This is a data source problem, not an empty market.</p>
          </article>
        ),
      )}
    </div>
  );
}
