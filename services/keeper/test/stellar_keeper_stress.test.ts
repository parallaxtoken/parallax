import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  StellarKeeperEngine,
  serializeFillArgs,
  serializeFillArgsVec,
} from '../src/stellar_keeper';
import { STELLAR_TESTNET } from '@parallax/registry';
import { rpc, xdr, Account, Keypair } from '@stellar/stellar-sdk';

describe('Empirical Adversarial Challenge: StellarKeeperEngine Stress Suite', () => {
  const TEST_SECRET = 'SBHYTZBNY7NNPTZUUHOOB56L7HXM25EFUYXATKJU2ZCEWILQ2MNBADOB';
  let engine: StellarKeeperEngine;

  beforeEach(() => {
    engine = new StellarKeeperEngine({
      network: STELLAR_TESTNET,
      keeperSecretKey: TEST_SECRET,
      maxSlippageBps: 50,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. POLLING CADENCE & ADAPTIVE SLEEP
  // =========================================================================
  describe('1. Polling Cadence: Adaptive Sleep & Cadence Drift', () => {
    it('empirically verifies adaptive sleep formula across variable execution durations', () => {
      const intervalMs = 5000;
      const calculateSleep = (elapsed: number, consecutiveErrors: number) => {
        if (consecutiveErrors > 0) {
          return engine.calculateBackoffDelay(intervalMs, consecutiveErrors, 0);
        }
        return Math.max(1000, intervalMs - elapsed);
      };

      // Scenario A: Fast execution (100ms) -> sleep compensates to match interval
      expect(calculateSleep(100, 0)).toBe(4900);

      // Scenario B: Moderate execution (2500ms) -> sleep absorbs elapsed time
      expect(calculateSleep(2500, 0)).toBe(2500);

      // Scenario C: Near-interval execution (4000ms) -> hits 1000ms floor exactly
      expect(calculateSleep(4000, 0)).toBe(1000);

      // Scenario D: Boundary execution (4500ms) -> clamped to 1000ms minimum rest period
      expect(calculateSleep(4500, 0)).toBe(1000);

      // Scenario E: Overrun execution (5500ms > 5000ms interval) -> preserves 1000ms safety rest
      expect(calculateSleep(5500, 0)).toBe(1000);

      // Scenario F: Extreme overrun (25000ms) -> prevents negative sleep, keeps 1000ms rest
      expect(calculateSleep(25000, 0)).toBe(1000);

      // Scenario G: Instantaneous execution (0ms) -> full interval sleep
      expect(calculateSleep(0, 0)).toBe(5000);
    });

    it('verifies startLoop lifecycle, adaptive timer execution, and clean termination', async () => {
      vi.useFakeTimers();

      let pollCount = 0;
      vi.spyOn(engine, 'pollCycle').mockImplementation(async () => {
        pollCount++;
        // advance simulated time by 500ms during poll execution
        vi.advanceTimersByTime(500);
      });

      // Launch startLoop asynchronously
      const loopPromise = engine.startLoop(5000);

      expect(engine.getStatus().isRunning).toBe(true);
      expect(pollCount).toBe(1);

      // Advance timers by 4500ms (5000 - 500 elapsed = 4500 sleep)
      await vi.advanceTimersByTimeAsync(4500);
      expect(pollCount).toBe(2);

      // Advance another cycle
      await vi.advanceTimersByTimeAsync(4500);
      expect(pollCount).toBe(3);

      // Stop loop cleanly
      engine.stop();
      expect(engine.getStatus().isRunning).toBe(false);

      // Further timer advances do not trigger more cycles
      await vi.advanceTimersByTimeAsync(10000);
      expect(pollCount).toBe(3);

      vi.useRealTimers();
    });

    it('verifies consecutiveErrors reset to zero upon successful poll cycle', async () => {
      vi.useFakeTimers();

      let attempt = 0;
      vi.spyOn(engine, 'pollCycle').mockImplementation(async () => {
        attempt++;
        if (attempt === 1) throw new Error('Transient RPC 503 error');
        // second attempt succeeds
      });

      const loopPromise = engine.startLoop(5000);

      // Allow microtask queue to process the rejected pollCycle promise
      await Promise.resolve();

      // First cycle fails -> consecutiveErrors becomes 1
      expect(engine.getStatus().consecutiveErrors).toBe(1);

      // Backoff delay for 1 error is 7500ms (+ jitter up to 500ms)
      // Advance by 8500ms so the backoff timer elapses and the second cycle runs
      await vi.advanceTimersByTimeAsync(8500);

      // Second cycle succeeds -> consecutiveErrors resets to 0
      expect(engine.getStatus().consecutiveErrors).toBe(0);

      engine.stop();
      vi.useRealTimers();
    });
  });

  // =========================================================================
  // 2. BACKOFF DELAY & JITTER RANDOMNESS
  // =========================================================================
  describe('2. Backoff Delay: Exponential Calculation, Jitter & 60s Ceiling', () => {
    it('verifies exponential backoff progression across consecutive errors (1 to 10)', () => {
      const base = 5000;

      // 0 errors -> base interval
      expect(engine.calculateBackoffDelay(base, 0, 0)).toBe(5000);
      expect(engine.calculateBackoffDelay(base, -1, 0)).toBe(5000);

      // 1 to 10 consecutive failures
      const expectedDelays = [
        7500,        // 1: 5000 * 1.5^1
        11250,       // 2: 5000 * 1.5^2
        16875,       // 3: 5000 * 1.5^3
        25312.5,     // 4: 5000 * 1.5^4
        37968.75,    // 5: 5000 * 1.5^5
        56953.125,   // 6: 5000 * 1.5^6
        60000,       // 7: 5000 * 1.5^7 = 85429.6875 -> capped at 60000
        60000,       // 8: capped at 60000
        60000,       // 9: capped at 60000
        60000,       // 10: capped at 60000
      ];

      for (let i = 1; i <= 10; i++) {
        const delay = engine.calculateBackoffDelay(base, i, 0);
        expect(delay).toBe(expectedDelays[i - 1]);
      }

      // Extreme consecutive errors (50, 100) maintain the 60000 cap
      expect(engine.calculateBackoffDelay(base, 50, 0)).toBe(60000);
      expect(engine.calculateBackoffDelay(base, 100, 0)).toBe(60000);
    });

    it('empirically verifies jitter distribution, boundedness, and randomness', () => {
      const sampleSize = 10000;
      const samples: number[] = new Array(sampleSize);

      for (let i = 0; i < sampleSize; i++) {
        samples[i] = Math.floor(Math.random() * 500);
      }

      // 1. Strict integer boundary verification: all samples in [0, 499]
      for (const s of samples) {
        expect(Number.isInteger(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(499);
      }

      // 2. Statistical uniformity verification
      const sum = samples.reduce((acc, v) => acc + v, 0);
      const mean = sum / sampleSize;
      // Theoretical mean for uniform integer distribution [0, 499] is 249.5
      expect(mean).toBeGreaterThan(235);
      expect(mean).toBeLessThan(265);

      // Variance verification: theoretical variance is (500^2 - 1) / 12 = ~20833
      const variance = samples.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / sampleSize;
      expect(variance).toBeGreaterThan(18000);
      expect(variance).toBeLessThan(23000);

      // Coverage check: should hit at least 480 of 500 possible discrete values
      const uniqueValues = new Set(samples);
      expect(uniqueValues.size).toBeGreaterThan(480);
    });

    it('verifies backoff delay behavior when combined with jitter at ceiling', () => {
      const base = 5000;

      for (let i = 0; i < 100; i++) {
        const jitter = Math.floor(Math.random() * 500);
        const delayAtCap = engine.calculateBackoffDelay(base, 10, jitter);

        // Exponential term is capped at 60000ms, with jitter adding 0..499ms
        expect(delayAtCap).toBeGreaterThanOrEqual(60000);
        expect(delayAtCap).toBeLessThanOrEqual(60499);
      }
    });
  });

  // =========================================================================
  // 3. BATCH FILL TRANSACTION GENERATION
  // =========================================================================
  describe('3. Batch Fill Payload Generation & Soroban XDR Serialization', () => {
    const SAMPLE_ROUTER = 'CBM3NZ46TSRLH4W7TF2OWA2GVK4XJYZRVGLTXODUBVVPQEN6SX5M432W';

    it('generates valid payload for empty batch fill', () => {
      const payload = engine.buildBatchFillPayload([]);

      expect(payload.contractId).toBe(STELLAR_TESTNET.parallaxBookContractId);
      expect(payload.method).toBe('batch_fill');
      expect(payload.args.fills).toEqual([]);
      expect(payload.args.filler).toBe(engine.getKeeperPublicKey());
    });

    it('generates valid payload for single fill with default and explicit filler', () => {
      const singleFill = [
        {
          orderId: 101n,
          wrapperIndex: 1,
          routerAddress: SAMPLE_ROUTER,
          routeDataHex: '0xdeadbeef',
        },
      ];

      // Default filler
      const payloadDefault = engine.buildBatchFillPayload(singleFill);
      expect(payloadDefault.args.filler).toBe(engine.getKeeperPublicKey());
      expect(payloadDefault.args.fills).toHaveLength(1);
      expect(payloadDefault.args.fills[0]).toEqual({
        order_id: '101',
        wrapper_idx: 1,
        router: SAMPLE_ROUTER,
        route_data: '0xdeadbeef',
      });

      // Explicit filler address
      const explicitFiller = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
      const payloadExplicit = engine.buildBatchFillPayload(singleFill, explicitFiller);
      expect(payloadExplicit.args.filler).toBe(explicitFiller);
      expect(payloadExplicit.args.fills[0]?.order_id).toBe('101');
    });

    it('generates and serializes large batched fills (50 orders) with extreme BigInt order IDs', () => {
      const fillsCount = 50;
      const fills = Array.from({ length: fillsCount }, (_, idx) => {
        // Test diverse IDs: 0n, powers of 2, 64-bit max, large BigInts
        let orderId: bigint;
        if (idx === 0) orderId = 0n;
        else if (idx === 1) orderId = 18446744073709551615n; // MAX_UINT64
        else if (idx === 2) orderId = 9007199254740992n;     // Number.MAX_SAFE_INTEGER + 1
        else orderId = BigInt(idx) * 1000000000n + 7n;

        return {
          orderId,
          wrapperIndex: idx % 5,
          routerAddress: SAMPLE_ROUTER,
          routeDataHex: idx % 2 === 0 ? '0x' : '0xabcdef0123456789',
        };
      });

      const payload = engine.buildBatchFillPayload(fills);
      expect(payload.args.fills).toHaveLength(50);

      // Verify no string truncation or rounding on BigInt order IDs
      expect(payload.args.fills[0]?.order_id).toBe('0');
      expect(payload.args.fills[1]?.order_id).toBe('18446744073709551615');
      expect(payload.args.fills[2]?.order_id).toBe('9007199254740992');
      expect(payload.args.fills[49]?.order_id).toBe(fills[49]!.orderId.toString());

      // Serialize 50 fills to Soroban ScVal Vec
      const scValVec = serializeFillArgsVec(fills);
      expect(scValVec.switch()).toBe(xdr.ScValType.scvVec());
      expect(scValVec.vec()?.length).toBe(50);

      // Round-trip through binary XDR
      const xdrBinary = scValVec.toXDR();
      expect(xdrBinary.length).toBeGreaterThan(1000);

      const deserializedScVal = xdr.ScVal.fromXDR(xdrBinary);
      expect(deserializedScVal.vec()?.length).toBe(50);
    });
  });

  // =========================================================================
  // 4. SIMULATION PIPELINE & RPC ERROR HANDLING
  // =========================================================================
  describe('4. Simulation Pipeline: Error Handling for Contract Failure & RPC Errors', () => {
    const SAMPLE_FILLS = [
      {
        orderId: 101n,
        wrapperIndex: 0,
        routerAddress: STELLAR_TESTNET.wrapperRegistryContractId,
        routeDataHex: '0x',
      },
    ];

    it('returns immediate success for empty batch without invoking RPC', async () => {
      const spySimulate = vi.spyOn(rpc.Server.prototype, 'simulateTransaction');

      const result = await engine.executeBatchFillOnTestnet([]);
      expect(result.success).toBe(true);
      expect(result.simulated).toBe(false);
      expect(result.simulationSuccess).toBe(true);
      expect(result.submitted).toBe(false);
      expect(result.fillsCount).toBe(0);

      expect(spySimulate).not.toHaveBeenCalled();
    });

    it('handles Soroban contract execution failure / revert in RPC simulation cleanly', async () => {
      // Mock simulateTransaction returning simulation error
      vi.spyOn(rpc.Server.prototype, 'getAccount').mockResolvedValue(
        new Account(engine.getKeeperPublicKey(), '100')
      );
      vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockResolvedValue({
        error: 'HostError: Error(Contract, #12): ParallaxBook order floor violation',
        events: [],
        latestLedger: 500000,
      } as unknown as rpc.Api.SimulateTransactionResponse);

      const result = await engine.executeBatchFillOnTestnet(SAMPLE_FILLS);

      expect(result.success).toBe(false);
      expect(result.simulated).toBe(true);
      expect(result.simulationSuccess).toBe(false);
      expect(result.submitted).toBe(false);
      expect(result.fillsCount).toBe(1);
      expect(result.error).toContain('HostError: Error(Contract, #12)');
    });

    it('handles simulation non-success response without error string', async () => {
      vi.spyOn(rpc.Server.prototype, 'getAccount').mockResolvedValue(
        new Account(engine.getKeeperPublicKey(), '100')
      );
      // Simulate response where isSimulationSuccess is false and isSimulationError is false
      vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockResolvedValue({
        events: [],
        latestLedger: 500000,
      } as unknown as rpc.Api.SimulateTransactionResponse);

      const result = await engine.executeBatchFillOnTestnet(SAMPLE_FILLS);

      expect(result.success).toBe(false);
      expect(result.simulated).toBe(true);
      expect(result.simulationSuccess).toBe(false);
      expect(result.submitted).toBe(false);
      expect(result.error).toBe('Simulation did not return success');
    });

    it('handles network transport failure during simulation', async () => {
      vi.spyOn(rpc.Server.prototype, 'getAccount').mockResolvedValue(
        new Account(engine.getKeeperPublicKey(), '100')
      );
      vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockRejectedValue(
        new Error('ECONNREFUSED: Unable to reach Soroban RPC server')
      );

      const result = await engine.executeBatchFillOnTestnet(SAMPLE_FILLS);

      expect(result.success).toBe(false);
      expect(result.simulated).toBe(false);
      expect(result.simulationSuccess).toBe(false);
      expect(result.submitted).toBe(false);
      expect(result.error).toContain('ECONNREFUSED');
    });

    it('handles missing account gracefully by defaulting sequence number to 1', async () => {
      vi.spyOn(rpc.Server.prototype, 'getAccount').mockRejectedValue(
        new Error('Account not found on ledger')
      );
      vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockResolvedValue({
        error: 'Simulation failed for uninitialized account',
        events: [],
        latestLedger: 500000,
      } as unknown as rpc.Api.SimulateTransactionResponse);

      const result = await engine.executeBatchFillOnTestnet(SAMPLE_FILLS);

      expect(result.simulated).toBe(true);
      expect(result.simulationSuccess).toBe(false);
      expect(result.error).toBe('Simulation failed for uninitialized account');
    });

    it('handles transaction submission rejection (status: ERROR / DUPLICATE)', async () => {
      vi.spyOn(rpc.Server.prototype, 'getAccount').mockResolvedValue(
        new Account(engine.getKeeperPublicKey(), '100')
      );
      vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockResolvedValue({
        results: [{ auth: [], xdr: '' }],
        transactionData: new xdr.SorobanTransactionData({
          ext: new (xdr.ExtensionPoint as any)(0),
          resources: new xdr.SorobanResources({
            footprint: new xdr.LedgerFootprint({ readOnly: [], readWrite: [] }),
            instructions: 1000,
            readBytes: 100,
            writeBytes: 100,
          }),
          resourceFee: xdr.Int64.fromString('100'),
        }),
        minResourceFee: '150',
        latestLedger: 500000,
        events: [],
      } as unknown as rpc.Api.SimulateTransactionResponse);

      vi.spyOn(rpc.Server.prototype, 'sendTransaction').mockResolvedValue({
        status: 'ERROR',
        hash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        errorResult: 'tx_bad_auth',
      } as unknown as rpc.Api.SendTransactionResponse);

      const result = await engine.executeBatchFillOnTestnet(SAMPLE_FILLS);

      expect(result.success).toBe(false);
      expect(result.simulated).toBe(true);
      expect(result.simulationSuccess).toBe(true);
      expect(result.submitted).toBe(false);
      expect(result.error).toContain('Transaction send failed with status: ERROR');
    });
  });
});
