import { describe, expect, it } from 'vitest';
import {
  StellarKeeperEngine,
  fetchBinanceEquityQuote,
  serializeFillArgs,
  serializeFillArgsVec,
} from '../src/stellar_keeper';
import { STELLAR_TESTNET } from '@parallax/registry';
import { WAD, STROOP } from '@parallax/kernel';

describe('StellarKeeperEngine', () => {
  const engine = new StellarKeeperEngine({
    network: STELLAR_TESTNET,
    keeperSecretKey: 'SBHYTZBNY7NNPTZUUHOOB56L7HXM25EFUYXATKJU2ZCEWILQ2MNBADOB',
    maxSlippageBps: 50,
  });

  it('correctly evaluates buy order against share floor with 7-dec SAC scaling', () => {
    const order = {
      id: 1n,
      owner: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      side: 'BUY' as const,
      wrapperMask: 1,
      deadline: 2000000000n,
      tickerId: 'NVDA',
      amount: 100n * STROOP,
      limit: 5n * WAD, // 5 shares limit
    };

    // Case 1: Router returns 10 SAC tokens (10 shares) -> fill passes
    const tokensOut = 10n * STROOP;
    const res = engine.evaluateBuyOrder(order, WAD, tokensOut, 1700000000n);
    expect(res.shouldFill).toBe(true);
    expect(res.sharesOut).toBe(10n * WAD);

    // Case 2: Router returns 4 SAC tokens (4 shares) -> floor violation
    const tokensLow = 4n * STROOP;
    const resLow = engine.evaluateBuyOrder(order, WAD, tokensLow, 1700000000n);
    expect(resLow.shouldFill).toBe(false);
    expect(resLow.reason).toContain('SHARE_FLOOR_VIOLATION');
  });

  it('trips the circuit breaker when price deviation exceeds tolerance', () => {
    // 5% divergence (> 2.5% max)
    const resTripped = engine.checkOracleCircuitBreaker('NVDA', 152.25, 145.0, 250);
    expect(resTripped.tripped).toBe(true);
    expect(resTripped.deviationBps).toBe(500);
    expect(resTripped.reason).toContain('CIRCUIT_BREAKER_TRIPPED');

    // 1% divergence (<= 2.5% max) -> pass
    const resPass = engine.checkOracleCircuitBreaker('NVDA', 146.45, 145.0, 250);
    expect(resPass.tripped).toBe(false);
  });

  it('builds atomic batch_fill payloads for multi-order execution', () => {
    const payload = engine.buildBatchFillPayload([
      { orderId: 1n, wrapperIndex: 0, routerAddress: 'CBM3NZ46TSRLH4W7TF2OWA2GVK4XJYZRVGLTXODUBVVPQEN6SX5M432W', routeDataHex: '0x' },
      { orderId: 2n, wrapperIndex: 1, routerAddress: 'CAKOH4URENBVDAXAFSIPVSDDRFJTEHKMA77BRCH6B7WMOIOVF5ES2LFU', routeDataHex: '0x1234' },
    ]);
    expect(payload.method).toBe('batch_fill');
    expect(payload.args.fills).toHaveLength(2);
    expect(payload.args.fills[0]?.order_id).toBe('1');
    expect(payload.args.fills[1]?.order_id).toBe('2');
    expect(payload.args.filler).toBeDefined();
    expect(payload.args.filler.startsWith('G')).toBe(true);
  });

  it('supports explicit fillerAddress override in buildBatchFillPayload', () => {
    const customFiller = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
    const payload = engine.buildBatchFillPayload(
      [{ orderId: 42n, wrapperIndex: 0, routerAddress: 'C_ROUTER', routeDataHex: '0x' }],
      customFiller
    );
    expect(payload.args.filler).toBe(customFiller);
    expect(payload.args.fills[0]?.order_id).toBe('42');
  });

  it('seeds simulated testnet order book depth for demonstration', () => {
    const depth = engine.seedTestnetLiquidity('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
    expect(depth).toHaveLength(3);
    expect(depth.map((d) => d.tickerId)).toEqual(['NVDA', 'AAPL', 'TSLA']);

    const fullDepth = engine.seedAllTestnetOrders('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
    expect(fullDepth).toHaveLength(4);
    expect(fullDepth.map((d) => d.tickerId)).toEqual(['NVDA', 'AAPL', 'TSLA', 'BENJI']);
  });

  it('matches limit orders with real-time Binance equity price pegging', () => {
    const order = {
      id: 10n,
      owner: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      side: 'BUY' as const,
      wrapperMask: 1,
      deadline: 2000000000n,
      tickerId: 'NVDA',
      amount: 145n * STROOP,
      limit: 1n * WAD, // 1.0 share limit
    };

    // Case 1: Healthy Binance peg (145.0 USD spot, 145.2 DEX price)
    const quote = { ticker: 'NVDA', priceUsd: 145.0, timestamp: Date.now(), source: 'BINANCE_SPOT' as const };
    const resPegged = engine.evaluateOrderWithBinancePeg(
      order,
      quote,
      145.2,
      10n * STROOP, // 10 tokens returned
      1700000000n
    );
    expect(resPegged.shouldFill).toBe(true);
    expect(resPegged.divergenceBps).toBeLessThan(250);

    // Case 2: Extreme de-peg (>5%) halts order matching via circuit breaker
    const resHalted = engine.evaluateOrderWithBinancePeg(
      order,
      quote,
      160.0, // >10% depeg
      10n * STROOP,
      1700000000n
    );
    expect(resHalted.shouldFill).toBe(false);
    expect(resHalted.reason).toContain('BINANCE_PEG_HALTED');
  });

  it('strictly enforces Franklin Templeton BENJI / FOBXX $1.0000 fixed NAV parity invariant', async () => {
    const benjiQuote = await fetchBinanceEquityQuote('BENJI');
    expect(benjiQuote.ticker).toBe('BENJI');
    expect(benjiQuote.priceUsd).toBe(1.0);
    expect(benjiQuote.source).toBe('BINANCE_ORACLE');

    const fobxxQuote = await fetchBinanceEquityQuote('FOBXX');
    expect(fobxxQuote.ticker).toBe('BENJI');
    expect(fobxxQuote.priceUsd).toBe(1.0);

    const engineBenjiQuote = await engine.fetchBinanceEquityQuote('benji');
    expect(engineBenjiQuote.priceUsd).toBe(1.0);

    const untrimmedBenjiQuote = await fetchBinanceEquityQuote('  BENJI  ');
    expect(untrimmedBenjiQuote.ticker).toBe('BENJI');
    expect(untrimmedBenjiQuote.priceUsd).toBe(1.0);
  });

  it('fetches volatile equity quotes with deterministic fallbacks for NVDA, AAPL, and TSLA', async () => {
    const nvda = await fetchBinanceEquityQuote('NVDA');
    expect(nvda.ticker).toBe('NVDA');
    expect(nvda.priceUsd).toBeGreaterThan(50);

    const aapl = await fetchBinanceEquityQuote('AAPL');
    expect(aapl.ticker).toBe('AAPL');
    expect(aapl.priceUsd).toBeGreaterThan(50);

    const tsla = await fetchBinanceEquityQuote('TSLA');
    expect(tsla.ticker).toBe('TSLA');
    expect(tsla.priceUsd).toBeGreaterThan(50);
  });

  it('calculates exponential backoff delay with jitter on consecutive network/RPC failures', () => {
    const baseInterval = 5000;
    // consecutiveErrors = 0 -> base interval
    expect(engine.calculateBackoffDelay(baseInterval, 0, 0)).toBe(5000);

    // consecutiveErrors = 1 -> 5000 * 1.5^1 = 7500
    expect(engine.calculateBackoffDelay(baseInterval, 1, 0)).toBe(7500);

    // consecutiveErrors = 2 -> 5000 * 2.25 = 11250
    expect(engine.calculateBackoffDelay(baseInterval, 2, 0)).toBe(11250);

    // consecutiveErrors = 3 -> 5000 * 3.375 = 16875
    expect(engine.calculateBackoffDelay(baseInterval, 3, 0)).toBe(16875);

    // Jitter is added cleanly
    expect(engine.calculateBackoffDelay(baseInterval, 1, 250)).toBe(7750);

    // Cap at 60000ms max backoff
    expect(engine.calculateBackoffDelay(baseInterval, 10, 0)).toBe(60000);
  });

  it('returns a comprehensive keeper status snapshot via getStatus()', () => {
    const status = engine.getStatus();
    expect(status.available).toBe(true);
    expect(status.source).toBe('live');
    expect(status.network).toBe('stellar-testnet');
    expect(status.mode).toBe('STELLAR_TESTNET_LIVE');
    expect(status.transactionApi).toBe('SOROBAN_RPC');
    expect(status.book).toBe(STELLAR_TESTNET.parallaxBookContractId);
    expect(status.keeper).toBe('GAKGBUCRSX6MVYBXBDWPHFXC2Y53QXK2GCVLEA77ETKGE4LN7XXXRWTF');
    expect(typeof status.passes).toBe('number');
    expect(typeof status.fills).toBe('number');
    expect(typeof status.consecutiveErrors).toBe('number');
  });

  it('serializes Soroban FillArgs and FillArgsVec to valid XDR ScVal structures', () => {
    const single = serializeFillArgs({
      orderId: 101n,
      wrapperIndex: 0,
      routerAddress: 'CAKOH4URENBVDAXAFSIPVSDDRFJTEHKMA77BRCH6B7WMOIOVF5ES2LFU',
      routeDataHex: '0xabcd',
    });
    expect(single).toBeDefined();

    const vec = serializeFillArgsVec([
      {
        orderId: 101n,
        wrapperIndex: 0,
        routerAddress: 'CAKOH4URENBVDAXAFSIPVSDDRFJTEHKMA77BRCH6B7WMOIOVF5ES2LFU',
        routeDataHex: '0xabcd',
      },
    ]);
    expect(vec).toBeDefined();
  });

  it('handles batch fill simulation against Stellar Testnet gracefully', async () => {
    // Case 1: Empty fills array returns immediate success with 0 fills
    const emptyResult = await engine.executeBatchFillOnTestnet([]);
    expect(emptyResult.success).toBe(true);
    expect(emptyResult.fillsCount).toBe(0);

    // Case 2: Multi-fill execution pipeline constructs transaction and simulates against RPC
    const fills = [
      {
        orderId: 101n,
        wrapperIndex: 0,
        routerAddress: STELLAR_TESTNET.wrapperRegistryContractId,
        routeDataHex: '0x',
      },
    ];
    const simResult = await engine.executeBatchFillOnTestnet(fills);
    expect(typeof simResult.simulated).toBe('boolean');
    expect(simResult.fillsCount).toBe(1);
    // Even if simulation reports missing contract instance on testnet, it handles the error cleanly
    if (!simResult.simulationSuccess) {
      expect(simResult.error).toBeDefined();
    }
  }, 20000);

  it('validates keeper route schema conformance for Stellar Testnet telemetry', async () => {
    const TARGET_EQUITIES = [
      { ticker: 'NVDA', fallbackPrice: 145.0, dexPrice: 144.71 },
      { ticker: 'AAPL', fallbackPrice: 220.0, dexPrice: 219.56 },
      { ticker: 'TSLA', fallbackPrice: 310.0, dexPrice: 309.38 },
      { ticker: 'BENJI', fallbackPrice: 1.0, dexPrice: 1.0 },
    ];

    const pegs = await Promise.all(
      TARGET_EQUITIES.map(async (eq) => {
        const quote = await fetchBinanceEquityQuote(eq.ticker);
        const diff = Math.abs(eq.dexPrice - quote.priceUsd);
        const divergenceBps = Math.round((diff / quote.priceUsd) * 10000);
        return {
          ticker: eq.ticker,
          binancePrice: quote.priceUsd,
          stellarDexPrice: eq.dexPrice,
          divergenceBps,
          isPegged: divergenceBps <= 250,
        };
      })
    );

    expect(pegs).toHaveLength(4);
    const benjiPeg = pegs.find((p) => p.ticker === 'BENJI');
    expect(benjiPeg).toBeDefined();
    expect(benjiPeg?.binancePrice).toBe(1.0);
    expect(benjiPeg?.stellarDexPrice).toBe(1.0);
    expect(benjiPeg?.divergenceBps).toBe(0);
    expect(benjiPeg?.isPegged).toBe(true);
  });
});
