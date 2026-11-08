import 'server-only';
import { encodeFunctionData, parseAbi, type Address } from 'viem';
import {
  USDT,
  PANCAKE,
  directRoutes,
  tickerIdOf,
  wrappersFor,
  v3RouterAbi,
  type WrapperRecord,
} from '@parallax/registry';
import {
  WAD,
  decompose,
  minSharesFor,
  shares,
  sharesFor,
  sharesPerToken,
  tokens,
  tokensForShares,
  usd,
  usdPerShare,
  usdPerToken,
  wadFromDecimal,
  wadToDecimal,
} from '@parallax/kernel';
import { chain, getShelf, REFERENCE_REQUIRED, type IndependentView } from './shelf';

export const BOOK = (process.env.NEXT_PUBLIC_PARALLAXBOOK || '') as Address | '';

const erc20Abi = parseAbi(['function approve(address,uint256) returns (bool)']);
const bookAbi = parseAbi([
  'function placeBuy(bytes32 tickerId, uint128 payAmount, uint128 minShares, uint64 deadline, uint32 wrapperMask) returns (uint256)',
  'function placeSell(bytes32 tickerId, uint128 shares, uint128 minUsdtPerShare, uint64 deadline, uint32 wrapperMask) returns (uint256)',
  'function cancel(uint256 id)',
]);

export type PlanRequest =
  | { intent: 'instant-buy'; ticker: string; usd: string; owner: Address; toleranceBps?: number; issuers?: WrapperRecord['issuer'][] }
  | { intent: 'standing-buy'; ticker: string; usd: string; owner: Address; toleranceBps?: number; deadlineHours?: number; issuers?: WrapperRecord['issuer'][] }
  | { intent: 'standing-sell'; ticker: string; shares: string; floorUsdPerShare: string; owner: Address; deadlineHours?: number; issuers?: WrapperRecord['issuer'][] }
  | { intent: 'cancel'; orderId: string };

export interface PlannedCall {
  label: string;
  to: Address;
  data: `0x${string}`;
  value: '0';
  /** decoded call, shown to the user before signing */
  decoded: string;
}

export interface Plan {
  ok: true;
  intent: PlanRequest['intent'];
  calls: PlannedCall[];
  why: string[];
  wrapper: { symbol: string; issuer: string; token: Address; registryIndex: number } | null;
  decomposition: null | { grossBps: number; unitBps: number; netBps: number | null; unit: string; usdPerShare: string; referenceUsdPerShare: string | null };
  minShares: string | null;
  session: { session: string; referenceAgeSec: number; referenceNote: string };
  /** Independent second opinion on the equity reference, with the source that set the floor. */
  reference: null | { status: IndependentView['verdict']['status']; floorSource: IndependentView['verdict']['floorSource']; independentSource: string | null; independentUsdPerShare: string | null; independentAsOf: string | null; disagreeBps: number | null; maxBps: number };
}

export type PlanError = { ok: false; code: 'BAD_REQUEST' | 'BOOK_NOT_DEPLOYED' | 'NO_WRAPPER' | 'DEGRADED' | 'NO_REFERENCE' | 'REFERENCE_DISAGREE'; message: string };

const MASK: Record<WrapperRecord['issuer'], number> = { BSTOCKS: 1, ONDO: 2, XSTOCKS: 4 };
const maskOf = (issuers?: WrapperRecord['issuer'][]) => (issuers && issuers.length ? issuers.reduce((m, i) => m | MASK[i], 0) : 7);
const bps = (n: number) => BigInt(Math.max(0, Math.min(10_000, Math.round(n)))) * (WAD / 10_000n);

function validAddr(a: string): a is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(a);
}

const refOf = (ind: IndependentView): NonNullable<Plan['reference']> => ({
  status: ind.verdict.status, floorSource: ind.verdict.floorSource, independentSource: ind.source, independentUsdPerShare: ind.usdPerShare,
  independentAsOf: ind.intraday?.at ?? ind.asOf, disagreeBps: ind.verdict.disagreeBps, maxBps: ind.verdict.maxBps,
});

/** Fail closed: a disagreeing or (when required) missing second opinion stops the plan before any call is built. */
function referenceGate(ind: IndependentView, note: string): PlanError | null {
  if (ind.verdict.status === 'DISAGREE') return { ok: false, code: 'REFERENCE_DISAGREE', message: note };
  if (ind.verdict.status === 'UNAVAILABLE' && REFERENCE_REQUIRED) return { ok: false, code: 'DEGRADED', message: 'The independent equity reference could not be read, so Parallax will not plan an order right now.' };
}

