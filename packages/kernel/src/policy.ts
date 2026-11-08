import {
  WAD,
  decompose,
  sharesFor,
  tokensForShares,
  effectiveUsdPerShare,
  mulDiv,
  type Shares,
  type SharesPerToken,
  type Tokens,
  type Usd,
  type UsdPerShare,
  type UsdPerToken,
} from './units';
import { referenceIsLive, type SessionRead } from './session';

export type Issuer = 'BSTOCKS' | 'ONDO' | 'XSTOCKS';
export type RouteKind = 'AMM' | 'AGGREGATOR_SWAP' | 'RFQ';

/** Typed refusal reasons (6.9), shown verbatim in the UI and counted by the keeper. */
export type RefusalReason =
  | 'PREMIUM_ABOVE_LIMIT'
  | 'UNIT_PAUSED'
  | 'NO_CONTRACT_ROUTE'
  | 'BROKEN_QUOTE'
  | 'SIM_FAILED'
  | 'API_DEGRADED'
  | 'REFERENCE_DISAGREE';

export const REFUSAL_REASONS: readonly RefusalReason[] = [
  'PREMIUM_ABOVE_LIMIT',
  'UNIT_PAUSED',
  'NO_CONTRACT_ROUTE',
  'BROKEN_QUOTE',
  'SIM_FAILED',
  'API_DEGRADED',
  'REFERENCE_DISAGREE',
];

/** Second-opinion check on the equity reference (fail closed). Prices are WAD USD per share. */
export interface ReferenceCheck {
  issuerReference: UsdPerShare | null;
  independentReference: UsdPerShare | null;
  /** Largest tolerated gap between the two, in basis points of the independent reference. */
  maxDisagreeBps: number;
  /** When true, a missing independent reference refuses instead of proceeding on one source. */
  required: boolean;
}

export function referenceRefusal(c: ReferenceCheck): { reason: RefusalReason; detail: string } | null {
  const a = c.issuerReference, b = c.independentReference;
  if (a !== null && b !== null) {
    const diff = a > b ? a - b : b - a;
    const bps = b === 0n ? Number.POSITIVE_INFINITY : Number((diff * 10_000n) / b);
    if (bps > c.maxDisagreeBps) return { reason: 'REFERENCE_DISAGREE', detail: `issuer feed and independent source differ by ${bps} bps (limit ${c.maxDisagreeBps})` };
    return null;
  }
  if (b === null && c.required) return { reason: 'API_DEGRADED', detail: 'independent reference unavailable, failing closed' };
  return null;
}

/** Fraction of a quote's own reference beyond which it is a broken quote, not a price (E12). */
export const BROKEN_QUOTE_THRESHOLD: bigint = (WAD * 5n) / 100n;

export interface WrapperQuote {
  wrapperIdx: number;
  issuer: Issuer;
  token: `0x${string}`;
  side: 'BUY' | 'SELL';
  /** USD spent (buy) or received (sell) in this quote. */
  usd: Usd;
  /** Tokens received (buy) or sold (sell). */
  tokens: Tokens;
  /** Unit read on-chain at the quote block; null when it could not be read (never defaulted to 1). */
  unit: SharesPerToken | null;
  paused: boolean | null;
  route: RouteKind;
  /** Equity reference per share for this wrapper ticker; null when none exists (bStocks often have none). */
  referenceUsdPerShare: UsdPerShare | null;
  simulated: 'PASS' | 'FAIL' | 'NOT_RUN';
}

export interface BuyIntent {
  side: 'BUY';
  /** Owner tolerance: largest acceptable net premium over the reference, WAD fraction (0.005e18 = 0.5%). */
  maxNetPremium: bigint;
  minShares: Shares;
}

export interface SellIntent {
  side: 'SELL';
  /** Largest acceptable discount to the reference (positive WAD fraction). */
  maxNetDiscount: bigint;
  minUsdPerShare: UsdPerShare;
}

export type Intent = BuyIntent | SellIntent;

export type Decision =
  | { kind: 'FILL'; wrapperIdx: number; shares: Shares; usdPerShare: UsdPerShare; netVsReference: bigint | null; reasons: string[] }
  | { kind: 'WAIT'; reasons: RefusalReason[]; detail: string[] }
  | { kind: 'SKIP'; reasons: RefusalReason[]; detail: string[] };

export interface RankedQuote {
  quote: WrapperQuote;
  shares: Shares;
  usdPerShare: UsdPerShare;
  netVsReference: bigint | null;
  refusal: RefusalReason | null;
}

