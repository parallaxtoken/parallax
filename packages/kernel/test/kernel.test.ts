import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLOSURE_TOLERANCE,
  WAD,
  closureResidual,
  decompose,
  decide,
  effectiveUsdPerShare,
  minSharesFor,
  nyseSessionAt,
  rank,
  readSession,
  referenceAgeSeconds,
  referenceIsLive,
  sharesFor,
  sharesPerToken,
  shares,
  tokens,
  tokensForShares,
  toUsdPerShare,
  usd,
  usdPerShare,
  usdPerToken,
  wadFromDecimal,
  wadToDecimal,
  type WrapperQuote,
} from '../src';

const unitArb = fc.bigInt({ min: WAD / 1000n, max: WAD * 20n }); // 0.001x .. 20x
const priceArb = fc.bigInt({ min: WAD / 100n, max: WAD * 100000n });

describe('T11 decomposition closure', () => {
  it('(1 + gross) = unit x (1 + net) within tolerance for any price, reference, unit', () => {
    fc.assert(
      fc.property(priceArb, priceArb, unitArb, (p, r, u) => {
        const d = decompose(usdPerToken(p), usdPerShare(r), sharesPerToken(u));
        const resid = closureResidual(d, sharesPerToken(u));
        const bound = (CLOSURE_TOLERANCE * (WAD + (d.gross < 0n ? -d.gross : d.gross))) / WAD + 2n * u;
        expect(resid < 0n ? -resid : resid).toBeLessThanOrEqual(bound > 0n ? bound : 1n);
        // relative: below 1e-9 of the gross level plus unit-sized rounding
      }),
      { numRuns: 500 },
    );
  });

  it('closes exactly when the price is a whole multiple of the unit', () => {
    const u = sharesPerToken(wadFromDecimal('1.001715248795989800'));
    const ref = usdPerShare(wadFromDecimal('229.38'));
    const p = usdPerToken((ref * u) / WAD);
    const d = decompose(p, ref, u);
    expect(d.net < 5n * 10n ** 9n && d.net > -5n * 10n ** 9n).toBe(true);
    expect(d.gross).toBeGreaterThan(0n);
  });
});

describe('T1 unit normalisation', () => {
  it('shares and tokens round-trip: buying never over-delivers, selling never under-sells', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: WAD / 1000n, max: WAD * 1000n }), unitArb, (s, u) => {
        const unit = sharesPerToken(u);
        const t = tokensForShares(shares(s), unit);
        expect(sharesFor(t, unit)).toBeGreaterThanOrEqual(s);
      }),
    );
  });

  it('a cheaper token price is not a cheaper share when the unit differs', () => {
    const cheapToken = { price: usdPerToken(wadFromDecimal('229.40')), unit: sharesPerToken(wadFromDecimal('1.0')) };
    const dearToken = { price: usdPerToken(wadFromDecimal('229.80')), unit: sharesPerToken(wadFromDecimal('1.0100')) };
    expect(cheapToken.price < dearToken.price).toBe(true);
    expect(toUsdPerShare(dearToken.price, dearToken.unit) < toUsdPerShare(cheapToken.price, cheapToken.unit)).toBe(true);
  });

  it('kernel source never mixes branded price types in one expression', () => {
    const dir = join(__dirname, '..', 'src');
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src, f).not.toMatch(/as UsdPerToken\s*\)\s*[<>]=?\s*\(?[^;]*as UsdPerShare/);
    }
  });

  // @ts-expect-error UsdPerToken is not assignable to UsdPerShare
  const _wrongUnit: ReturnType<typeof usdPerShare> = usdPerToken(1n);
  it('branded types are distinct at compile time', () => {
    expect(_wrongUnit).toBe(1n);
  });
});

const NOW_SAT = Date.UTC(2026, 9, 10, 12, 0, 0); // Sat 2026-10-10 12:00Z
const NOW_TUE = Date.UTC(2026, 9, 6, 15, 0, 0); // Tue 11:00 New York

