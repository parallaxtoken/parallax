import { createHash } from 'node:crypto';
import { encodeFunctionData, keccak256, type PublicClient, type WalletClient, type Account } from 'viem';
import {
  WAD,
  decide,
  readSession,
  sharesPerToken,
  shares,
  tokens,
  tokensForShares,
  usd,
  usdPerShare,
  wadFromDecimal,
  type Decision,
  type Intent,
  type RefusalReason,
  type SessionRead,
  type WrapperQuote,
} from '@parallax/kernel';
import { USDT, readUnit, registryIndex, wrappersFor, type WrapperRecord } from '@parallax/registry';
import type { PublicRwaClient, SignedClient } from '@parallax/binance';
import { independentReference, disagreementBps, DEFAULT_MAX_DISAGREE_BPS, type ReferenceResult } from '@parallax/independent';
import { bookAbi } from './abi';
import { aggregatorRoutes } from './aggregator';
import { directRoutes, type DirectRoute } from '@parallax/registry';
import type { Journal, JournalEntry } from './journal';
import type { Notifier } from './notify';
import { Stats } from './stats';

export interface OpenOrder {
  id: bigint;
  owner: `0x${string}`;
  side: 'BUY' | 'SELL';
  wrapperMask: number;
  deadline: bigint;
  tickerId: `0x${string}`;
  amount: bigint;
  limit: bigint;
}

export interface EngineDeps {
  chain: PublicClient;
  wallet: WalletClient | null;
  account: Account | null;
  book: `0x${string}`;
  rwa: PublicRwaClient;
  signed: SignedClient | null;
  /** WrapperRegistry address: aggregator routers are only used when the registry allowlists them. */
  registry?: `0x${string}`;
  journal: Journal;
  notifier: Notifier;
  stats: Stats;
  now?: () => number;
  /** Test seam: override route discovery. */
  routes?: typeof directRoutes;
  /** Independent equity reference (second opinion). Defaults to the public Yahoo chart then Nasdaq quote. */
  independent?: (ticker: string) => Promise<ReferenceResult>;
  /** Test seam: override the issuer-feed reference. */
  issuerReference?: (ticker: string) => Promise<ReturnType<typeof usdPerShare> | null>;
  /** Largest tolerated gap between the issuer feed and the independent source, bps. */
  referenceMaxBps?: number;
  /** Fail closed when the independent source is unavailable (default true). */
  referenceRequired?: boolean;
  /** Relay fills through the Transaction API broadcast endpoint (RPC remains the fallback). */
  broadcast?: boolean;
}

const TOLERANCE_DEFAULT = wadFromDecimal('0.05');
const hash = (data: string) => createHash('sha256').update(data).digest('hex');

export type Outcome =
  | { kind: 'FILLED'; txHash: string; sharesWad: bigint }
  | { kind: 'REVERTED'; txHash: string; reason: string }
  | { kind: 'WAIT' | 'SKIP'; reasons: RefusalReason[]; detail: string[] }
  | { kind: 'IN_FLIGHT' }
  | { kind: 'EXPIRED' };

export class Engine {
  private readonly now: () => number;
  private readonly routesFn: typeof directRoutes;
  /** last journaled WAIT/SKIP key per order: repeats are counted, not re-written (the journal stays readable) */
  private readonly lastWait = new Map<string, string>();

  constructor(private readonly d: EngineDeps) {
    this.now = d.now ?? (() => Date.now());
    this.routesFn = d.routes ?? directRoutes;
  }

