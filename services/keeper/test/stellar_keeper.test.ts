import { describe, expect, it } from 'vitest';
import { StellarKeeperEngine } from '../src/stellar_keeper';
import { STELLAR_TESTNET } from '@parallax/registry';
import { WAD, STROOP } from '@parallax/kernel';

describe('StellarKeeperEngine', () => {
  const engine = new StellarKeeperEngine({
    network: STELLAR_TESTNET,
    keeperSecretKey: 'SDUMMYKEEPERSECRETKEYSTELLAR1234567890ABCDEF1234567890ABCDEF',
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
      { orderId: 1n, wrapperIndex: 0, routerAddress: 'C_ROUTER_1', routeDataHex: '0x' },
      { orderId: 2n, wrapperIndex: 1, routerAddress: 'C_ROUTER_2', routeDataHex: '0x1234' },
    ]);
    expect(payload.method).toBe('batch_fill');
    expect(payload.args.fills).toHaveLength(2);
    expect(payload.args.fills[0].order_id).toBe('1');
    expect(payload.args.fills[1].order_id).toBe('2');
  });

  it('seeds simulated testnet order book depth for demonstration', () => {
    const depth = engine.seedTestnetLiquidity('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
    expect(depth).toHaveLength(3);
    expect(depth.map((d) => d.tickerId)).toEqual(['NVDA', 'AAPL', 'TSLA']);
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
});