describe('T10 stale is labelled', () => {
  it('weekend reference is aged and never live', () => {
    expect(nyseSessionAt(NOW_SAT)).toBe('CLOSED_WEEKEND');
    const age = referenceAgeSeconds(NOW_SAT);
    expect(age).toBeGreaterThan(12 * 3600);
    const r = readSession(NOW_SAT, null);
    expect(referenceIsLive(r)).toBe(false);
    expect(r.session).toBe('CLOSED_WEEKEND');
  });

  it('regular session reference is live', () => {
    expect(nyseSessionAt(NOW_TUE)).toBe('REGULAR');
    const r = readSession(NOW_TUE, null);
    expect(r.referenceAgeSec).toBe(0);
    expect(referenceIsLive(r)).toBe(true);
  });

  it('an asset pause dominates the label', () => {
    const r = readSession(NOW_TUE, { marketStatus: null, openState: false, reasonCode: 'ASSET_PAUSED', reasonMsg: 'stock_split', nextOpenTime: null });
    expect(r.session).toBe('CORPORATE_ACTION');
    expect(referenceIsLive(r)).toBe(false);
  });

  it('flags a disagreement between the API and the local calendar', () => {
    const r = readSession(NOW_SAT, { marketStatus: 'regular', openState: true, reasonCode: 'TRADING', reasonMsg: null, nextOpenTime: null });
    expect(r.disagreesWithCalendar).toBe(true);
  });

  it('holidays and half days', () => {
    expect(nyseSessionAt(Date.UTC(2026, 10, 26, 15, 0, 0))).toBe('CLOSED_HOLIDAY'); // Thanksgiving
    expect(nyseSessionAt(Date.UTC(2026, 10, 27, 19, 0, 0))).toBe('POST'); // 14:00 NY on a half day
  });
});

const mk = (over: Partial<WrapperQuote> & Pick<WrapperQuote, 'issuer' | 'wrapperIdx'>): WrapperQuote => ({
  token: '0x0000000000000000000000000000000000000001',
  side: 'BUY',
  usd: usd(wadFromDecimal('50')),
  tokens: tokens(wadFromDecimal('0.2')),
  unit: sharesPerToken(wadFromDecimal('1')),
  paused: false,
  route: 'AMM',
  referenceUsdPerShare: usdPerShare(wadFromDecimal('250')),
  simulated: 'PASS',
  ...over,
});

const LIVE = readSession(NOW_TUE, null);
const BUY = { side: 'BUY' as const, maxNetPremium: wadFromDecimal('0.005'), minShares: shares(wadFromDecimal('0.19')) };

