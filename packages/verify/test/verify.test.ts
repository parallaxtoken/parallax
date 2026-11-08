import { describe, expect, it } from 'vitest';
import { verifyFill, verifyQuote, type FillEvidence } from '../src';

const A = '0x00000000000000000000000000000000000000a1' as const;
const W = '0x00000000000000000000000000000000000000b1' as const;
const R = '0x00000000000000000000000000000000000000c1' as const;
const base: FillEvidence = {
  orderId: 7n, side: 'BUY', owner: A, limit: 190_000_000_000_000_000n, amount: 50n * 10n ** 18n, wrapper: W,
  wrapperAllowedByRegistry: true, routerAllowedByRegistry: true,
  event: { tokenAmount: 200_000_000_000_000_000n, unitWad: 1_000_778_223_752_807_865n, shares: 200_155_644_750_561_573n, usdt: 50n * 10n ** 18n, router: R, filler: A },
  unitAtBlock: 1_000_778_223_752_807_865n,
  transfersToOwner: [{ token: W, value: 200_000_000_000_000_000n }], transfersToFiller: [],
  bookBalancesAfter: { usdt: 0n, token: 0n }, fillEventCount: 1,
};
const status = (r: ReturnType<typeof verifyFill>, id: string) => r.find((x) => x.id === id)?.status;

describe('offline verifier', () => {
  it('passes a clean buy fill', () => {
    const r = verifyFill(base);
    expect(r.filter((x) => x.status === 'FAIL')).toEqual([]);
    expect(status(r, 'T2')).toBe('PASS');
  });

  it('fails when the delivered shares are below the floor', () => {
    const r = verifyFill({ ...base, limit: 300_000_000_000_000_000n });
    expect(status(r, 'T2')).toBe('FAIL');
  });

  it('fails when the event unit differs from the chain unit at that block (T3)', () => {
    const r = verifyFill({ ...base, unitAtBlock: 1_000_000_000_000_000_000n });
    expect(status(r, 'T3')).toBe('FAIL');
  });

  it('reports UNKNOWN, not PASS, when the block state is pruned', () => {
    expect(status(verifyFill({ ...base, unitAtBlock: null }), 'T3')).toBe('UNKNOWN');
  });

  it('fails when tokens did not all reach the owner (T7) or the book kept funds (T6)', () => {
    expect(status(verifyFill({ ...base, transfersToOwner: [] }), 'T7')).toBe('FAIL');
    expect(status(verifyFill({ ...base, bookBalancesAfter: { usdt: 1n, token: 0n } }), 'T6')).toBe('FAIL');
  });

  it('fails on a double fill (T8)', () => {
    expect(status(verifyFill({ ...base, fillEventCount: 2 }), 'T8')).toBe('FAIL');
  });

  it('checks the sell floor in USDT per share (T2b)', () => {
    const sell: FillEvidence = { ...base, side: 'SELL', amount: 200n * 10n ** 15n, limit: 240n * 10n ** 18n,
      event: { ...base.event, usdt: 50n * 10n ** 18n }, transfersToOwner: [{ token: W, value: 50n * 10n ** 18n }] };
    expect(status(verifyFill(sell), 'T2b')).toBe('PASS');
    expect(status(verifyFill({ ...sell, limit: 400n * 10n ** 18n }), 'T2b')).toBe('FAIL');
  });

  it('closes the decomposition identity for a stored quote (T11)', () => {
    const r = verifyQuote({ ticker: 'NVDA', token: W, tokenPriceUsd: '229.78', referenceUsdPerShare: '229.38', unitWad: '1001715248795989800' });
    expect(r[0]?.status).toBe('PASS');
  });
});
