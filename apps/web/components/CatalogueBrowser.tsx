'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

export interface CatalogueTicker {
  ticker: string;
  name: string | null;
  industry: string | null;
  tokens: { symbol: string; issuer: string; fillable: boolean }[];
}

const NAME: Record<string, string> = { BSTOCKS: 'bStocks', ONDO: 'Ondo', XSTOCKS: 'xStocks' };
const CHIP: Record<string, string> = { BSTOCKS: 'bg-unit', ONDO: 'bg-session', XSTOCKS: 'bg-gross' };
const PAGE = 60;

/**
 * Read-only catalogue of every tokenized equity the Binance list endpoint returns for BNB Chain, with search and
 * sector tabs. A ticker is "fillable by ParallaxBook" only when at least one of its tokens is a registry wrapper.
 */
export function CatalogueBrowser({ rows, generatedAt, tokenCount }: { rows: CatalogueTicker[]; generatedAt: string; tokenCount: number }) {
  const [q, setQ] = useState('');
  const [sector, setSector] = useState<string>('All');
  const [more, setMore] = useState(PAGE);
  const sectors = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of rows) c.set(r.industry || 'Unclassified', (c.get(r.industry || 'Unclassified') ?? 0) + 1);
    return ['All', ...[...c.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)];
  }, [rows]);
  const fillable = useMemo(() => rows.filter((r) => r.tokens.some((t) => t.fillable)).length, [rows]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => (sector === 'All' || (r.industry || 'Unclassified') === sector) && (!needle || `${r.ticker} ${r.name ?? ''} ${r.tokens.map((t) => t.symbol).join(' ')}`.toLowerCase().includes(needle)));
  }, [rows, q, sector]);

  return (
    <section aria-label="Catalogue of every tokenized equity on BNB Chain" className="mt-14">
      <p className="font-mono text-xs uppercase tracking-widest text-graphite">Catalogue · {rows.length} tickers · {tokenCount} tokens · {fillable} fillable by ParallaxBook</p>
      <h2 className="font-display mt-1 text-3xl font-semibold">Everything the API lists</h2>
      <p className="mt-2 max-w-2xl text-graphite">Read-only. Tokens without a contract-fillable route are shown so you can see the whole universe, and are never offered as a fill. Snapshot of the list endpoint, {generatedAt.slice(0, 10)}.</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="relative block w-full max-w-sm">
          <span className="sr-only">Search the catalogue</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-graphite" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setMore(PAGE); }} placeholder="Search ticker, company or token" className="w-full rounded-[14px] border border-rule bg-paper-3 py-2.5 pl-9 pr-3" />
        </label>
      </div>
      <div role="tablist" aria-label="Sector" className="mt-3 flex flex-wrap gap-2">
        {sectors.map((s) => (
          <button key={s} role="tab" aria-selected={sector === s} onClick={() => { setSector(s); setMore(PAGE); }}
            className={`rounded-full border px-3 py-1 text-xs ${sector === s ? 'border-ink bg-ink text-paper' : 'border-rule hover:bg-paper-2'}`}>{s}</button>
        ))}
      </div>
      <p className="mt-3 text-xs text-graphite" aria-live="polite">{shown.length} shown</p>
      {shown.length === 0 ? (
        <p className="mt-4 rounded-[14px] bg-paper-2 p-4 text-sm">Nothing in the catalogue matches that search.</p>
      ) : (
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {shown.slice(0, more).map((r) => {
            const fill = r.tokens.some((t) => t.fillable);
            return (
              <li key={r.ticker} className="flex items-center gap-3 rounded-[14px] border border-rule bg-paper-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    {fill ? <Link className="font-display font-semibold underline" href={`/app/t/${r.ticker}`}>{r.ticker}</Link> : <span className="font-display font-semibold">{r.ticker}</span>}
                    {r.tokens.map((t) => <span key={t.symbol} className={`rounded px-1.5 py-0.5 font-mono text-[10px] text-white ${CHIP[t.issuer] ?? 'bg-graphite'}`}>{NAME[t.issuer] ?? t.issuer}</span>)}
                  </p>
                  <p className="truncate text-xs text-graphite">{r.name ?? 'name not listed'} · {r.industry || 'Unclassified'}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-[11px] ${fill ? 'bg-net/20 text-net' : 'bg-paper-2 text-graphite'}`}>{fill ? 'fillable by ParallaxBook' : 'read-only'}</span>
              </li>
            );
          })}
        </ul>
      )}
      {more < shown.length && (
        <button onClick={() => setMore((m) => m + PAGE)} className="mt-4 rounded-[12px] border border-rule px-4 py-2 text-sm hover:bg-paper-2">Show {Math.min(PAGE, shown.length - more)} more</button>
      )}
    </section>
  );
}

