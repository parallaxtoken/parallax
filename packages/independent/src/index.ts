import { wadFromDecimal } from '@parallax/kernel';

/**
 * Independent equity reference: a second opinion that is neither the Binance API nor an issuer feed.
 * Sources are public, keyless HTTP JSON endpoints. Each answer carries its source, URL and timestamp so the UI,
 * the planner and the keeper can show exactly where a number came from. Nothing here is defaulted: a failure is a
 * typed ReferenceFail, never a made-up price.
 */
export type ReferenceSource = 'YAHOO_CHART' | 'NASDAQ_QUOTE';

export interface ReferenceOk {
  ok: true;
  ticker: string;
  source: ReferenceSource;
  sourceUrl: string;
  /** The price used as the second opinion, WAD-scaled USD per share. */
  usdPerShare: bigint;
  /** Timestamp of the price as the source states it (ISO when numeric, otherwise the source string). */
  asOf: string;
  /** Latest print including pre and post market where the source provides it. */
  intraday: { price: string; at: string } | null;
  /** Last completed regular-session close. */
  daily: { close: string; date: string; previousClose: string | null } | null;
  fetchedAt: string;
}
export interface ReferenceFail {
  ok: false;
  ticker: string;
  reason: 'UNREACHABLE' | 'MALFORMED' | 'NO_DATA';
  message: string;
  tried: ReferenceSource[];
}
export type ReferenceResult = ReferenceOk | ReferenceFail;

export interface ReferenceOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
}

const UA = 'Mozilla/5.0 (compatible; ParallaxReference/0.1; +https://github.com/warlock-netizen/parallax)';
const yahooSymbol = (t: string) => t.toUpperCase().replace(/\./g, '-');
const ETFS = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'TLT', 'GLD', 'SLV', 'IVV', 'ARKK', 'XLK', 'XLF', 'EEM']);

async function getJson(url: string, o: ReferenceOptions): Promise<unknown> {
  const f = o.fetchImpl ?? fetch;
  const r = await f(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(o.timeoutMs ?? 8000), cache: 'no-store' } as RequestInit);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const decimalOf = (n: number): string => {
  if (!Number.isFinite(n) || n <= 0) throw new Error('not a positive price');
  return n.toFixed(6);
};

type Bars = { timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } };
const lastBar = (b: Bars | undefined): { i: number; closes: (number | null)[] } | null => {
  const closes = b?.indicators?.quote?.[0]?.close ?? [];
  let k = closes.length - 1;
  while (k >= 0 && (closes[k] === null || closes[k] === undefined)) k--;
  return k >= 0 && b?.timestamp ? { i: k, closes } : null;
};

export function parseYahooChart(ticker: string, intraday: unknown, daily: unknown, fetchedAt: string): ReferenceOk {
  const iRes = (intraday as { chart?: { result?: Bars[] } })?.chart?.result?.[0];
  const ib = lastBar(iRes);
  if (!ib || !iRes?.timestamp) throw new Error('no intraday close');
  const price = ib.closes[ib.i] as number;
  const at = new Date(iRes.timestamp[ib.i]! * 1000).toISOString();
  let dailyOut: ReferenceOk['daily'] = null;
  const dRes = (daily as { chart?: { result?: Bars[] } } | null)?.chart?.result?.[0];
  const db = lastBar(dRes);
  if (db && dRes?.timestamp) {
    let p = db.i - 1;
    while (p >= 0 && (db.closes[p] === null || db.closes[p] === undefined)) p--;
    dailyOut = {
      close: decimalOf(db.closes[db.i] as number),
      date: new Date(dRes.timestamp[db.i]! * 1000).toISOString().slice(0, 10),
      previousClose: p >= 0 ? decimalOf(db.closes[p] as number) : null,
    };
  }
  return {
    ok: true, ticker, source: 'YAHOO_CHART',
    sourceUrl: `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol(ticker)}`,
    usdPerShare: wadFromDecimal(decimalOf(price)), asOf: at, intraday: { price: decimalOf(price), at }, daily: dailyOut, fetchedAt,
  };
}

