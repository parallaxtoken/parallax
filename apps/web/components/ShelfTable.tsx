import type { ShelfView } from '@/lib/server/shelf';
import { bps, dec, usd } from '@/lib/format';

const ISSUER: Record<string, { name: string; chip: string }> = {
  BSTOCKS: { name: 'bStocks', chip: 'bg-unit' },
  ONDO: { name: 'Ondo', chip: 'bg-session' },
  XSTOCKS: { name: 'xStocks', chip: 'bg-gross' },
};

/** One row per wrapper: unit, price per share, net premium. The wrapper with the most shares wears the green glow. */
export function ShelfTable({ shelf, compact = false }: { shelf: ShelfView; compact?: boolean }) {
  if (shelf.degraded && shelf.wrappers.every((w) => !w.quote && !w.unitWad)) {
    return (
      <p className="mt-4 rounded-[14px] bg-gross/10 p-4 text-sm" role="alert">
        <strong>Data source unavailable ({shelf.degraded.kind}).</strong> {shelf.degraded.message}. Nothing is shown rather than guessed.
      </p>
    );
  }
  return (
    <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label={`Wrappers of ${shelf.ticker} weighed in shares`}>
      <table className="w-full min-w-[520px] border-separate border-spacing-y-1.5 text-sm">
        <thead>
          <tr className="text-left font-mono text-[11px] uppercase tracking-wider text-graphite">
            <th className="px-3 font-normal">Wrapper</th>
            <th className="px-3 font-normal">Unit</th>
            {!compact && <th className="px-3 font-normal">Token price</th>}
            <th className="px-3 font-normal">$ / share</th>
            <th className="px-3 font-normal">Net</th>
            {!compact && <th className="px-3 font-normal">Depth</th>}
            <th className="px-3 font-normal">Shares for ${shelf.quoteUsd}</th>
          </tr>
        </thead>
        <tbody>
          {shelf.wrappers.map((w) => {
            const best = shelf.bestIndex === w.registryIndex;
            const meta = ISSUER[w.issuer];
            return (
              <tr key={w.token} className={`bg-paper-2/70 ${best ? 'glow-net' : ''}`}>
                <td className="rounded-l-[12px] px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span className={`size-3 rounded-[4px] ${meta?.chip ?? 'bg-graphite'}`} aria-hidden />
                    <span className="font-medium">{w.symbol}</span>
                    <span className="text-xs text-graphite">{meta?.name}</span>
                    {w.unitPaused ? <span className="rounded bg-gross px-1.5 py-0.5 text-[10px] text-white">paused</span> : null}
                    {w.contractReceive === 'REFUSED' ? <span className="rounded bg-ink px-1.5 py-0.5 text-[10px] text-paper">instant only</span> : null}
                  </span>
                </td>
                <td className="num px-3 py-2 font-mono text-xs">{w.unitWad ? dec(w.unitWad, 6) : w.unitError ? <span className="text-gross">unread</span> : '–'}</td>
                {!compact && <td className="num px-3 py-2">{w.apiTokenPriceUsd ? `$${Number(w.apiTokenPriceUsd).toFixed(2)}` : '–'}</td>}
                <td className="num px-3 py-2">{w.quote ? usd(w.quote.usdPerShare) : <span className="text-graphite" title={w.quoteNote ?? undefined}>no route</span>}</td>
                <td className="num px-3 py-2">
                  {w.quote ? (
                    w.quote.brokenQuote ? <span className="rounded bg-gross/15 px-1.5 py-0.5 text-xs text-gross">broken quote</span> : shelf.session.referenceAgeSec > 0 ? <span className="text-xs text-graphite">{bps(w.quote.netVsReferenceBps)} vs aged ref</span> : bps(w.quote.netVsReferenceBps)
                  ) : '–'}
                </td>
                <td className="num rounded-r-[12px] px-3 py-2 font-medium">{w.quote ? dec(w.quote.sharesWad, 4) : '–'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-graphite">{shelf.referenceNote}</p>
      {!compact && <ReferencePanel shelf={shelf} />}
    </div>
  );
}

const SRC_NAME: Record<string, string> = { YAHOO_CHART: 'Yahoo Finance chart', NASDAQ_QUOTE: 'Nasdaq quote' };
const FLOOR_WORDS: Record<string, string> = {
  ISSUER_FEED: 'the Ondo equity feed, cross-checked by the independent source',
  INDEPENDENT: 'the independent source alone (this ticker has no issuer reference)',
  NONE: 'nothing: the planner and the keeper refuse',
};

/** Where every equity reference came from, with source and timestamp, and which one sets the floor. */
function ReferencePanel({ shelf }: { shelf: ShelfView }) {
  const i = shelf.independent;
  const tone = i.verdict.status === 'AGREE' || i.verdict.status === 'SINGLE_SOURCE' ? 'text-net' : 'text-gross';
  return (
    <section className="mt-4 rounded-[14px] border border-rule p-4" aria-label="Independent equity reference">
      <h3 className="font-display text-sm font-semibold">Equity reference, two sources</h3>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-graphite">Issuer feed</dt>
        <dd className="num">{shelf.issuerReferenceUsdPerShare ? `$${dec(shelf.issuerReferenceUsdPerShare, 2)} · Ondo equity feed (Binance API stockInfo.price)` : 'none for this ticker (bStocks and xStocks expose no equity reference)'}</dd>
        <dt className="text-graphite">Independent</dt>
        <dd className="num">
          {i.ok && i.usdPerShare
            ? <>${dec(i.usdPerShare, 2)} · {SRC_NAME[i.source ?? ''] ?? i.source} · {i.intraday ? `last print ${i.intraday.at}` : `as of ${i.asOf}`}{i.daily ? ` · daily close $${Number(i.daily.close).toFixed(2)} on ${i.daily.date}` : ''}</>
            : <>unavailable: {i.failure}</>}
        </dd>
        <dt className="text-graphite">Verdict</dt>
        <dd className={tone}>
          {i.verdict.status === 'AGREE' && `agree within ${i.verdict.maxBps} bps (${i.verdict.disagreeBps} bps apart)`}
          {i.verdict.status === 'DISAGREE' && `disagree by ${i.verdict.disagreeBps} bps (limit ${i.verdict.maxBps}): REFERENCE_DISAGREE`}
          {i.verdict.status === 'SINGLE_SOURCE' && 'one source only'}
          {i.verdict.status === 'UNAVAILABLE' && 'cannot be confirmed: fails closed'}
        </dd>
        <dt className="text-graphite">Sets the floor</dt>
        <dd>{FLOOR_WORDS[i.verdict.floorSource]}</dd>
      </dl>
    </section>
  );
}