describe('policy', () => {
  it('ranks in shares, not tokens: more tokens at a lower unit lose to fewer tokens at a higher unit', () => {
    const a = mk({ issuer: 'BSTOCKS', wrapperIdx: 0, tokens: tokens(wadFromDecimal('0.2')), unit: sharesPerToken(wadFromDecimal('1')) });
    const b = mk({ issuer: 'ONDO', wrapperIdx: 1, tokens: tokens(wadFromDecimal('0.1995')), unit: sharesPerToken(wadFromDecimal('1.01')) });
    const r = rank([a, b], BUY, LIVE);
    expect(r[0]?.quote.issuer).toBe('ONDO');
  });

  it('refuses a quote more than 5 percent from its own reference as BROKEN_QUOTE', () => {
    const broken = mk({ issuer: 'ONDO', wrapperIdx: 1, tokens: tokens(wadFromDecimal('0.15')) });
    const d = decide([broken], BUY, LIVE, false);
    expect(d.kind).toBe('WAIT');
    if (d.kind !== 'FILL') expect(d.reasons).toContain('BROKEN_QUOTE');
  });

  it('keeps RFQ-only wrappers out and says why', () => {
    const rfq = mk({ issuer: 'ONDO', wrapperIdx: 1, route: 'RFQ' });
    const d = decide([rfq], BUY, LIVE, false);
    expect(d.kind).toBe('SKIP');
    if (d.kind !== 'FILL') expect(d.reasons).toEqual(['NO_CONTRACT_ROUTE']);
  });

  it('an unread unit is degraded, never defaulted to one', () => {
    const q = mk({ issuer: 'XSTOCKS', wrapperIdx: 2, unit: null });
    const d = decide([q], BUY, LIVE, false);
    expect(d.kind).toBe('WAIT');
    if (d.kind !== 'FILL') expect(d.reasons).toEqual(['API_DEGRADED']);
  });

  it('degraded feed and no wrapper are different typed states (T12)', () => {
    const none = decide([], BUY, LIVE, false);
    const down = decide([], BUY, LIVE, true);
    expect(none.kind).toBe('SKIP');
    expect(down.kind).toBe('WAIT');
    if (none.kind !== 'FILL' && down.kind !== 'FILL') expect(none.reasons).not.toEqual(down.reasons);
  });

  it('paused units wait with UNIT_PAUSED', () => {
    const d = decide([mk({ issuer: 'BSTOCKS', wrapperIdx: 0, paused: true })], BUY, LIVE, false);
    expect(d.kind).toBe('WAIT');
    if (d.kind !== 'FILL') expect(d.reasons).toEqual(['UNIT_PAUSED']);
  });

  it('a premium above tolerance waits while the reference is live, but is not judged on a stale reference', () => {
    const dear = mk({ issuer: 'BSTOCKS', wrapperIdx: 0, tokens: tokens(wadFromDecimal('0.1985')) }); // ~0.76% over
    expect(decide([dear], { ...BUY, minShares: shares(wadFromDecimal('0.19')) }, LIVE, false).kind).toBe('WAIT');
    const weekend = readSession(NOW_SAT, null);
    const d = decide([dear], { ...BUY, minShares: shares(wadFromDecimal('0.19')) }, weekend, false);
    expect(d.kind).toBe('FILL'); // judged by the signed share floor, not a stale reference
  });

  it('is deterministic: same inputs, same decision', () => {
    const qs = [mk({ issuer: 'BSTOCKS', wrapperIdx: 0 }), mk({ issuer: 'ONDO', wrapperIdx: 1 })];
    expect(JSON.stringify(decide(qs, BUY, LIVE, false), (_, v) => (typeof v === 'bigint' ? v.toString() : v))).toBe(
      JSON.stringify(decide(qs, BUY, LIVE, false), (_, v) => (typeof v === 'bigint' ? v.toString() : v)),
    );
  });

  it('minSharesFor turns plain words into a share floor', () => {
    const floor = minSharesFor(usd(wadFromDecimal('50')), usdPerShare(wadFromDecimal('250')), wadFromDecimal('0.005'));
    expect(wadToDecimal(floor, 4)).toBe('0.1990');
    expect(effectiveUsdPerShare(usd(wadFromDecimal('50')), tokens(wadFromDecimal('0.2')), sharesPerToken(WAD))).toBe(wadFromDecimal('250'));
  });
});

describe('reference second opinion (fail closed)', () => {
  const ref = (n: string) => usdPerShare(wadFromDecimal(n));
  const q: WrapperQuote = {
    wrapperIdx: 0, issuer: 'BSTOCKS', token: '0x0000000000000000000000000000000000000001', side: 'BUY',
    usd: usd(wadFromDecimal('50')), tokens: tokens(wadFromDecimal('0.2168')), unit: sharesPerToken(wadFromDecimal('1.000778')),
    paused: false, route: 'AMM', referenceUsdPerShare: ref('230'), simulated: 'PASS',
  };
  const buy = { side: 'BUY' as const, maxNetPremium: wadFromDecimal('0.05'), minShares: shares(0n) };
  const open = readSession(NOW_TUE, null);

  it('refuses with REFERENCE_DISAGREE when the two references differ by more than the limit', () => {
    const d = decide([q], buy, open, false, { issuerReference: ref('240'), independentReference: ref('229'), maxDisagreeBps: 200, required: true });
    expect(d.kind).toBe('WAIT');
    if (d.kind === 'WAIT') expect(d.reasons).toEqual(['REFERENCE_DISAGREE']);
  });
  it('fills when they agree', () => {
    const d = decide([q], buy, open, false, { issuerReference: ref('230'), independentReference: ref('229'), maxDisagreeBps: 200, required: true });
    expect(d.kind).toBe('FILL');
  });
  it('fails closed when the independent source is missing and required, proceeds when it is optional', () => {
    const closed = decide([q], buy, open, false, { issuerReference: ref('230'), independentReference: null, maxDisagreeBps: 200, required: true });
    expect(closed.kind).toBe('WAIT');
    if (closed.kind === 'WAIT') expect(closed.reasons).toEqual(['API_DEGRADED']);
    const loose = decide([q], buy, open, false, { issuerReference: ref('230'), independentReference: null, maxDisagreeBps: 200, required: false });
    expect(loose.kind).toBe('FILL');
  });
});
