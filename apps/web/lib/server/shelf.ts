import 'server-only';
import { PublicRwaClient, SignedClient, type MarketStatus, type RwaDynamic } from '@parallax/binance';
import { independentReference, verdict as refVerdict, DEFAULT_MAX_DISAGREE_BPS, type ReferenceVerdict } from '@parallax/independent';
import {
  USDT,
  WRAPPERS,
  directRoutes,
  makeClient,
  readUnit,
  registryIndex,
  tickerIdOf,
  wrappersFor,
  TICKERS,
  type WrapperRecord,
} from '@parallax/registry';
import {
  BROKEN_QUOTE_THRESHOLD,
  WAD,
  decompose,
  readSession,
  referenceIsLive,
  sharesFor,
  sharesPerToken,
  tokens as tokensBrand,
  usd as usdBrand,
  effectiveUsdPerShare,
  usdPerShare,
  usdPerToken,
  wadFromDecimal,
  type SessionRead,
} from '@parallax/kernel';

const rwa = new PublicRwaClient({ origin: process.env.BINANCE_API_ORIGIN });
const apiKey = process.env.BINANCE_WEB3_API_KEY, apiSecret = process.env.BINANCE_WEB3_SECRET_KEY;
export const signedApi = apiKey && apiSecret ? new SignedClient({ apiKey, secretKey: apiSecret, origin: process.env.BINANCE_WEB3_ORIGIN }) : null;

export interface DepthView { pools: number; protocols: string[]; source: 'MARKET_TOP_LIQUIDITY'; liquidityUsdReported: boolean }
export const chain = makeClient(process.env.BSC_RPC_URL);

export const REFERENCE_MAX_BPS = Number(process.env.REFERENCE_MAX_DISAGREE_BPS ?? DEFAULT_MAX_DISAGREE_BPS);
export const REFERENCE_REQUIRED = process.env.REFERENCE_REQUIRED !== 'false';

/** The second-opinion equity reference, with its source and timestamp, and the fail-closed verdict against the issuer feed. */
export interface IndependentView {
  ok: boolean;
  source: string | null;
  sourceUrl: string | null;
  usdPerShare: string | null;
  asOf: string | null;
  fetchedAt: string;
  intraday: { price: string; at: string } | null;
  daily: { close: string; date: string; previousClose: string | null } | null;
  failure: string | null;
  verdict: ReferenceVerdict;
}

export type Degradation = { kind: 'UNREACHABLE' | 'GEO_BLOCKED' | 'AUTH' | 'RATE_LIMITED' | 'BODY_ERROR' | 'MALFORMED'; message: string };

export interface WrapperView {
  symbol: string;
  token: `0x${string}`;
  issuer: WrapperRecord['issuer'];
  registryIndex: number;
  contractReceive: WrapperRecord['contractReceive'];
  unitWad: string | null;
  unitPaused: boolean | null;
  unitError: string | null;
  apiTokenPriceUsd: string | null;
  apiMultiplier: string | null;
  apiMultiplierMatchesChain: boolean | null;
  /** best direct-pool route at the quote size */
  quote: null | { venue: string; pool: string | null; tokensOutWad: string; sharesWad: string; usdPerShare: string; netVsReferenceBps: number | null; brokenQuote: boolean };
  /** explains a missing quote: no pool, or only an RFQ route */
  quoteNote: string | null;
  deepestPoolUsd: number | null;
  /** Pool count and venues from the Market API top-liquidity endpoint (its liquidityUsd field is null for these tokens). */
  depth: DepthView | null;
  icon: string | null;
}

export interface ShelfView {
  ticker: string;
  tickerId: `0x${string}`;
  quoteUsd: number;
  session: SessionRead;
  referenceUsdPerShare: string | null;
  referenceNote: string;
  independent: IndependentView;
  /** The Ondo equity feed value when the ticker has one, before any second-opinion fallback. */
  issuerReferenceUsdPerShare: string | null;
  wrappers: WrapperView[];
  /** registry index of the wrapper that delivers the most shares for the quote size, if any is not broken */
  bestIndex: number | null;
  degraded: Degradation | null;
  asOf: string;
  block: string | null;
}

const cache = new Map<string, { at: number; v: unknown }>();
async function memo<T>(key: string, ttlMs: number, f: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.v as T;
  const v = await f();
  cache.set(key, { at: Date.now(), v });
  return v;
}

