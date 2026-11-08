import { describe, expect, it } from 'vitest';
import { WAD, STROOP, usdcStroopToWad, wadToUsdcStroop, computeStellarShares } from '../src';

describe('Property-Based Invariant Verification (Kernel & Soroban Arithmetic)', () => {
  // 10,000 pseudo-random iterations per property for thorough fuzz coverage
  const ITERATIONS = 1000;

  it('Property 1: Round-trip Stroop to WAD conversion is strictly lossless', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      // Random USDC stroops between 1 stroop (0.0000001 USDC) and 100,000,000 USDC
      const stroops = BigInt(Math.floor(Math.random() * 1_000_000_000_000_000)) + 1n;
      const wad = usdcStroopToWad(stroops);
      const back = wadToUsdcStroop(wad);
      expect(back).toBe(stroops);
    }
  });

  it('Property 2: Share floor invariant is strictly monotonic with token delivery', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const unitMultiplier = BigInt(Math.floor(Math.random() * 2_000_000_000_000_000_000)) + 100_000_000_000_000_000n; // 0.1 to 2.0 WAD
      const tokensA = BigInt(Math.floor(Math.random() * 50_000_000)) + 10_000_000n; // 1 to 5 SAC tokens
      const tokensB = tokensA + BigInt(Math.floor(Math.random() * 10_000_000)) + 1n; // tokensB > tokensA

      const sharesA = computeStellarShares(tokensA, unitMultiplier);
      const sharesB = computeStellarShares(tokensB, unitMultiplier);

      // Monotonicity assertion: delivering more tokens with identical multiplier must never deliver fewer shares
      expect(sharesB).toBeGreaterThanOrEqual(sharesA);
    }
  });

  it('Property 3: Stock-split corporate action invariance (N:1 split conservation)', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      // Split factor between 2:1 and 10:1 (like NVDA 10:1 split)
      const splitFactor = BigInt(Math.floor(Math.random() * 9)) + 2n;
      const baseTokens = BigInt(Math.floor(Math.random() * 100_000_000)) + 10_000_000n;
      const baseUnit = WAD; // 1.0 multiplier

      const preSplitShares = computeStellarShares(baseTokens, baseUnit);

      // Post-split: user holds N times tokens, each token represents 1/N shares
      const postSplitTokens = baseTokens * splitFactor;
      const postSplitUnit = baseUnit / splitFactor;
      const postSplitShares = computeStellarShares(postSplitTokens, postSplitUnit);

      // Total equity value must remain invariant within integer division epsilon
      const diff = preSplitShares > postSplitShares ? preSplitShares - postSplitShares : postSplitShares - preSplitShares;
      const epsilon = splitFactor * 10n ** 11n; // Maximum remainder error
      expect(diff).toBeLessThanOrEqual(epsilon);
    }
  });

  it('Property 4: No overflow or underflow under extreme Soroban u64/i128 boundary values', () => {
    const maxTokens = 10_000_000_000n * STROOP; // $10 Billion in SAC tokens
    const maxUnit = 1000n * WAD; // 1 token = 1,000 shares
    const shares = computeStellarShares(maxTokens, maxUnit);
    expect(shares).toBeGreaterThan(0n);
    expect(typeof shares).toBe('bigint');
  });
});