export async function buildPlan(req: PlanRequest): Promise<Plan | PlanError> {
  if (req.intent === 'cancel') {
    if (!BOOK) return { ok: false, code: 'BOOK_NOT_DEPLOYED', message: 'ParallaxBook is not deployed yet.' };
    if (!/^\d+$/.test(req.orderId)) return { ok: false, code: 'BAD_REQUEST', message: 'orderId must be an integer' };
    return {
      ok: true, intent: 'cancel', why: ['Cancelling releases nothing because nothing was ever held: your funds stayed in your wallet.'],
      calls: [{ label: 'Cancel order', to: BOOK, value: '0', data: encodeFunctionData({ abi: bookAbi, functionName: 'cancel', args: [BigInt(req.orderId)] }), decoded: `ParallaxBook.cancel(${req.orderId})` }],
      wrapper: null, decomposition: null, minShares: null, session: { session: 'n/a', referenceAgeSec: 0, referenceNote: '' }, reference: null,
    };
  }
  if (!validAddr(req.owner)) return { ok: false, code: 'BAD_REQUEST', message: 'owner must be an address' };
  const ticker = req.ticker.toUpperCase();
  if (wrappersFor(ticker).length === 0) return { ok: false, code: 'NO_WRAPPER', message: `Unknown ticker ${ticker}` };

  if (req.intent === 'standing-sell') {
    if (!BOOK) return { ok: false, code: 'BOOK_NOT_DEPLOYED', message: 'ParallaxBook is not deployed yet.' };
    let sh: bigint, floor: bigint;
    try {
      sh = wadFromDecimal(req.shares);
      floor = wadFromDecimal(req.floorUsdPerShare);
    } catch {
      return { ok: false, code: 'BAD_REQUEST', message: 'shares and floorUsdPerShare must be decimals' };
    }
    const shelf = await getShelf(ticker);
    if (!shelf) return { ok: false, code: 'NO_WRAPPER', message: 'no shelf' };
    const gateSell = referenceGate(shelf.independent, shelf.referenceNote);
    if (gateSell) return gateSell;
    const mask = maskOf(req.issuers);
    const candidates = shelf.wrappers.filter((w) => w.unitWad && (mask & MASK[w.issuer]) !== 0 && w.contractReceive !== 'REFUSED');
    const pick = candidates.sort((a, b) => b.registryIndex - a.registryIndex)[0] ?? candidates[0];
    if (!pick) return { ok: false, code: 'NO_WRAPPER', message: 'no wrapper can take a contract-filled sell' };
    const unit = BigInt(pick.unitWad as string);
    const tokensIn = tokensForShares(shares(sh), sharesPerToken(unit));
    const deadline = BigInt(Math.floor(Date.now() / 1000) + Math.round((req.deadlineHours ?? 24 * 7) * 3600));
    return {
      ok: true, intent: 'standing-sell',
      why: [
        `Sells ${wadToDecimal(sh, 4)} ${ticker} shares only if each share fetches at least ${wadToDecimal(floor, 2)} USDT, enforced on-chain.`,
        'The wrapper tokens are pulled from your wallet only at fill time. Approve the maximum you are willing to sell.',
      ],
      calls: [
        { label: `Approve ${pick.symbol}`, to: pick.token, value: '0', data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [BOOK, tokensIn] }), decoded: `${pick.symbol}.approve(ParallaxBook, ${wadToDecimal(tokensIn, 6)})` },
        { label: 'Place standing sell', to: BOOK, value: '0', data: encodeFunctionData({ abi: bookAbi, functionName: 'placeSell', args: [tickerIdOf(ticker), sh, floor, deadline, mask] }), decoded: `ParallaxBook.placeSell(${ticker}, ${wadToDecimal(sh, 4)} shares, floor ${wadToDecimal(floor, 2)} USDT per share, mask ${mask})` },
      ],
      wrapper: { symbol: pick.symbol, issuer: pick.issuer, token: pick.token, registryIndex: pick.registryIndex },
      decomposition: null, minShares: null,
      session: { session: shelf.session.session, referenceAgeSec: shelf.session.referenceAgeSec, referenceNote: shelf.referenceNote },
      reference: refOf(shelf.independent),
    };
  }

  // buys
  let usdWad: bigint;
  try {
    usdWad = wadFromDecimal(req.usd);
  } catch {
    return { ok: false, code: 'BAD_REQUEST', message: 'usd must be a decimal' };
  }
  if (usdWad <= 0n) return { ok: false, code: 'BAD_REQUEST', message: 'usd must be positive' };
  const shelf = await getShelf(ticker, Number(wadToDecimal(usdWad, 2)) || 50);
  if (!shelf) return { ok: false, code: 'NO_WRAPPER', message: 'no shelf' };
  if (shelf.degraded && shelf.wrappers.every((w) => !w.quote)) return { ok: false, code: 'DEGRADED', message: `Data source degraded: ${shelf.degraded.kind}` };
  const gateBuy = referenceGate(shelf.independent, shelf.referenceNote);
  if (gateBuy) return gateBuy;

  const mask = maskOf(req.issuers);
  const eligible = shelf.wrappers.filter((w) => w.quote && !w.quote.brokenQuote && w.unitPaused === false && (mask & MASK[w.issuer]) !== 0);
  if (req.intent === 'standing-buy' && !BOOK) return { ok: false, code: 'BOOK_NOT_DEPLOYED', message: 'ParallaxBook is not deployed yet.' };
  const pickable = req.intent === 'standing-buy' ? eligible.filter((w) => w.contractReceive !== 'REFUSED') : eligible;
  const best = pickable.sort((a, b) => (BigInt(b.quote!.sharesWad) > BigInt(a.quote!.sharesWad) ? 1 : -1))[0];
  if (!best || !best.quote) return { ok: false, code: 'NO_WRAPPER', message: 'No wrapper has a usable route right now.' };

  const unit = sharesPerToken(BigInt(best.unitWad as string));
  const tol = bps(req.toleranceBps ?? 50);
  const ref = shelf.referenceUsdPerShare ? usdPerShare(BigInt(shelf.referenceUsdPerShare)) : null;
  const quoted = shares(BigInt(best.quote.sharesWad));
  // The floor: plain-words tolerance over the live reference when the reference is live, otherwise the quoted
  // shares less the tolerance. Never defaults to a stale reference (T10).
  const fromQuote = (quoted * (WAD - tol)) / WAD;
  const fromRef = ref ? minSharesFor(usd(usdWad), ref, tol) : null;
  const minShares = shares(fromRef !== null && shelf.session.referenceAgeSec === 0 ? fromRef : fromQuote);
  const dec = ref ? decompose(usdPerToken(BigInt(best.quote.usdPerShare) * unit / WAD), ref, unit) : null;

  const why = [
    `${best.symbol} (${best.issuer}) delivers the most shares for $${wadToDecimal(usdWad, 2)}: ${wadToDecimal(quoted, 4)} ${ticker}.`,
    `Unit read on-chain: ${wadToDecimal(unit, 6)} shares per token. Compared across wrappers in shares, not token price.`,
    shelf.referenceNote,
  ];
  const calls: PlannedCall[] = [];
  const route = (await directRoutes(chain, { tokenIn: USDT, tokenOut: best.token, amountIn: usdWad, recipient: req.owner, deadline: BigInt(Math.floor(Date.now() / 1000) + 600) }))[0];

  if (req.intent === 'instant-buy') {
    if (!route) return { ok: false, code: 'NO_WRAPPER', message: 'No direct route for an instant buy.' };
    const minTokens = tokensForShares(minShares, unit);
    const swapData = encodeFunctionData({
      abi: v3RouterAbi, functionName: 'exactInputSingle',
      args: [{ tokenIn: USDT, tokenOut: best.token, fee: Number(route.venue.replace('PANCAKE_V3_', '')) || 500, recipient: req.owner, amountIn: usdWad, amountOutMinimum: minTokens, sqrtPriceLimitX96: 0n }],
    });
    const isV3 = route.venue.startsWith('PANCAKE_V3_');
    if (!isV3) return { ok: false, code: 'NO_WRAPPER', message: 'Best route is a v2 pool; use a standing order for it.' };
    calls.push(
      { label: 'Approve USDT', to: USDT, value: '0', data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [PANCAKE.V3_ROUTER, usdWad] }), decoded: `USDT.approve(PancakeSwap router, $${wadToDecimal(usdWad, 2)})` },
      { label: `Buy ${best.symbol}`, to: PANCAKE.V3_ROUTER, value: '0', data: swapData, decoded: `exactInputSingle: $${wadToDecimal(usdWad, 2)} USDT for at least ${wadToDecimal(minTokens, 6)} ${best.symbol} (${wadToDecimal(minShares, 4)} shares)` },
    );
  } else {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + Math.round((req.deadlineHours ?? 24 * 7) * 3600));
    calls.push(
      { label: 'Approve USDT', to: USDT, value: '0', data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [BOOK as Address, usdWad] }), decoded: `USDT.approve(ParallaxBook, $${wadToDecimal(usdWad, 2)})` },
      { label: 'Place standing buy', to: BOOK as Address, value: '0', data: encodeFunctionData({ abi: bookAbi, functionName: 'placeBuy', args: [tickerIdOf(ticker), usdWad, minShares, deadline, mask] }), decoded: `ParallaxBook.placeBuy(${ticker}, $${wadToDecimal(usdWad, 2)}, at least ${wadToDecimal(minShares, 4)} shares, mask ${mask})` },
    );
    why.push('Your USDT stays in your wallet until the fill transaction. The chain refuses any fill below the share floor you sign.');
  }

  return {
    ok: true, intent: req.intent, calls, why,
    wrapper: { symbol: best.symbol, issuer: best.issuer, token: best.token, registryIndex: best.registryIndex },
    decomposition: dec && ref ? {
      grossBps: Number((dec.gross * 10000n) / WAD), unitBps: Number((dec.unit * 10000n) / WAD), netBps: Number((dec.net * 10000n) / WAD),
      unit: unit.toString(), usdPerShare: dec.perShare.toString(), referenceUsdPerShare: ref.toString(),
    } : null,
    minShares: minShares.toString(),
    session: { session: shelf.session.session, referenceAgeSec: shelf.session.referenceAgeSec, referenceNote: shelf.referenceNote },
    reference: refOf(shelf.independent),
  };
}

export { sharesFor, tokens };