/** Evaluates one quote against the intent. Pure. T1: only share-denominated numbers are compared. */
export function evaluateQuote(q: WrapperQuote, intent: Intent, session: SessionRead): RankedQuote {
  const zeroShares = 0n as Shares;
  const zeroPx = 0n as UsdPerShare;
  if (q.unit === null) return { quote: q, shares: zeroShares, usdPerShare: zeroPx, netVsReference: null, refusal: 'API_DEGRADED' };
  if (q.paused === true || session.session === 'CORPORATE_ACTION') {
    return { quote: q, shares: zeroShares, usdPerShare: zeroPx, netVsReference: null, refusal: 'UNIT_PAUSED' };
  }
  if (q.paused === null) return { quote: q, shares: zeroShares, usdPerShare: zeroPx, netVsReference: null, refusal: 'API_DEGRADED' };
  if (q.route === 'RFQ') return { quote: q, shares: zeroShares, usdPerShare: zeroPx, netVsReference: null, refusal: 'NO_CONTRACT_ROUTE' };
  if (q.tokens === 0n) return { quote: q, shares: zeroShares, usdPerShare: zeroPx, netVsReference: null, refusal: 'BROKEN_QUOTE' };

  const shares = sharesFor(q.tokens, q.unit);
  const usdPerShare = effectiveUsdPerShare(q.usd, q.tokens, q.unit);
  const ref = q.referenceUsdPerShare;
  const net = ref ? mulDiv(usdPerShare, WAD, ref) - WAD : null;

  if (net !== null) {
    const abs = net < 0n ? -net : net;
    if (abs > BROKEN_QUOTE_THRESHOLD) return { quote: q, shares, usdPerShare, netVsReference: net, refusal: 'BROKEN_QUOTE' };
  }
  if (q.simulated === 'FAIL') return { quote: q, shares, usdPerShare, netVsReference: net, refusal: 'SIM_FAILED' };

  if (intent.side === 'BUY') {
    if (shares < intent.minShares) return { quote: q, shares, usdPerShare, netVsReference: net, refusal: 'PREMIUM_ABOVE_LIMIT' };
    if (net !== null && referenceIsLive(session) && net > intent.maxNetPremium) {
      return { quote: q, shares, usdPerShare, netVsReference: net, refusal: 'PREMIUM_ABOVE_LIMIT' };
    }
  } else {
    if (usdPerShare < intent.minUsdPerShare) return { quote: q, shares, usdPerShare, netVsReference: net, refusal: 'PREMIUM_ABOVE_LIMIT' };
    if (net !== null && referenceIsLive(session) && -net > intent.maxNetDiscount) {
      return { quote: q, shares, usdPerShare, netVsReference: net, refusal: 'PREMIUM_ABOVE_LIMIT' };
    }
  }
  return { quote: q, shares, usdPerShare, netVsReference: net, refusal: null };
}

/** Best acceptable quote first: buys maximise shares, sells maximise USD per share. Ties keep input order. */
export function rank(quotes: readonly WrapperQuote[], intent: Intent, session: SessionRead): RankedQuote[] {
  const evaluated = quotes.map((q) => evaluateQuote(q, intent, session));
  return evaluated
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const aOk = a.e.refusal === null ? 0 : 1;
      const bOk = b.e.refusal === null ? 0 : 1;
      if (aOk !== bOk) return aOk - bOk;
      const av = intent.side === 'BUY' ? a.e.shares : a.e.usdPerShare;
      const bv = intent.side === 'BUY' ? b.e.shares : b.e.usdPerShare;
      if (av !== bv) return av > bv ? -1 : 1;
      return a.i - b.i;
    })
    .map((x) => x.e);
}

/**
 * Policy: FILL the best acceptable wrapper, otherwise WAIT (transient reasons) or SKIP (nothing can ever fill).
 * `degraded` is true when the data feed failed as a whole: that is API_DEGRADED, not "no wrapper" (T12).
 */
export function decide(
  quotes: readonly WrapperQuote[],
  intent: Intent,
  session: SessionRead,
  degraded: boolean,
  check?: ReferenceCheck,
): Decision {
  if (degraded) return { kind: 'WAIT', reasons: ['API_DEGRADED'], detail: ['data feed unavailable'] };
  if (check) {
    const bad = referenceRefusal(check);
    if (bad) return { kind: 'WAIT', reasons: [bad.reason], detail: [bad.detail] };
  }
  if (quotes.length === 0) return { kind: 'SKIP', reasons: ['NO_CONTRACT_ROUTE'], detail: ['no wrapper has a contract route'] };
  const ranked = rank(quotes, intent, session);
  const best = ranked[0];
  if (best && best.refusal === null) {
    return {
      kind: 'FILL',
      wrapperIdx: best.quote.wrapperIdx,
      shares: best.shares,
      usdPerShare: best.usdPerShare,
      netVsReference: best.netVsReference,
      reasons: [`most shares among ${ranked.filter((r) => r.refusal === null).length} acceptable wrapper(s)`],
    };
  }
  const reasons = Array.from(new Set(ranked.map((r) => r.refusal).filter((r): r is RefusalReason => r !== null)));
  const detail = ranked.map((r) => `${r.quote.issuer}:${r.refusal ?? 'OK'}`);
  const permanent = reasons.length > 0 && reasons.every((r) => r === 'NO_CONTRACT_ROUTE');
  return { kind: permanent ? 'SKIP' : 'WAIT', reasons, detail };
}

/** Share-denominated limit a user signs, from plain words: pay at most `tolerance` over the reference. */
export function minSharesFor(usd: Usd, referenceUsdPerShare: UsdPerShare, tolerance: bigint): Shares {
  const maxPerShare = mulDiv(referenceUsdPerShare, WAD + tolerance, WAD);
  return mulDiv(usd, WAD, maxPerShare) as Shares;
}

export { tokensForShares, decompose };
export type { UsdPerToken };
