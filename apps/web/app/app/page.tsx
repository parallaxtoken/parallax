import { PublicRwaClient } from '@parallax/binance';
import { CORE_TICKERS, TICKERS, WRAPPERS, wrappersFor } from '@parallax/registry';
import { ShelfBrowser, type ShelfRowData } from '@/components/ShelfBrowser';
import { getShelf } from '@/lib/server/shelf';
import { CatalogueBrowser, type CatalogueTicker } from '@/components/CatalogueBrowser';
import catalogue from '@/lib/catalogue.generated.json';

export const revalidate = 30;
export const preferredRegion = ['sin1', 'hkg1'];
export const metadata = { title: 'Shelf' };

const rwa = new PublicRwaClient({ origin: process.env.BINANCE_API_ORIGIN });

const FILLABLE = new Set(WRAPPERS.map((w) => w.token.toLowerCase()));
const CAT_ROWS: CatalogueTicker[] = (catalogue.tickers as { ticker: string; name: string | null; industry: string | null; tokens: { symbol: string; token: string; issuer: string }[] }[]).map((t) => ({
  ticker: t.ticker, name: t.name, industry: t.industry,
  tokens: t.tokens.map((x) => ({ symbol: x.symbol, issuer: x.issuer, fillable: FILLABLE.has(x.token.toLowerCase()) })),
}));

export default async function ShelfPage() {
  const rows: ShelfRowData[] = await Promise.all(
    TICKERS.map(async (t): Promise<ShelfRowData> => {
      const ws = wrappersFor(t);
      const core = CORE_TICKERS.includes(t);
      const first = ws[0]!;
      const meta = await rwa.meta(first.token).catch(() => null);
      let live: ShelfRowData['live'] = null;
      if (core) {
        try {
          const s = await getShelf(t, 50);
          const best = s?.wrappers.find((w) => w.registryIndex === s.bestIndex);
          live = { bestSymbol: best?.symbol ?? null, bestShares: best?.quote?.sharesWad ?? null, usdPerShare: best?.quote?.usdPerShare ?? null, unreadable: !!s?.degraded && !best };
        } catch {
          live = { bestSymbol: null, bestShares: null, usdPerShare: null, unreadable: true };
        }
      }
      const m = meta && meta.ok ? meta.data : null;
      return {
        ticker: t, company: m?.companyName ?? null, icon: m?.iconUrl ?? null, concepts: m?.conceptsEn ?? [],
        issuers: Array.from(new Set(ws.map((w) => w.issuer))),
        deepestPoolUsd: Math.max(0, ...ws.map((w) => w.deepestDirectPool?.reserveUsd ?? 0)) || null,
        live, core,
      };
    }),
  );
  rows.sort((a, b) => Number(b.core) - Number(a.core) || (b.deepestPoolUsd ?? 0) - (a.deepestPoolUsd ?? 0));
  const concepts = Array.from(new Set(rows.flatMap((r) => r.concepts))).slice(0, 10);
  return (
    <div className="mx-auto w-[min(1180px,calc(100%-24px))] py-10">
      <p className="font-mono text-xs uppercase tracking-widest text-graphite">{rows.length} tickers, {WRAPPERS.length} wrappers</p>
      <h1 className="h2 mt-1">The Shelf</h1>
      <p className="mt-3 max-w-2xl text-graphite">Every ticker listed here has at least one wrapper a contract can fill. The green glow marks the wrapper that delivers the most shares for $50 right now, counted in shares, not token price.</p>
      <div className="mt-8"><ShelfBrowser rows={rows} concepts={concepts} /></div>
      <CatalogueBrowser rows={CAT_ROWS} generatedAt={catalogue.generatedAt} tokenCount={catalogue.tokenCount} />
    </div>
  );
}
