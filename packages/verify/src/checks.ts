import { WAD, CLOSURE_TOLERANCE, decompose, closureResidual, sharesPerToken, usdPerShare, usdPerToken } from '@parallax/kernel';

export type InvariantId = 'T1' | 'T2' | 'T2b' | 'T3' | 'T5' | 'T6' | 'T7' | 'T8' | 'T11';

export interface CheckResult {
  id: InvariantId;
  name: string;
  status: 'PASS' | 'FAIL' | 'NOT_APPLICABLE' | 'UNKNOWN';
  detail: string;
}

/** Everything the verifier needs, gathered from logs and eth_call at the fill block. No vendor API, no model. */
export interface FillEvidence {
  orderId: bigint;
  side: 'BUY' | 'SELL';
  owner: `0x${string}`;
  limit: bigint; // BUY: minShares WAD; SELL: min USD per share WAD
  amount: bigint; // BUY: USDT in; SELL: shares WAD
  wrapper: `0x${string}`;
  wrapperAllowedByRegistry: boolean;
  routerAllowedByRegistry: boolean;
  /** OrderFilled event args */
  event: { tokenAmount: bigint; unitWad: bigint; shares: bigint; usdt: bigint; router: `0x${string}`; filler: `0x${string}` };
  /** unit read by eth_call at the fill block */
  unitAtBlock: bigint | null;
  /** Transfer logs in the fill transaction */
  transfersToOwner: { token: `0x${string}`; value: bigint }[];
  transfersToFiller: { token: `0x${string}`; value: bigint }[];
  bookBalancesAfter: { usdt: bigint; token: bigint };
  fillEventCount: number;
}

const r = (id: InvariantId, name: string, status: CheckResult['status'], detail: string): CheckResult => ({ id, name, status, detail });

export function verifyFill(e: FillEvidence): CheckResult[] {
  const out: CheckResult[] = [];

  // T3: the unit used in the event equals the unit readable at that block
  if (e.unitAtBlock === null) out.push(r('T3', 'Live unit', 'UNKNOWN', 'unit at the fill block could not be read (non-archive RPC)'));
  else out.push(r('T3', 'Live unit', e.unitAtBlock === e.event.unitWad ? 'PASS' : 'FAIL', `event ${e.event.unitWad} vs eth_call@block ${e.unitAtBlock}`));

  // T1 / recomputation: shares = tokens x unit
  const recomputed = (e.event.tokenAmount * e.event.unitWad) / WAD;
  out.push(r('T1', 'Unit normalisation', recomputed === e.event.shares ? 'PASS' : 'FAIL', `tokens ${e.event.tokenAmount} x unit ${e.event.unitWad} / 1e18 = ${recomputed}, event ${e.event.shares}`));

  if (e.side === 'BUY') {
    out.push(r('T2', 'Share floor', e.event.shares >= e.limit ? 'PASS' : 'FAIL', `delivered ${e.event.shares} >= floor ${e.limit}`));
    out.push(r('T2b', 'Sell floor', 'NOT_APPLICABLE', 'buy order'));
  } else {
    const perShare = e.event.shares === 0n ? 0n : (e.event.usdt * WAD) / e.event.shares;
    const minUsdt = (e.amount * e.limit) / WAD;
    out.push(r('T2', 'Share floor', 'NOT_APPLICABLE', 'sell order'));
    out.push(r('T2b', 'Sell floor', e.event.usdt >= minUsdt ? 'PASS' : 'FAIL', `received ${e.event.usdt} >= ${minUsdt} (${perShare} per share)`));
  }

  out.push(r('T5', 'Allowlist', e.wrapperAllowedByRegistry && e.routerAllowedByRegistry ? 'PASS' : 'FAIL', `wrapper ${e.wrapperAllowedByRegistry}, router ${e.routerAllowedByRegistry}`));

  const toOwner = e.transfersToOwner.filter((t) => t.token.toLowerCase() === (e.side === 'BUY' ? e.wrapper : '').toLowerCase());
  const received = toOwner.reduce((a, t) => a + t.value, 0n);
  if (e.side === 'BUY') out.push(r('T7', 'Recipient lock', received === e.event.tokenAmount ? 'PASS' : 'FAIL', `owner received ${received} of ${e.event.tokenAmount}`));
  else out.push(r('T7', 'Recipient lock', e.transfersToOwner.some((t) => t.value === e.event.usdt) ? 'PASS' : 'FAIL', `owner received ${e.event.usdt} USDT`));

  out.push(r('T6', 'No custody residue', e.bookBalancesAfter.usdt === 0n && e.bookBalancesAfter.token === 0n ? 'PASS' : 'FAIL', `book holds usdt ${e.bookBalancesAfter.usdt}, token ${e.bookBalancesAfter.token}`));
  out.push(r('T8', 'Exactly once', e.fillEventCount === 1 ? 'PASS' : 'FAIL', `${e.fillEventCount} OrderFilled event(s) for order ${e.orderId}`));
  return out;
}

export interface QuoteSnapshot {
  ticker: string;
  token: string;
  tokenPriceUsd: string;
  referenceUsdPerShare: string;
  unitWad: string;
  grossBps?: number;
}

/** T11 for a stored quote: (1 + gross) = unit x (1 + net). */
export function verifyQuote(q: QuoteSnapshot): CheckResult[] {
  const wad = (s: string): bigint => {
    const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
    if (!m) throw new SyntaxError(`bad decimal ${s}`);
    return BigInt(m[1] ?? '0') * WAD + BigInt(((m[2] ?? '') + '0'.repeat(18)).slice(0, 18));
  };
  const u = sharesPerToken(BigInt(q.unitWad));
  const d = decompose(usdPerToken(wad(q.tokenPriceUsd)), usdPerShare(wad(q.referenceUsdPerShare)), u);
  const resid = closureResidual(d, u);
  const abs = resid < 0n ? -resid : resid;
  const bound = (CLOSURE_TOLERANCE * (WAD + (d.gross < 0n ? -d.gross : d.gross))) / WAD + 2n * u;
  return [r('T11', 'Decomposition closure', abs <= bound ? 'PASS' : 'FAIL', `residual ${resid} within ${bound}`)];
}
