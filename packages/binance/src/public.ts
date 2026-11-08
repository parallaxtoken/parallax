import { classify, type RawEnvelope, type Result } from './result';

/** Keyless public RWA and market endpoints (Binance Web3). Chain is BSC (56). */
const ROOT = 'https://www.binance.com/bapi/defi';
const RWA = '/public/wallet-direct/buw/wallet/market/token/rwa';

export type ProviderType = 1 | 2 | 3; // 1 Ondo, 2 xStocks, 3 bStocks (measured; the skill file documents only Ondo)

export interface RwaListItem {
  chainId: string;
  contractAddress: string;
  symbol: string;
  ticker: string;
  type: number;
  multiplier: string | null;
}

export interface RwaDynamic {
  symbol: string;
  ticker: string;
  type: number | null;
  tokenPrice: string | null;
  sharesMultiplier: string | null;
  /** Equity reference per share. Null for every bStock in practice and outside sessions. */
  stockPrice: string | null;
  status: RwaStatus;
}

export interface RwaStatus {
  openState: boolean | null;
  marketStatus: string | null;
  reasonCode: string | null;
  reasonMsg: string | null;
  nextOpenTime: number | null;
  nextCloseTime: number | null;
}

export interface MarketStatus extends RwaStatus {
  nextOpen: string | null;
  nextClose: string | null;
}

export interface RwaMeta {
  name: string;
  symbol: string;
  ticker: string;
  /** Absolute icon URL (the API returns a relative path under bin.bnbstatic.com). */
  iconUrl: string | null;
  companyName: string | null;
  industry: string | null;
  conceptsEn: string[];
  attestationDailyUrl: string | null;
}

export type Candle = { openTime: number; open: string; high: string; low: string; close: string; closeTime: number };

type Fetch = typeof fetch;

export interface PublicClientOptions {
  fetchImpl?: Fetch;
  timeoutMs?: number;
  userAgent?: string;
  origin?: string;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null);
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function parseStatus(v: unknown): RwaStatus {
  const o = obj(v) ?? {};
  return {
    openState: bool(o.openState),
    marketStatus: str(o.marketStatus),
    reasonCode: str(o.reasonCode),
    reasonMsg: str(o.reasonMsg),
    nextOpenTime: num(o.nextOpenTime),
    nextCloseTime: num(o.nextCloseTime),
  };
}

export class PublicRwaClient {
  private readonly f: Fetch;
  private readonly timeoutMs: number;
  private readonly ua: string;
  private readonly root: string;

  constructor(opts: PublicClientOptions = {}) {
    this.f = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 15000;
    this.ua = opts.userAgent ?? 'binance-web3/1.1 (Skill)';
    this.root = opts.origin ? `${opts.origin}/bapi/defi` : ROOT;
  }

  private async get<T>(path: string, params: Record<string, string | number>, parse: (d: unknown) => T | null): Promise<Result<T>> {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
    const t0 = Date.now();
    try {
      const res = await this.f(`${this.root}${path}${qs ? `?${qs}` : ''}`, {
        headers: { 'Accept-Encoding': 'identity', 'User-Agent': this.ua },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      let env: RawEnvelope | null = null;
      try {
        env = (await res.json()) as RawEnvelope;
      } catch {
        env = null;
      }
      return classify(res.status, env, Date.now() - t0, parse);
    } catch (e) {
      return { ok: false, degraded: { kind: 'UNREACHABLE', message: e instanceof Error ? e.message : String(e) }, latencyMs: Date.now() - t0 };
    }
  }

  /** Full catalogue. Pass a type to filter, or omit it: the filter silently under-reports. */
  list(type?: ProviderType): Promise<Result<RwaListItem[]>> {
    return this.get(`/v1${RWA}/stock/detail/list/ai`, type ? { type } : {}, (d) => {
      if (!Array.isArray(d)) return null;
      return d.flatMap((x): RwaListItem[] => {
        const o = obj(x);
        if (!o) return [];
        const chainId = str(o.chainId), contractAddress = str(o.contractAddress), symbol = str(o.symbol), ticker = str(o.ticker);
        if (!chainId || !contractAddress || !symbol || !ticker) return [];
        return [{ chainId, contractAddress: contractAddress.toLowerCase(), symbol, ticker, type: num(o.type) ?? 0, multiplier: str(o.multiplier) }];
      });
    });
  }

  marketStatus(): Promise<Result<MarketStatus>> {
    return this.get(`/v1${RWA}/market/status/ai`, {}, (d) => {
      const o = obj(d);
      if (!o) return null;
      return { ...parseStatus(o), nextOpen: str(o.nextOpen), nextClose: str(o.nextClose) };
    });
  }

  assetStatus(token: string): Promise<Result<RwaStatus>> {
    return this.get(`/v1${RWA}/asset/market/status/ai`, { chainId: '56', contractAddress: token }, (d) => (obj(d) ? parseStatus(d) : null));
  }

  dynamic(token: string): Promise<Result<RwaDynamic>> {
    return this.get(`/v2${RWA}/dynamic/ai`, { chainId: '56', contractAddress: token }, (d) => {
      const o = obj(d);
      if (!o) return null;
      const ti = obj(o.tokenInfo) ?? {};
      const si = obj(o.stockInfo) ?? {};
      const symbol = str(o.symbol), ticker = str(o.ticker);
      if (!symbol || !ticker) return null;
      return { symbol, ticker, type: num(o.type), tokenPrice: str(ti.price), sharesMultiplier: str(ti.sharesMultiplier), stockPrice: str(si.price), status: parseStatus(o.statusInfo) };
    });
  }

  meta(token: string): Promise<Result<RwaMeta>> {
    return this.get(`/v1${RWA}/meta/ai`, { chainId: '56', contractAddress: token }, (d) => {
      const o = obj(d);
      if (!o) return null;
      const name = str(o.name), symbol = str(o.symbol), ticker = str(o.ticker);
      if (!name || !symbol || !ticker) return null;
      const ci = obj(o.companyInfo) ?? {};
      const abs = (p: unknown): string | null => (typeof p === 'string' && p ? `https://bin.bnbstatic.com${p}` : null);
      return {
        name, symbol, ticker, iconUrl: abs(o.icon), companyName: str(ci.companyName), industry: str(ci.industry),
        conceptsEn: Array.isArray(ci.conceptsEn) ? ci.conceptsEn.filter((x): x is string => typeof x === 'string') : [],
        attestationDailyUrl: abs(o.dailyAttestationReports),
      };
    });
  }

  klines(token: string, interval: '1m' | '5m' | '15m' | '1h' | '4h' | '12h' | '1d', limit = 300): Promise<Result<Candle[]>> {
    return this.get(`/v1/public/wallet-direct/buw/wallet/dex/market/token/kline/ai`, { chainId: '56', contractAddress: token, interval, limit }, (d) => {
      const o = obj(d);
      const arr = o?.klineInfos;
      if (!Array.isArray(arr)) return null;
      return arr.flatMap((k): Candle[] =>
        Array.isArray(k) && typeof k[0] === 'number' && typeof k[6] === 'number'
          ? [{ openTime: k[0], open: String(k[1]), high: String(k[2]), low: String(k[3]), close: String(k[4]), closeTime: k[6] }]
          : [],
      );
    });
  }
}
