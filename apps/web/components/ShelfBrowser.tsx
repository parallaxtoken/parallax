'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { TickerIcon } from './TickerIcon';

export interface ShelfRowData {
  ticker: string;
  company: string | null;
  icon: string | null;
  concepts: string[];
  issuers: string[];
  deepestPoolUsd: number | null;
  live: null | { bestSymbol: string | null; bestShares: string | null; usdPerShare: string | null; unreadable: boolean };
  core: boolean;
}

const CHIP: Record<string, string> = { BSTOCKS: 'bg-unit', ONDO: 'bg-session', XSTOCKS: 'bg-gross' };
const NAME: Record<string, string> = { BSTOCKS: 'bStocks', ONDO: 'Ondo', XSTOCKS: 'xStocks' };

export function ShelfBrowser({ rows, concepts }: { rows: ShelfRowData[]; concepts: string[] }) {
  const [q, setQ] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const shown = useMemo(
    () =>
      rows.filter((r) => {
        const hay = `${r.ticker} ${r.company ?? ''}`.toLowerCase();
        return hay.includes(q.trim().toLowerCase()) && (!tag || r.concepts.includes(tag));
      }),
    [rows, q, tag],
  );
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative block w-full max-w-sm">
          <span className="sr-only">Search by ticker or company</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-graphite" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search NVDA, Tesla, S&P" className="w-full rounded-[14px] border border-rule bg-paper-3 py-2.5 pl-9 pr-3" />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by theme">
          <button onClick={() => setTag(null)} aria-pressed={tag === null} className={`rounded-full px-3 py-1.5 text-sm ${tag === null ? 'bg-ink text-paper' : 'bg-paper-2'}`}>All</button>
          {concepts.map((c) => (
            <button key={c} onClick={() => setTag(tag === c ? null : c)} aria-pressed={tag === c} className={`rounded-full px-3 py-1.5 text-sm ${tag === c ? 'bg-ink text-paper' : 'bg-paper-2'}`}>{c}</button>
          ))}
        </div>
      </div>
      <p className="mt-3 text-sm text-graphite" aria-live="polite">{shown.length} of {rows.length} tickers with at least one contract-fillable wrapper.</p>
      <ul className="mt-4 grid gap-3">
        {shown.map((r) => (
          <li key={r.ticker}>
            <Link href={`/app/t/${r.ticker}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-[var(--radius-card)] border border-rule bg-paper-3 p-4 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
              <TickerIcon src={r.icon} ticker={r.ticker} />
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-display text-lg font-semibold">{r.ticker}
                  <span className="flex gap-1">{r.issuers.map((i) => <span key={i} title={NAME[i]} className={`size-2.5 rounded-[3px] ${CHIP[i]}`} />)}</span>
                </span>
                <span className="block truncate text-sm text-graphite">{r.company ?? 'Tokenized equity'}</span>
              </span>
              <span className="text-right text-sm">
                {r.live ? (
                  r.live.bestSymbol ? (
                    <span className="inline-block rounded-[10px] px-2 py-1 glow-net">
                      <span className="block font-medium">{r.live.bestSymbol}</span>
                      <span className="num block text-xs text-graphite">most shares per $50</span>
                    </span>
                  ) : <span className="text-graphite">{r.live.unreadable ? 'sources unreadable' : 'no usable route now'}</span>
                ) : (
                  <span className="text-graphite">{r.deepestPoolUsd !== null ? `pool $${Math.round(r.deepestPoolUsd).toLocaleString('en-US')}` : '–'}</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className="mt-6 rounded-[14px] bg-paper-2 p-4 text-sm">Nothing matches that search. Every ticker listed has a wrapper a contract can fill; clear the filter to see them.</p>}
    </div>
  );
}
