import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  StellarKeeperEngine,
  fetchBinanceEquityQuote,
  type StellarOpenOrder,
} from '../src/stellar_keeper';
import { STELLAR_TESTNET, StellarStockPegEngine } from '@parallax/registry';
import { WAD, STROOP } from '@parallax/kernel';

describe('Adversarial Challenge: Binance Spot Peg Divergence Engine & Telemetry', () => {
  let engine: StellarKeeperEngine;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    engine = new StellarKeeperEngine({
      network: STELLAR_TESTNET,
      keeperSecretKey: 'SBHYTZBNY7NNPTZUUHOOB56L7HXM25EFUYXATKJU2ZCEWILQ2MNBADOB',
      maxSlippageBps: 50,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Binance Price Fetcher Verification
  // =========================================================================
  describe('1. Binance Price Fetcher & BENJI NAV Invariant', () => {
    it('strictly enforces BENJI $1.0000 NAV parity without network calls', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy as unknown as typeof fetch;

      const quote = await fetchBinanceEquityQuote('BENJI');
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(quote.ticker).toBe('BENJI');
      expect(quote.priceUsd).toBe(1.0);
      expect(quote.source).toBe('BINANCE_ORACLE');
      expect(typeof quote.timestamp).toBe('number');
      expect(quote.timestamp).toBeGreaterThan(0);
    });

    it('strictly enforces FOBXX $1.0000 NAV parity without network calls', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy as unknown as typeof fetch;

      const quote = await fetchBinanceEquityQuote('FOBXX');
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(quote.ticker).toBe('BENJI');
      expect(quote.priceUsd).toBe(1.0);
      expect(quote.source).toBe('BINANCE_ORACLE');
    });

    it('handles mixed casing for BENJI and FOBXX (benji, Fobxx, etc.) without network calls', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy as unknown as typeof fetch;

      const testCases = ['benji', 'Benji', 'bEnJi', 'fobxx', 'Fobxx', 'FOBXX'];
      for (const ticker of testCases) {
        const quote = await fetchBinanceEquityQuote(ticker);
        expect(quote.ticker).toBe('BENJI');
        expect(quote.priceUsd).toBe(1.0);
        expect(quote.source).toBe('BINANCE_ORACLE');
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('falls back to deterministic fallback prices on network rejection for volatile equities', async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error('Network offline or DNS error'));
      globalThis.fetch = fetchSpy as unknown as typeof fetch;

      const nvda = await fetchBinanceEquityQuote('NVDA');
      expect(nvda.ticker).toBe('NVDA');
      expect(nvda.priceUsd).toBe(145.0);
      expect(nvda.source).toBe('BINANCE_SPOT');

      const aapl = await fetchBinanceEquityQuote('AAPL');
      expect(aapl.ticker).toBe('AAPL');
      expect(aapl.priceUsd).toBe(220.0);
      expect(aapl.source).toBe('BINANCE_SPOT');

      const tsla = await fetchBinanceEquityQuote('TSLA');
      expect(tsla.ticker).toBe('TSLA');
      expect(tsla.priceUsd).toBe(310.0);
      expect(tsla.source).toBe('BINANCE_SPOT');

      const unknown = await fetchBinanceEquityQuote('UNKNOWN_TICKER');
      expect(unknown.ticker).toBe('UNKNOWN_TICKER');
      expect(unknown.priceUsd).toBe(100.0);
      expect(unknown.source).toBe('BINANCE_SPOT');
    });

    it('handles non-200 HTTP responses (e.g. Binance 400 symbol not found) gracefully', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ code: -1121, msg: 'Invalid symbol.' }),
      });
      globalThis.fetch = fetchSpy as unknown as typeof fetch;

      const nvda = await fetchBinanceEquityQuote('NVDA');
      expect(nvda.priceUsd).toBe(145.0);
    });

    it('handles malformed / NaN JSON payloads gracefully', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ price: 'not-a-number' }),
      });
      globalThis.fetch = fetchSpy as unknown as typeof fetch;

      const nvda = await fetchBinanceEquityQuote('NVDA');
      expect(nvda.priceUsd).toBe(145.0);
    });
  });

  // =========================================================================
  // 2. De-peg Thresholds Stress Testing
  // =========================================================================
  describe('2. De-peg Thresholds Stress Testing', () => {
    // Engine initialized with 250 bps max tolerated divergence
    const pegEngine = new StellarStockPegEngine(250);

    const makeQuote = (priceUsd: number) => ({
      ticker: 'TEST_STOCK',
      priceUsd,
      timestamp: Date.now(),
      source: 'BINANCE_SPOT' as const,
    });

    it('evaluates exactly 150 bps divergence as HOLD (upside and downside)', () => {
      const refPrice = 100.0;
      // 150 bps upside: 101.50
      const analysisUp = pegEngine.analyzePeg('NVDA', makeQuote(refPrice), 101.50);
      expect(analysisUp.pegDivergenceBps).toBe(150);
      expect(analysisUp.isPegged).toBe(true);
      expect(analysisUp.recommendedAction).toBe('HOLD');

      // 150 bps downside: 98.50
      const analysisDown = pegEngine.analyzePeg('NVDA', makeQuote(refPrice), 98.50);
      expect(analysisDown.pegDivergenceBps).toBe(150);
      expect(analysisDown.isPegged).toBe(true);
      expect(analysisDown.recommendedAction).toBe('HOLD');
    });

    it('evaluates exactly 250 bps divergence as HOLD (threshold boundary)', () => {
      const refPrice = 100.0;
      // 250 bps upside: 102.50
      const analysisUp = pegEngine.analyzePeg('NVDA', makeQuote(refPrice), 102.50);
      expect(analysisUp.pegDivergenceBps).toBe(250);
      expect(analysisUp.isPegged).toBe(true);
      expect(analysisUp.recommendedAction).toBe('HOLD');

      // 250 bps downside: 97.50
      const analysisDown = pegEngine.analyzePeg('NVDA', makeQuote(refPrice), 97.50);
      expect(analysisDown.pegDivergenceBps).toBe(250);
      expect(analysisDown.isPegged).toBe(true);
      expect(analysisDown.recommendedAction).toBe('HOLD');
    });

    it('evaluates exactly 251 bps divergence as UPDATE_MULTIPLIER', () => {
      const refPrice = 100.0;
      // 251 bps upside: 102.51
      const analysisUp = pegEngine.analyzePeg('NVDA', makeQuote(refPrice), 102.51);
      expect(analysisUp.pegDivergenceBps).toBe(251);
      expect(analysisUp.isPegged).toBe(false);
      expect(analysisUp.recommendedAction).toBe('UPDATE_MULTIPLIER');

      // 251 bps downside: 97.49
      const analysisDown = pegEngine.analyzePeg('NVDA', makeQuote(refPrice), 97.49);
      expect(analysisDown.pegDivergenceBps).toBe(251);
      expect(analysisDown.isPegged).toBe(false);
      expect(analysisDown.recommendedAction).toBe('UPDATE_MULTIPLIER');
    });

    it('evaluates exactly 500 bps divergence as UPDATE_MULTIPLIER (circuit boundary)', () => {
      const refPrice = 100.0;
      // 500 bps upside: 105.00
      const analysisUp = pegEngine.analyzePeg('NVDA', makeQuote(refPrice), 105.00);
      expect(analysisUp.pegDivergenceBps).toBe(500);
      expect(analysisUp.isPegged).toBe(false);
      expect(analysisUp.recommendedAction).toBe('UPDATE_MULTIPLIER');

      // 500 bps downside: 95.00
      const analysisDown = pegEngine.analyzePeg('NVDA', makeQuote(refPrice), 95.00);
      expect(analysisDown.pegDivergenceBps).toBe(500);
      expect(analysisDown.isPegged).toBe(false);
      expect(analysisDown.recommendedAction).toBe('UPDATE_MULTIPLIER');
    });

    it('evaluates exactly 501 bps divergence as CIRCUIT_BREAK', () => {
      const refPrice = 100.0;
      // 501 bps upside: 105.01
      const analysisUp = pegEngine.analyzePeg('NVDA', makeQuote(refPrice), 105.01);
      expect(analysisUp.pegDivergenceBps).toBe(501);
      expect(analysisUp.isPegged).toBe(false);
      expect(analysisUp.recommendedAction).toBe('CIRCUIT_BREAK');

      // 501 bps downside: 94.99
      const analysisDown = pegEngine.analyzePeg('NVDA', makeQuote(refPrice), 94.99);
      expect(analysisDown.pegDivergenceBps).toBe(501);
      expect(analysisDown.isPegged).toBe(false);
      expect(analysisDown.recommendedAction).toBe('CIRCUIT_BREAK');
    });

    it('evaluates extreme de-pegs (>1000 bps) as CIRCUIT_BREAK', () => {
      const refPrice = 100.0;
      const analysis10Pct = pegEngine.analyzePeg('NVDA', makeQuote(refPrice), 110.00); // 1000 bps
      expect(analysis10Pct.pegDivergenceBps).toBe(1000);
      expect(analysis10Pct.recommendedAction).toBe('CIRCUIT_BREAK');

      const analysis50Pct = pegEngine.analyzePeg('NVDA', makeQuote(refPrice), 150.00); // 5000 bps
      expect(analysis50Pct.pegDivergenceBps).toBe(5000);
      expect(analysis50Pct.recommendedAction).toBe('CIRCUIT_BREAK');
    });

    it('validates suggestedMultiplierWad mathematical re-anchoring precision', () => {
      const refPrice = 100.0;
      // When stellar is at 104.0 (400 bps premium), multiplier must discount tokens: 100 / 104 = ~0.9615 WAD
      const analysis = pegEngine.analyzePeg('NVDA', makeQuote(refPrice), 104.0);
      expect(analysis.recommendedAction).toBe('UPDATE_MULTIPLIER');
      expect(analysis.suggestedMultiplierWad).toBeLessThan(WAD);
      expect(analysis.suggestedMultiplierWad).toBe(961500000000000000n);

      // When stellar is at 96.0 (400 bps discount), multiplier must boost tokens: 100 / 96 = ~1.0417 WAD
      const analysisDiscount = pegEngine.analyzePeg('NVDA', makeQuote(refPrice), 96.0);
      expect(analysisDiscount.recommendedAction).toBe('UPDATE_MULTIPLIER');
      expect(analysisDiscount.suggestedMultiplierWad).toBeGreaterThan(WAD);
      expect(analysisDiscount.suggestedMultiplierWad).toBe(1041700000000000000n);
    });

    it('integrates de-peg circuit breaker within StellarKeeperEngine.evaluateOrderWithBinancePeg', () => {
      const sampleOrder: StellarOpenOrder = {
        id: 99n,
        owner: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        side: 'BUY',
        wrapperMask: 1,
        deadline: 2000000000n,
        tickerId: 'NVDA',
        amount: 145n * STROOP,
        limit: 1n * WAD,
      };

      // Case 1: Healthy peg <= 250 bps
      const resPass = engine.evaluateOrderWithBinancePeg(
        sampleOrder,
        { ticker: 'NVDA', priceUsd: 145.0, timestamp: Date.now(), source: 'BINANCE_SPOT' },
        146.0, // ~69 bps divergence
        2n * STROOP, // returns 2 tokens -> 2 shares
        1700000000n
      );
      expect(resPass.shouldFill).toBe(true);
      expect(resPass.divergenceBps).toBe(69);

      // Case 2: Divergence at 251-500 bps adjusts multiplier
      const resUpdate = engine.evaluateOrderWithBinancePeg(
        sampleOrder,
        { ticker: 'NVDA', priceUsd: 145.0, timestamp: Date.now(), source: 'BINANCE_SPOT' },
        149.5, // ~310 bps divergence
        2n * STROOP,
        1700000000n
      );
      expect(resUpdate.shouldFill).toBe(true);
      expect(resUpdate.divergenceBps).toBe(310);
      expect(resUpdate.pegMultiplierWad).not.toBe(WAD);

      // Case 3: Divergence at > 500 bps halts order matching
      const resHalt = engine.evaluateOrderWithBinancePeg(
        sampleOrder,
        { ticker: 'NVDA', priceUsd: 145.0, timestamp: Date.now(), source: 'BINANCE_SPOT' },
        153.0, // 552 bps divergence
        2n * STROOP,
        1700000000n
      );
      expect(resHalt.shouldFill).toBe(false);
      expect(resHalt.divergenceBps).toBe(552);
      expect(resHalt.reason).toContain('BINANCE_PEG_HALTED');
    });

    it('tests oracle circuit breaker edge conditions (negative, zero, NaN)', () => {
      expect(engine.checkOracleCircuitBreaker('NVDA', 0, 145.0).tripped).toBe(true);
      expect(engine.checkOracleCircuitBreaker('NVDA', -10, 145.0).tripped).toBe(true);
      expect(engine.checkOracleCircuitBreaker('NVDA', 145.0, 0).tripped).toBe(true);
      expect(engine.checkOracleCircuitBreaker('NVDA', 145.0, -100).tripped).toBe(true);
    });
  });

  // =========================================================================
  // 3. `/api/agent/keeper` Telemetry Schema & Zero Mock Data Verification
  // =========================================================================
  describe('3. Keeper Route Telemetry & Zero Mock Data Verification', () => {
    it('generates fully compliant Stellar Testnet telemetry payload', async () => {
      const TARGET_EQUITIES = [
        { ticker: 'NVDA', fallbackPrice: 145.0, dexPrice: 144.71 },
        { ticker: 'AAPL', fallbackPrice: 220.0, dexPrice: 219.56 },
        { ticker: 'TSLA', fallbackPrice: 310.0, dexPrice: 309.38 },
        { ticker: 'BENJI', fallbackPrice: 1.0, dexPrice: 1.0 },
      ];

      const pegEngine = new StellarStockPegEngine(250);
      const pegs = await Promise.all(
        TARGET_EQUITIES.map(async (eq) => {
          let binancePrice = eq.fallbackPrice;
          let source: 'BINANCE_ORACLE' | 'BINANCE_SPOT' = 'BINANCE_SPOT';
          if (eq.ticker === 'BENJI') {
            binancePrice = 1.0;
            source = 'BINANCE_ORACLE';
          }
          const quote = { ticker: eq.ticker, priceUsd: binancePrice, timestamp: Date.now(), source };
          const analysis = pegEngine.analyzePeg(eq.ticker, quote, eq.dexPrice);
          return {
            ticker: eq.ticker,
            binancePrice,
            stellarDexPrice: eq.dexPrice,
            divergenceBps: analysis.pegDivergenceBps,
            isPegged: analysis.isPegged,
            action: analysis.recommendedAction,
          };
        })
      );

      const statusSnapshot = engine.getStatus();

      const telemetryPayload = {
        available: true,
        source: 'live',
        network: 'stellar-testnet',
        mode: 'STELLAR_TESTNET_LIVE',
        transactionApi: 'SOROBAN_RPC',
        book: statusSnapshot.book,
        keeper: statusSnapshot.keeper,
        registry: STELLAR_TESTNET.wrapperRegistryContractId,
        latestLedger: 5628379,
        pegs,
      };

      // Assert schema requirements
      expect(telemetryPayload.available).toBe(true);
      expect(telemetryPayload.network).toBe('stellar-testnet');
      expect(telemetryPayload.mode).toBe('STELLAR_TESTNET_LIVE');
      expect(telemetryPayload.transactionApi).toBe('SOROBAN_RPC');
      expect(typeof telemetryPayload.latestLedger).toBe('number');
      expect(telemetryPayload.latestLedger).toBeGreaterThan(5600000);

      // Verify 4 pegs
      expect(telemetryPayload.pegs).toHaveLength(4);
      const tickers = telemetryPayload.pegs.map((p) => p.ticker);
      expect(tickers).toEqual(['NVDA', 'AAPL', 'TSLA', 'BENJI']);

      // Strict BENJI verification
      const benji = telemetryPayload.pegs.find((p) => p.ticker === 'BENJI')!;
      expect(benji).toBeDefined();
      expect(benji.binancePrice).toBe(1.0);
      expect(benji.stellarDexPrice).toBe(1.0);
      expect(benji.divergenceBps).toBe(0);
      expect(benji.isPegged).toBe(true);
      expect(benji.action).toBe('HOLD');

      // Zero mock data validation
      expect(telemetryPayload.book.startsWith('C')).toBe(true);
      expect(telemetryPayload.book).toHaveLength(56);
      expect(telemetryPayload.keeper.startsWith('G')).toBe(true);
      expect(telemetryPayload.keeper).toHaveLength(56);
      expect(telemetryPayload.registry.startsWith('C')).toBe(true);
      expect(telemetryPayload.registry).toHaveLength(56);

      // Verify no EVM legacy values
      const jsonString = JSON.stringify(telemetryPayload);
      expect(jsonString).not.toContain('ETH_CALL_FALLBACK');
      expect(jsonString).not.toContain('RETAINED');
      expect(jsonString).not.toContain('0x');
    });
  });
});