  /** One pass over one order. Never throws on data problems: those are typed degraded outcomes. */
  async process(o: OpenOrder, tickerSymbol: string): Promise<Outcome> {
    const ts = new Date(this.now()).toISOString();
    const orderId = o.id.toString();
    if (Number(o.deadline) * 1000 < this.now()) {
      this.d.journal.append({ t: ts, orderId, status: 'SKIP', decision: 'EXPIRED', reasons: [] });
      await this.d.notifier.expired(o.owner, orderId);
      return { kind: 'EXPIRED' };
    }
    if (this.d.journal.hasInFlight(orderId)) return { kind: 'IN_FLIGHT' };

    const t0 = Date.now();
    const wrappers = wrappersFor(tickerSymbol).filter((w) => (o.wrapperMask & (1 << ['BSTOCKS', 'ONDO', 'XSTOCKS'].indexOf(w.issuer))) !== 0 && w.contractReceive !== 'REFUSED');

    const market = await this.d.rwa.marketStatus();
    const degraded = !market.ok && 'degraded' in market;
    const session: SessionRead = readSession(this.now(), market.ok ? {
      marketStatus: market.data.marketStatus, openState: market.data.openState, reasonCode: market.data.reasonCode, reasonMsg: market.data.reasonMsg, nextOpenTime: market.data.nextOpenTime,
    } : null);

    const issuerRef = this.d.issuerReference ? await this.d.issuerReference(tickerSymbol) : await this.referencePrice(tickerSymbol);
    const indep = await (this.d.independent ?? independentReference)(tickerSymbol);
    const independentWad = indep.ok ? usdPerShare(indep.usdPerShare) : null;
    // bStocks have no API reference: when the issuer feed is absent the independent source is the reference.
    const reference = issuerRef ?? independentWad;
    const check = {
      issuerReference: issuerRef, independentReference: independentWad,
      maxDisagreeBps: this.d.referenceMaxBps ?? DEFAULT_MAX_DISAGREE_BPS, required: this.d.referenceRequired ?? true,
    };
    const refBps = issuerRef !== null && independentWad !== null ? disagreementBps(issuerRef, independentWad) : null;
    this.d.stats.referenceCheck(refBps === null ? (independentWad === null ? 'unavailable' : 'single') : refBps > check.maxDisagreeBps ? 'disagree' : 'agree');
    const refInfo = {
      referenceSource: indep.ok ? indep.source : 'UNAVAILABLE',
      referenceIndependentWad: independentWad?.toString(), referenceIssuerWad: issuerRef?.toString(),
      referenceDisagreeBps: refBps ?? undefined,
    };
    const side = o.side;
    const intent: Intent = side === 'BUY'
      ? { side: 'BUY', maxNetPremium: TOLERANCE_DEFAULT, minShares: shares(o.limit) }
      : { side: 'SELL', maxNetDiscount: TOLERANCE_DEFAULT, minUsdPerShare: usdPerShare(o.limit) };

    const best = new Map<number, DirectRoute>();
    const quotes: WrapperQuote[] = [];
    for (const w of wrappers) {
      const idx = registryIndex(w);
      let unitRead;
      try {
        unitRead = await readUnit(this.d.chain, w);
      } catch {
        quotes.push(this.emptyQuote(w, idx, side, null, null, reference));
        continue;
      }
      const amountIn = side === 'BUY' ? o.amount : tokensForShares(shares(o.amount), unitRead.unit);
      const rreq = {
        tokenIn: side === 'BUY' ? USDT : w.token,
        tokenOut: side === 'BUY' ? w.token : USDT,
        amountIn,
        recipient: this.d.book,
        deadline: BigInt(Math.floor(this.now() / 1000) + 600),
      } as const;
      const direct = await this.routesFn(this.d.chain, rreq);
      const agg = this.d.signed && this.d.registry ? await aggregatorRoutes(this.d.signed, this.d.chain, this.d.registry, rreq).catch(() => []) : [];
      const routes = [...direct, ...agg].sort((a, b) => (a.amountOut < b.amountOut ? 1 : a.amountOut > b.amountOut ? -1 : 0));
      const top = routes[0];
      if (!top) {
        quotes.push({ ...this.emptyQuote(w, idx, side, unitRead.unit, unitRead.paused, reference), route: 'RFQ' });
        continue;
      }
      best.set(idx, top);
      quotes.push({
        wrapperIdx: idx, issuer: w.issuer, token: w.token, side,
        usd: usd(side === 'BUY' ? o.amount : top.amountOut),
        tokens: tokens(side === 'BUY' ? top.amountOut : amountIn),
        unit: unitRead.unit, paused: unitRead.paused, route: 'AMM',
        referenceUsdPerShare: reference, simulated: 'NOT_RUN',
      });
    }

    const decision: Decision = decide(quotes, intent, session, degraded && wrappers.length > 0 && quotes.every((q) => q.unit === null), check);
    const latencies = { decide: Date.now() - t0 };

    if (decision.kind !== 'FILL') {
      for (const r of decision.reasons) this.d.stats.refusal(r);
      const key = `${decision.kind}:${decision.reasons.join(',')}`;
      if (this.lastWait.get(orderId) !== key) {
        this.lastWait.set(orderId, key);
        this.d.journal.append({ t: ts, orderId, status: decision.kind, decision: decision.kind, reasons: decision.reasons, latenciesMs: latencies, ...refInfo });
        await this.d.notifier.refusal(o.owner, orderId, decision.reasons);
      }
      return { kind: decision.kind, reasons: decision.reasons, detail: decision.detail };
    }

    const route = best.get(decision.wrapperIdx);
    const w = wrappers.find((x) => registryIndex(x) === decision.wrapperIdx);
    if (!route || !w || !this.d.wallet || !this.d.account) {
      this.d.stats.refusal('API_DEGRADED');
      this.d.journal.append({ t: ts, orderId, status: 'REFUSED', decision: 'NO_SIGNER_OR_ROUTE', reasons: ['API_DEGRADED'], latenciesMs: latencies });
      return { kind: 'WAIT', reasons: ['API_DEGRADED'], detail: ['no signer or route'] };
    }

    const data = encodeFunctionData({ abi: bookAbi, functionName: 'fill', args: [o.id, BigInt(decision.wrapperIdx), route.router, route.data] });
    const base: JournalEntry = {
      t: ts, orderId, status: 'INTENT', decision: 'FILL', reasons: decision.reasons, wrapper: w.token, router: route.router, venue: route.venue,
      calldataHash: hash(data), sharesWad: decision.shares.toString(), latenciesMs: latencies, ...refInfo,
    };

    // T9: simulate before send. Intent is persisted first.
    this.d.journal.append(base);
    const sim = await this.simulate(o, decision.wrapperIdx, route, data);
    if (sim.result === 'FAIL') {
      this.d.stats.refusal('SIM_FAILED');
      this.d.journal.append({ ...base, t: new Date(this.now()).toISOString(), status: 'REFUSED', decision: 'SIM_FAILED', reasons: ['SIM_FAILED'], simSource: sim.source, simResult: 'FAIL', simError: sim.error });
      await this.d.notifier.refusal(o.owner, orderId, ['SIM_FAILED']);
      return { kind: 'WAIT', reasons: ['SIM_FAILED'], detail: [sim.error ?? 'simulation failed'] };
    }

    const t1 = Date.now();
    const gas = await this.gasFor(data);
    const { txHash, via } = await this.send(data, gas.used);
    const gasInfo = { gasSuggested: gas.suggested?.toString(), gasSimulated: gas.simulated?.toString(), gasLimitUsed: gas.used?.toString(), broadcastVia: via };
    this.d.journal.append({ ...base, ...gasInfo, t: new Date(this.now()).toISOString(), status: 'SENT', txHash, simSource: sim.source, simResult: 'PASS' });
    return this.observe(o, txHash, { ...base, ...gasInfo, simSource: sim.source, simResult: 'PASS' }, Date.now() - t1);
  }

