import { describe, expect, it } from 'vitest';
import { StellarStockPegEngine } from '../src/stellar_peg';
import { WAD } from '@parallax/kernel';

describe('StellarStockPegEngine', () => {
  const engine = new StellarStockPegEngine(150); // 1.5% max divergence

  it('detects healthy peg when Binance and Stellar secondary prices match', () => {
    const analysis = engine.analyzePeg(
      'NVDA',
      { ticker: 'NVDA', priceUsd: 145.0, timestamp: Date.now(), source: 'BINANCE_SPOT' },
      145.2, // 0.14% diff
      WAD
    );
    expect(analysis.isPegged).toBe(true);
    expect(analysis.pegDivergenceBps).toBeLessThan(150);
    expect(analysis.recommendedAction).toBe('HOLD');
  });

  it('suggests multiplier update when secondary price drifts beyond 1.5%', () => {
    const analysis = engine.analyzePeg(
      'AAPL',
      { ticker: 'AAPL', priceUsd: 230.0, timestamp: Date.now(), source: 'BINANCE_SPOT' },
      235.0, // 2.17% drift
      WAD
    );
    expect(analysis.isPegged).toBe(false);
    expect(analysis.recommendedAction).toBe('UPDATE_MULTIPLIER');
    expect(analysis.suggestedMultiplierWad).toBeLessThan(WAD);
  });

  it('triggers circuit break recommendation during extreme de-peg (>5%)', () => {
    const analysis = engine.analyzePeg(
      'TSLA',
      { ticker: 'TSLA', priceUsd: 250.0, timestamp: Date.now(), source: 'BINANCE_SPOT' },
      270.0, // 8.0% drift
      WAD
    );
    expect(analysis.recommendedAction).toBe('CIRCUIT_BREAK');
  });

  it('builds valid Soroban transaction payload for WrapperRegistry.set_custom_unit', () => {
    const payload = engine.buildSorobanPegUpdatePayload(
      'CAKOH4URENBVDAXAFSIPVSDDRFJTEHKMA77BRCH6B7WMOIOVF5ES2LFU',
      'CBG4XKLKV4TPIBCVR5HM4HZG3CSNJPQ3EEYNAXRYJKAXKKP2PYCDOTNG',
      980000000000000000n
    );
    expect(payload.method).toBe('set_custom_unit');
    expect(payload.args.unit).toBe('980000000000000000');
  });

  it('enumerates concrete economic advantages for the Stellar ecosystem', () => {
    const impact = StellarStockPegEngine.getStellarEcosystemImpact();
    expect(impact.length).toBeGreaterThanOrEqual(4);
    expect(impact[0]).toContain('Eliminates the 5-15% discount/premium');
  });
});