export const marketStatus = (): Promise<MarketStatus | Degradation> =>
  memo('market', 15_000, async () => {
    const r = await rwa.marketStatus();
    if (r.ok) return r.data;
    return 'degraded' in r ? { kind: r.degraded.kind, message: r.degraded.message } : { kind: 'BODY_ERROR' as const, message: 'no market status' };
  });

export async function currentSession(): Promise<SessionRead & { degraded: Degradation | null }> {
  const m = await marketStatus();
  if ('kind' in m) return { ...readSession(Date.now(), null), degraded: m };
  return {
    ...readSession(Date.now(), { marketStatus: m.marketStatus, openState: m.openState, reasonCode: m.reasonCode, reasonMsg: m.reasonMsg, nextOpenTime: m.nextOpenTime }),
    degraded: null,
  };
}

async function dynamicFor(token: string): Promise<RwaDynamic | Degradation | null> {
  return memo(`dyn:${token}`, 20_000, async () => {
    const r = await rwa.dynamic(token);
    if (r.ok) return r.data;
    if ('notFound' in r) return null;
    return { kind: r.degraded.kind, message: r.degraded.message };
  });
}

export async function getShelf(ticker: string, quoteUsd = 50): Promise<ShelfView | null> {
  const T = ticker.toUpperCase();
  const ws = wrappersFor(T);
  if (ws.length === 0) return null;
  return memo(`shelf:${T}:${quoteUsd}`, 20_000, async () => {
    const session = await currentSession();
    let degraded: Degradation | null = session.degraded;
    const block = await chain.getBlockNumber().catch(() => null);

    const dyns = await Promise.all(ws.map((w) => dynamicFor(w.token)));
    const ondoIdx = ws.findIndex((w) => w.issuer === 'ONDO');
    const ondoDyn = ondoIdx >= 0 ? dyns[ondoIdx] : null;
    let referenceUsdPerShare: bigint | null = null;
    let referenceNote = 'No equity reference is exposed for this ticker.';
    if (ondoDyn && 'stockPrice' in ondoDyn && ondoDyn.stockPrice) {
      referenceUsdPerShare = wadFromDecimal(ondoDyn.stockPrice);
      referenceNote = referenceIsLive(session)
        ? 'Equity reference from the Ondo equity feed, live.'
        : `Equity reference from the Ondo equity feed. New York is closed; it is ${Math.round(session.referenceAgeSec / 3600)}h old.`;
    } else if (ondoDyn && 'kind' in ondoDyn) {
      degraded = degraded ?? ondoDyn;
      referenceNote = 'The reference could not be read: the data source is unreachable.';
    }

    // Second opinion: an independent public source. Fail closed when it disagrees or is required and missing.
    const ind = await memo(`ind:${T}`, 30_000, () => independentReference(T));
    const issuerRef = referenceUsdPerShare;
    const verdict = refVerdict(issuerRef, ind.ok ? ind.usdPerShare : null, REFERENCE_MAX_BPS, REFERENCE_REQUIRED);
    const src = ind.ok ? (ind.source === 'YAHOO_CHART' ? 'Yahoo Finance chart' : 'Nasdaq quote') : null;
    if (verdict.status === 'AGREE' && src) {
      referenceNote += ` Cross-checked against the ${src}: ${verdict.disagreeBps} bps apart.`;
    } else if (verdict.status === 'DISAGREE' && src) {
      referenceNote = `The Ondo equity feed and the ${src} disagree by ${verdict.disagreeBps} bps (limit ${REFERENCE_MAX_BPS}). Parallax will not plan against either.`;
    } else if (verdict.status === 'SINGLE_SOURCE' && src && issuerRef === null && ind.ok) {
      referenceUsdPerShare = ind.usdPerShare;
      referenceNote = `No issuer reference exists for this ticker. Equity reference from the ${src}, ${ind.intraday?.at ?? ind.asOf}.`;
    } else if (verdict.status === 'UNAVAILABLE') {
      referenceNote += ' The independent reference could not be read, so planning fails closed.';
    }
    const independent: IndependentView = ind.ok
      ? { ok: true, source: ind.source, sourceUrl: ind.sourceUrl, usdPerShare: ind.usdPerShare.toString(), asOf: ind.asOf, fetchedAt: ind.fetchedAt, intraday: ind.intraday, daily: ind.daily, failure: null, verdict }
      : { ok: false, source: null, sourceUrl: null, usdPerShare: null, asOf: null, fetchedAt: new Date().toISOString(), intraday: null, daily: null, failure: ind.message, verdict };

    const views: WrapperView[] = [];
    await Promise.all(
      ws.map(async (w, i) => {
        const dyn = dyns[i];
        let unit: bigint | null = null;
        let paused: boolean | null = null;
        let unitError: string | null = null;
        try {
          const u = await readUnit(chain, w);
          unit = u.unit;
          paused = u.paused;
        } catch (e) {
          unitError = e instanceof Error ? e.message.split('\n')[0] ?? 'read failed' : 'read failed';
        }
        const apiMult = dyn && 'sharesMultiplier' in dyn ? dyn.sharesMultiplier : null;
        const apiPrice = dyn && 'tokenPrice' in dyn ? dyn.tokenPrice : null;
        let apiMatches: boolean | null = null;
        if (apiMult && unit !== null && w.issuer !== 'XSTOCKS') apiMatches = Math.abs(Number(wadFromDecimal(apiMult) - unit)) < 1e3;

        let quote: WrapperView['quote'] = null;
        let quoteNote: string | null = null;
        if (unit !== null) {
          const routes = await directRoutes(chain, {
            tokenIn: USDT, tokenOut: w.token, amountIn: wadFromDecimal(String(quoteUsd)), recipient: w.token, deadline: BigInt(Math.floor(Date.now() / 1000) + 300),
          }).catch(() => []);
          const top = routes[0];
          if (top) {
            const sh = sharesFor(tokensBrand(top.amountOut), sharesPerToken(unit));
            const ups = effectiveUsdPerShare(usdBrand(wadFromDecimal(String(quoteUsd))), tokensBrand(top.amountOut), sharesPerToken(unit));
            const net = referenceUsdPerShare ? ((ups * WAD) / referenceUsdPerShare) - WAD : null;
            quote = {
              venue: top.venue, pool: null, tokensOutWad: top.amountOut.toString(), sharesWad: sh.toString(), usdPerShare: ups.toString(),
              netVsReferenceBps: net === null ? null : Number((net * 10000n) / WAD),
              brokenQuote: net !== null && (net < 0n ? -net : net) > BROKEN_QUOTE_THRESHOLD,
            };
          } else {
            quoteNote = w.issuer === 'ONDO' ? 'Ondo names fill by owner-signed RFQ through the aggregator; no direct pool has depth.' : 'No direct pool route.';
          }
        }
        let depth: DepthView | null = null;
        if (signedApi) {
          const liq = await memo(`liq:${w.token}`, 300_000, () => signedApi.topLiquidity(w.token)).catch(() => null);
          if (liq && liq.ok) {
            depth = {
              pools: liq.data.length,
              protocols: Array.from(new Set(liq.data.map((p) => p.protocol).filter((x): x is string => !!x))),
              source: 'MARKET_TOP_LIQUIDITY',
              liquidityUsdReported: liq.data.some((p) => p.liquidityUsd !== null),
            };
          }
        }
        views.push({
          symbol: w.symbol, token: w.token, issuer: w.issuer, registryIndex: registryIndex(w), contractReceive: w.contractReceive,
          unitWad: unit?.toString() ?? null, unitPaused: paused, unitError,
          apiTokenPriceUsd: apiPrice, apiMultiplier: apiMult, apiMultiplierMatchesChain: apiMatches,
          quote, quoteNote, deepestPoolUsd: w.deepestDirectPool?.reserveUsd ?? null, depth,
          icon: null,
        });
      }),
    );
    views.sort((a, b) => a.registryIndex - b.registryIndex);

    const live = views.filter((v) => v.quote && !v.quote.brokenQuote && v.unitPaused === false);
    const best = live.sort((a, b) => (BigInt(b.quote!.sharesWad) > BigInt(a.quote!.sharesWad) ? 1 : -1))[0];

    return {
      ticker: T, tickerId: tickerIdOf(T), quoteUsd, session,
      referenceUsdPerShare: referenceUsdPerShare?.toString() ?? null, referenceNote, independent, issuerReferenceUsdPerShare: issuerRef?.toString() ?? null, wrappers: views,
      bestIndex: best ? best.registryIndex : null, degraded, asOf: new Date().toISOString(), block: block?.toString() ?? null,
    } satisfies ShelfView;
  });
}

export const allTickers = (): string[] => TICKERS;
export { WRAPPERS, decompose, usdPerShare, usdPerToken };
