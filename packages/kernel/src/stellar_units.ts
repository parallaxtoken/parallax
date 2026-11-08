import { WAD, mulDiv } from './units.js';

export const STROOP = 10n ** 7n; // 7 decimals for Stellar native USDC

/** Converts 7-decimal Stellar USDC stroops into 18-decimal WAD */
export function usdcStroopToWad(stroops: bigint): bigint {
  return stroops * 10n ** 11n;
}

/** Converts 18-decimal WAD into 7-decimal Stellar USDC stroops */
export function wadToUsdcStroop(wad: bigint): bigint {
  return wad / 10n ** 11n;
}

/** Computes real share equivalents for a Stellar Soroban fill */
export function computeStellarShares(tokensOut: bigint, unitWad: bigint): bigint {
  return mulDiv(tokensOut, unitWad, WAD);
}
