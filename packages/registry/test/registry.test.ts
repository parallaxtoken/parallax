import { describe, expect, it } from 'vitest';
import { CORE_TICKERS, TICKERS, WRAPPERS, registryIndex, tickerIdOf, wrappersFor } from '../src';

describe('wrapper registry map', () => {
  it('covers every issuer for every measured ticker', () => {
    expect(CORE_TICKERS.length).toBeGreaterThan(0);
    for (const t of CORE_TICKERS) {
      expect(new Set(wrappersFor(t).map((w) => w.issuer)), t).toEqual(new Set(['BSTOCKS', 'ONDO', 'XSTOCKS']));
    }
  });

  it('every wrapper carries provenance and a unit source', () => {
    for (const w of WRAPPERS) {
      expect(w.provenance.length, w.symbol).toBeGreaterThan(0);
      expect(w.unit.selector).toMatch(/^0x[0-9a-f]{8}$/);
      expect(w.token).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });

  it('indexes match registration order and ticker ids are keccak256 of the symbol', () => {
    for (const t of TICKERS) wrappersFor(t).forEach((w, i) => expect(registryIndex(w)).toBe(i));
    expect(tickerIdOf('NVDA')).toBe('0xe108948b9667048232851f26a1427d3a908b22da622562906ca50ea536c2ecfb');
  });

  it('no address appears twice', () => {
    expect(new Set(WRAPPERS.map((w) => w.token.toLowerCase())).size).toBe(WRAPPERS.length);
  });
});

describe('catalogue coverage', () => {
  it('extends beyond the measured tickers with direct-pool wrappers only', () => {
    expect(TICKERS.length).toBeGreaterThan(CORE_TICKERS.length);
    for (const w of WRAPPERS.filter((x) => !x.core)) expect(w.deepestDirectPool?.reserveUsd ?? 0).toBeGreaterThan(0);
  });
});