export function parseNasdaqQuote(ticker: string, body: unknown, fetchedAt: string): ReferenceOk {
  const d = (body as { data?: { primaryData?: { lastSalePrice?: string; lastTradeTimestamp?: string } } })?.data?.primaryData;
  const m = /\$?\s*([0-9][0-9,]*\.?[0-9]*)/.exec(d?.lastSalePrice ?? '');
  if (!m) throw new Error('no last sale');
  const price = decimalOf(Number(m[1]!.replace(/,/g, '')));
  return {
    ok: true, ticker, source: 'NASDAQ_QUOTE', sourceUrl: `https://api.nasdaq.com/api/quote/${ticker.toUpperCase()}/info`,
    usdPerShare: wadFromDecimal(price), asOf: d?.lastTradeTimestamp ?? 'unstated', intraday: null, daily: null, fetchedAt,
  };
}

/** Yahoo chart first (intraday and daily bars), Nasdaq quote second. First source that answers wins; both failing is a typed failure. */
export async function independentReference(ticker: string, o: ReferenceOptions = {}): Promise<ReferenceResult> {
  const T = ticker.toUpperCase();
  const fetchedAt = new Date((o.now ?? Date.now)()).toISOString();
  const tried: ReferenceSource[] = [];
  const errs: string[] = [];
  try {
    tried.push('YAHOO_CHART');
    const base = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol(T)}`;
    const [i, d] = await Promise.all([
      getJson(`${base}?range=5d&interval=5m&includePrePost=true`, o),
      getJson(`${base}?range=1mo&interval=1d`, o).catch(() => null),
    ]);
    return parseYahooChart(T, i, d, fetchedAt);
  } catch (e) {
    errs.push(`yahoo: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    tried.push('NASDAQ_QUOTE');
    const cls = ETFS.has(T) ? 'etf' : 'stocks';
    const body = await getJson(`https://api.nasdaq.com/api/quote/${T}/info?assetclass=${cls}`, o);
    return parseNasdaqQuote(T, body, fetchedAt);
  } catch (e) {
    errs.push(`nasdaq: ${e instanceof Error ? e.message : String(e)}`);
  }
  const malformed = errs.some((x) => /no (intraday|last)|not a positive/.test(x));
  return { ok: false, ticker: T, reason: malformed ? 'MALFORMED' : 'UNREACHABLE', message: errs.join('; '), tried };
}

/** Absolute difference between two references in basis points of the independent one. */
export function disagreementBps(issuer: bigint, independent: bigint): number {
  if (independent === 0n) return Number.POSITIVE_INFINITY;
  const diff = issuer > independent ? issuer - independent : independent - issuer;
  return Number((diff * 10_000n) / independent);
}

export interface ReferenceVerdict {
  status: 'AGREE' | 'DISAGREE' | 'SINGLE_SOURCE' | 'UNAVAILABLE';
  disagreeBps: number | null;
  maxBps: number;
  /** Which source sets the floor for this read. */
  floorSource: 'ISSUER_FEED' | 'INDEPENDENT' | 'NONE';
}

/**
 * Fail-closed rule. Both present: they must agree within maxBps. Only the independent source: it sets the floor
 * (the bStocks case, which have no API reference). Only the issuer feed: allowed as a single source only when
 * `required` is false, otherwise UNAVAILABLE. Neither: nothing sets a floor.
 */
export function verdict(issuer: bigint | null, independent: bigint | null, maxBps: number, required: boolean): ReferenceVerdict {
  if (issuer !== null && independent !== null) {
    const b = disagreementBps(issuer, independent);
    return b > maxBps
      ? { status: 'DISAGREE', disagreeBps: b, maxBps, floorSource: 'NONE' }
      : { status: 'AGREE', disagreeBps: b, maxBps, floorSource: 'ISSUER_FEED' };
  }
  if (independent !== null) return { status: 'SINGLE_SOURCE', disagreeBps: null, maxBps, floorSource: 'INDEPENDENT' };
  if (issuer !== null) {
    return required
      ? { status: 'UNAVAILABLE', disagreeBps: null, maxBps, floorSource: 'NONE' }
      : { status: 'SINGLE_SOURCE', disagreeBps: null, maxBps, floorSource: 'ISSUER_FEED' };
  }
  return { status: 'UNAVAILABLE', disagreeBps: null, maxBps, floorSource: 'NONE' };
}

export const DEFAULT_MAX_DISAGREE_BPS = 200;
