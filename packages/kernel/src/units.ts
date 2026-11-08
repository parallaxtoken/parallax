// Share-Equivalence Kernel: unit-safe fixed-point math. No I/O. T1 (unit normalisation) and T11 (closure).

export type WAD = bigint;
export const WAD = 10n ** 18n;

declare const brand: unique symbol;
export type UsdPerToken = WAD & { readonly [brand]: 'UsdPerToken' };
export type UsdPerShare = WAD & { readonly [brand]: 'UsdPerShare' };
export type SharesPerToken = WAD & { readonly [brand]: 'SharesPerToken' };
export type Shares = WAD & { readonly [brand]: 'Shares' };
export type Tokens = WAD & { readonly [brand]: 'Tokens' };
export type Usd = WAD & { readonly [brand]: 'Usd' };

export const usdPerToken = (v: bigint): UsdPerToken => v as UsdPerToken;
export const usdPerShare = (v: bigint): UsdPerShare => v as UsdPerShare;
export const sharesPerToken = (v: bigint): SharesPerToken => {
  if (v <= 0n) throw new RangeError('unit must be positive');
  return v as SharesPerToken;
};
export const shares = (v: bigint): Shares => v as Shares;
export const tokens = (v: bigint): Tokens => v as Tokens;
export const usd = (v: bigint): Usd => v as Usd;

/** Round-half-down division, floor for positives. */
export const mulDiv = (a: bigint, b: bigint, d: bigint): bigint => {
  if (d === 0n) throw new RangeError('division by zero');
  return (a * b) / d;
};
export const mulDivUp = (a: bigint, b: bigint, d: bigint): bigint => {
  if (d === 0n) throw new RangeError('division by zero');
  return (a * b + d - 1n) / d;
};

/** USD per share given USD per token and shares per token. */
export const toUsdPerShare = (p: UsdPerToken, u: SharesPerToken): UsdPerShare => mulDiv(p, WAD, u) as UsdPerShare;

/** Share-equivalents delivered for a token amount. Matches ParallaxBook: tokensOut * unit / 1e18. */
export const sharesFor = (tokensOut: Tokens, u: SharesPerToken): Shares => mulDiv(tokensOut, u, WAD) as Shares;

/** Tokens needed to deliver a share amount, rounded up like ParallaxBook sells. */
export const tokensForShares = (s: Shares, u: SharesPerToken): Tokens => mulDivUp(s, WAD, u) as Tokens;

/** USD per share you actually pay: usdIn spent for tokensOut at unit u. */
export const effectiveUsdPerShare = (usdIn: Usd, tokensOut: Tokens, u: SharesPerToken): UsdPerShare => {
  const s = sharesFor(tokensOut, u);
  if (s === 0n) throw new RangeError('zero shares');
  return mulDiv(usdIn, WAD, s) as UsdPerShare;
};

export interface Decomposition {
  /** (tokenPrice / reference) - 1, WAD, signed */
  gross: bigint;
  /** unit - 1, WAD, signed */
  unit: bigint;
  /** (usdPerShare / reference) - 1, WAD, signed */
  net: bigint;
  perShare: UsdPerShare;
}

/**
 * gross = tokenPrice / ref - 1 ; net = usdPerShare / ref - 1.
 * Identity (T11): (1 + gross) = unit * (1 + net), up to fixed-point rounding.
 */
export function decompose(p: UsdPerToken, ref: UsdPerShare, u: SharesPerToken): Decomposition {
  if (ref <= 0n) throw new RangeError('reference must be positive');
  const gross = mulDiv(p, WAD, ref) - WAD;
  const perShare = toUsdPerShare(p, u);
  const net = mulDiv(perShare, WAD, ref) - WAD;
  return { gross, unit: u - WAD, net, perShare };
}

/** Residual of the T11 identity in WAD. The kernel and the verifier require |residual| below tolerance. */
export function closureResidual(d: Decomposition, u: SharesPerToken): bigint {
  const lhs = WAD + d.gross;
  const rhs = mulDiv(u, WAD + d.net, WAD);
  return lhs - rhs;
}

/** Tolerance of the closure identity: one part in 1e9 expressed in WAD. */
export const CLOSURE_TOLERANCE: bigint = WAD / 10n ** 9n;

export function wadFromDecimal(s: string): WAD {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s.trim());
  if (!m) throw new SyntaxError(`not a decimal: ${s}`);
  const [, sign, whole, frac = ''] = m;
  const padded = (frac + '0'.repeat(18)).slice(0, 18);
  const v = BigInt(whole ?? '0') * WAD + BigInt(padded);
  return sign === '-' ? -v : v;
}

export function wadToNumber(v: bigint, places = 6): number {
  const scale = 10n ** BigInt(places);
  return Number((v * scale) / WAD) / Number(scale);
}

export function wadToDecimal(v: bigint, places = 6): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const whole = a / WAD;
  const frac = ((a % WAD) * 10n ** BigInt(places)) / WAD;
  return `${neg ? '-' : ''}${whole}.${frac.toString().padStart(places, '0')}`;
}

/** Basis points of a WAD ratio (signed). */
export const toBps = (ratio: bigint): number => Number((ratio * 10000n) / WAD);