  /** Waits for a hash to resolve. Used after sending and on restart for unresolved hashes. */
  async observe(o: Pick<OpenOrder, 'owner' | 'id'>, txHash: string, base: JournalEntry, sendMs = 0): Promise<Outcome> {
    const receipt = await this.d.chain.waitForTransactionReceipt({ hash: txHash as `0x${string}`, timeout: 180_000 });
    const ts = new Date(this.now()).toISOString();
    if (receipt.status === 'success') {
      this.d.stats.fill();
      this.d.journal.append({ ...base, t: ts, status: 'CONFIRMED', txHash, gasUsed: receipt.gasUsed.toString(), latenciesMs: { ...base.latenciesMs, send: sendMs } });
      await this.d.notifier.fill(o.owner, o.id.toString(), txHash, base.sharesWad ?? '0');
      return { kind: 'FILLED', txHash, sharesWad: BigInt(base.sharesWad ?? '0') };
    }
    this.d.stats.refusal('SIM_FAILED');
    this.d.journal.append({ ...base, t: ts, status: 'REVERTED', txHash, gasUsed: receipt.gasUsed.toString() });
    return { kind: 'REVERTED', txHash, reason: 'transaction reverted on-chain' };
  }

  /**
   * Gas for a fill: max(suggested by the Transaction API gas-limit endpoint, simulated by the node) x 1.25.
   * Both inputs are returned so the journal can log them; either may be null when its source is down.
   */
  private async gasFor(data: `0x${string}`): Promise<{ suggested: bigint | null; simulated: bigint | null; used: bigint | null }> {
    let suggested: bigint | null = null;
    let simulated: bigint | null = null;
    if (this.d.signed && this.d.account) {
      const r = await this.d.signed.gasLimit({ from: this.d.account.address, to: this.d.book, data }).catch(() => null);
      if (r && r.ok) suggested = BigInt(r.data.gasLimit);
    }
    if (this.d.account) {
      simulated = await this.d.chain.estimateGas({ account: this.d.account.address, to: this.d.book, data }).catch(() => null);
    }
    const base = [suggested, simulated].reduce<bigint>((m, v) => (v !== null && v > m ? v : m), 0n);
    return { suggested, simulated, used: base === 0n ? null : (base * 125n) / 100n };
  }

  /** Sign locally, then relay through the Transaction API broadcast endpoint; fall back to the RPC when it refuses. */
  private async send(data: `0x${string}`, gas: bigint | null): Promise<{ txHash: `0x${string}`; via: 'TRANSACTION_API' | 'RPC' }> {
    const wallet = this.d.wallet!;
    const account = this.d.account!;
    if (!this.d.signed || !this.d.broadcast) {
      const txHash = await wallet.sendTransaction({ account, chain: wallet.chain ?? null, to: this.d.book, data, ...(gas ? { gas } : {}) });
      return { txHash, via: 'RPC' };
    }
    const req = await wallet.prepareTransactionRequest({ account, chain: wallet.chain ?? null, to: this.d.book, data, ...(gas ? { gas } : {}) } as never);
    const raw = await wallet.signTransaction({ ...(req as object), account } as never);
    const txHash = keccak256(raw);
    const b = await this.d.signed.broadcast(account.address, raw).catch(() => null);
    if (b && b.ok) return { txHash: (b.data.txHash as `0x${string}`) ?? txHash, via: 'TRANSACTION_API' };
    try {
      await wallet.sendRawTransaction({ serializedTransaction: raw });
    } catch (e) {
      // "already known" means the API did relay it after all.
      if (!/already known|known transaction|nonce too low/i.test(e instanceof Error ? e.message : String(e))) throw e;
    }
    return { txHash, via: 'RPC' };
  }

  private emptyQuote(w: WrapperRecord, idx: number, side: 'BUY' | 'SELL', unit: WrapperQuote['unit'], paused: boolean | null, reference: ReturnType<typeof usdPerShare> | null): WrapperQuote {
    return { wrapperIdx: idx, issuer: w.issuer, token: w.token, side, usd: usd(0n), tokens: tokens(0n), unit, paused, route: 'AMM', referenceUsdPerShare: reference, simulated: 'NOT_RUN' };
  }

  /** The only non-derived reference the public API exposes: the Ondo equity feed (stockInfo.price). */
  private async referencePrice(ticker: string): Promise<ReturnType<typeof usdPerShare> | null> {
    const ondo = wrappersFor(ticker).find((w) => w.issuer === 'ONDO');
    if (!ondo) return null;
    const r = await this.d.rwa.dynamic(ondo.token);
    if (!r.ok || !r.data.stockPrice) return null;
    try {
      return usdPerShare(wadFromDecimal(r.data.stockPrice));
    } catch {
      return null;
    }
  }

  private async simulate(o: OpenOrder, idx: number, route: DirectRoute, data: `0x${string}`): Promise<{ result: 'PASS' | 'FAIL'; source: 'TRANSACTION_API' | 'ETH_CALL'; error?: string }> {
    if (this.d.signed && this.d.account) {
      const r = await this.d.signed.simulate({ from: this.d.account.address, to: this.d.book, data });
      if (r.ok) {
        const st = (r.data.status ?? '').toString().toUpperCase();
        return { result: st === 'FAIL' || st === 'FAILED' || st === 'REVERT' ? 'FAIL' : 'PASS', source: 'TRANSACTION_API', error: st === 'PASS' ? undefined : r.data.status ?? undefined };
      }
      // API down: fall through to eth_call, recorded as such
    }
    try {
      await this.d.chain.simulateContract({ address: this.d.book, abi: bookAbi, functionName: 'fill', args: [o.id, BigInt(idx), route.router, route.data], account: this.d.account ?? undefined });
      return { result: 'PASS', source: 'ETH_CALL' };
    } catch (e) {
      return { result: 'FAIL', source: 'ETH_CALL', error: e instanceof Error ? e.message.split('\n')[0] : String(e) };
    }
  }
}

export { sharesPerToken, WAD };
