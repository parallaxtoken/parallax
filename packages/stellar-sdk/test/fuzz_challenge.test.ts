import { describe, expect, it } from 'vitest';
import {
  Account,
  Keypair,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import {
  Issuer,
  OrderStatus,
  PARALLAX_BOOK_TESTNET,
  ParallaxBookClient,
  Side,
  USDC_SAC_TESTNET,
  WRAPPER_REGISTRY_TESTNET,
  WrapperRegistryClient,
  addressToScVal,
  bytesToScVal,
  deserializeFillArgs,
  deserializeFillArgsVec,
  deserializeOrder,
  deserializeWrapper,
  i128ToScVal,
  scValToAddress,
  serializeFillArgs,
  serializeFillArgsVec,
  serializeOrder,
  serializeWrapper,
  symbolToScVal,
  u32ToScVal,
  u64ToScVal,
  type FillArgs,
  type Order,
  type Wrapper,
} from '../src/index.js';

describe('Adversarial Challenge: Soroban RPC Contract Bindings & ScVal Serializers', () => {
  // Extreme boundaries
  const MAX_UINT64 = 18_446_744_073_709_551_615n; // 2^64 - 1
  const MAX_UINT32 = 4_294_967_295; // 2^32 - 1
  const TEN_BILLION_STROOPS = 100_000_000_000_000_000n; // $10B in 7-decimal USDC stroops (10^17)
  const TEN_BILLION_WAD = 10_000_000_000_000_000_000_000_000_000n; // $10B in 18-decimal WAD (10^28)
  const MAX_I128 = (1n << 127n) - 1n;
  const MIN_I128 = -(1n << 127n);

  describe('1. Extreme Input Values & Boundary Testing', () => {
    it('preserves exact 64-bit uint64 boundaries without precision loss', () => {
      const testU64s = [
        0n,
        1n,
        4294967295n, // 2^32 - 1
        4294967296n, // 2^32
        9007199254740991n, // Number.MAX_SAFE_INTEGER
        9007199254740992n, // Exceeds Number.MAX_SAFE_INTEGER
        (1n << 63n) - 1n,  // Max signed int64
        1n << 63n,
        MAX_UINT64,        // Max unsigned int64 (2^64 - 1)
      ];

      for (const val of testU64s) {
        const scv = u64ToScVal(val);
        expect(scv.type).toBe('scvU64');

        // Test XDR binary round-trip
        const xdrBytes = scv.toXDR();
        const restoredScv = xdr.ScVal.fromXDR(xdrBytes);
        const nativeVal = BigInt(scValToNative(restoredScv));

        expect(nativeVal).toBe(val);
        expect(nativeVal.toString()).toBe(val.toString());
      }
    });

    it('preserves exact 128-bit integer boundaries ($10B stroops, $10B WAD, max i128)', () => {
      const testI128s = [
        MIN_I128,
        -TEN_BILLION_WAD,
        -TEN_BILLION_STROOPS,
        -1n,
        0n,
        1n,
        TEN_BILLION_STROOPS, // $10B in USDC stroops (10^17)
        TEN_BILLION_WAD,     // $10B in WAD (10^28)
        MAX_I128,
      ];

      for (const val of testI128s) {
        const scv = i128ToScVal(val);
        expect(scv.type).toBe('scvI128');

        // XDR binary round-trip
        const xdrBytes = scv.toXDR();
        const restoredScv = xdr.ScVal.fromXDR(xdrBytes);
        const nativeVal = BigInt(scValToNative(restoredScv));

        expect(nativeVal).toBe(val);
        expect(nativeVal.toString()).toBe(val.toString());
      }
    });

    it('preserves exact 32-bit unsigned boundaries (wrapper masks, indices)', () => {
      const testU32s = [
        0,
        1,
        255,
        65535,
        2147483647, // 2^31 - 1
        2147483648, // 2^31
        MAX_UINT32, // 2^32 - 1 (0xffffffff)
      ];

      for (const val of testU32s) {
        const scv = u32ToScVal(val);
        expect(scv.type).toBe('scvU32');

        const xdrBytes = scv.toXDR();
        const restoredScv = xdr.ScVal.fromXDR(xdrBytes);
        const nativeVal = Number(scValToNative(restoredScv));

        expect(nativeVal).toBe(val);
      }
    });

    it('rejects out-of-range inputs appropriately', () => {
      // u64 cannot be negative
      expect(() => u64ToScVal(-1n)).toThrow();

      // u64 cannot exceed 2^64 - 1
      expect(() => u64ToScVal(MAX_UINT64 + 1n)).toThrow();

      // i128 cannot exceed max i128
      expect(() => i128ToScVal(MAX_I128 + 1n)).toThrow();
    });
  });

  describe('2. ScVal Serialization Round-Trips', () => {
    const dummyAccount = Keypair.random().publicKey();
    const dummyContract = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';

    it('round-trips standard, zero, and extreme $10B Order structs through ScVal & XDR', () => {
      const ordersToTest: Order[] = [
        // Standard Buy Order
        {
          id: 1n,
          owner: dummyAccount,
          side: Side.Buy,
          status: OrderStatus.Open,
          wrapperMask: 0b11111,
          deadline: 1750000000n,
          tickerId: 'NVDA',
          amount: 145_0000000n,
          limit: 1_000000000000000000n,
        },
        // Standard Sell Order
        {
          id: 2n,
          owner: dummyContract,
          side: Side.Sell,
          status: OrderStatus.Filled,
          wrapperMask: 1,
          deadline: 1800000000n,
          tickerId: 'AAPL',
          amount: 50_000000000000000000n,
          limit: 220_0000000n,
        },
        // All Zeros Order
        {
          id: 0n,
          owner: dummyAccount,
          side: Side.Buy,
          status: OrderStatus.Open,
          wrapperMask: 0,
          deadline: 0n,
          tickerId: 'ZERO',
          amount: 0n,
          limit: 0n,
        },
        // Extreme $10B Order with MAX_UINT64 ID & Deadline
        {
          id: MAX_UINT64,
          owner: dummyAccount,
          side: Side.Buy,
          status: OrderStatus.Cancelled,
          wrapperMask: MAX_UINT32,
          deadline: MAX_UINT64,
          tickerId: 'NVDA',
          amount: TEN_BILLION_STROOPS, // $10B USDC (10^17)
          limit: TEN_BILLION_WAD,      // $10B shares WAD (10^28)
        },
      ];

      for (const order of ordersToTest) {
        const scv = serializeOrder(order);
        expect(scv.type).toBe('scvMap');

        // Full XDR serialization round-trip
        const xdrBytes = scv.toXDR();
        const restoredScv = xdr.ScVal.fromXDR(xdrBytes);
        const restored = deserializeOrder(restoredScv);

        expect(restored.id).toBe(order.id);
        expect(restored.owner).toBe(order.owner);
        expect(restored.side).toBe(order.side);
        expect(restored.status).toBe(order.status);
        expect(restored.wrapperMask).toBe(order.wrapperMask);
        expect(restored.deadline).toBe(order.deadline);
        expect(restored.tickerId).toBe(order.tickerId);
        expect(restored.amount).toBe(order.amount);
        expect(restored.limit).toBe(order.limit);
      }
    });

    it('round-trips Wrapper struct across all 5 Issuer enum variants and boolean flags', () => {
      const issuers = [
        Issuer.BStocks,
        Issuer.Ondo,
        Issuer.XStocks,
        Issuer.Benji,
        Issuer.Custom,
      ];

      for (const issuer of issuers) {
        for (const instantOnly of [true, false]) {
          for (const active of [true, false]) {
            const wrapper: Wrapper = {
              token: dummyContract,
              issuer,
              instantOnly,
              active,
            };

            const scv = serializeWrapper(wrapper);
            const xdrBytes = scv.toXDR();
            const restoredScv = xdr.ScVal.fromXDR(xdrBytes);
            const restored = deserializeWrapper(restoredScv);

            expect(restored.token).toBe(wrapper.token);
            expect(restored.issuer).toBe(issuer);
            expect(restored.instantOnly).toBe(instantOnly);
            expect(restored.active).toBe(active);
          }
        }
      }
    });

    it('round-trips FillArgs with diverse routeData types (hex, Uint8Array, Buffer, empty)', () => {
      const testCases: Array<{ name: string; routeData: Uint8Array | Buffer | string }> = [
        { name: 'empty Uint8Array', routeData: new Uint8Array(0) },
        { name: 'empty Buffer', routeData: Buffer.alloc(0) },
        { name: 'hex with 0x prefix', routeData: '0xdeadbeef1234' },
        { name: 'hex without prefix', routeData: 'deadbeef1234' },
        { name: 'raw Uint8Array', routeData: new Uint8Array([0x01, 0x02, 0xff, 0xfe]) },
        { name: 'large buffer (1024 bytes)', routeData: Buffer.alloc(1024, 0xab) },
      ];

      for (const tc of testCases) {
        const fill: FillArgs = {
          orderId: MAX_UINT64,
          wrapperIdx: MAX_UINT32,
          router: dummyContract,
          routeData: tc.routeData,
        };

        const scv = serializeFillArgs(fill);
        const xdrBytes = scv.toXDR();
        const restoredScv = xdr.ScVal.fromXDR(xdrBytes);
        const restored = deserializeFillArgs(restoredScv);

        expect(restored.orderId).toBe(MAX_UINT64);
        expect(restored.wrapperIdx).toBe(MAX_UINT32);
        expect(restored.router).toBe(dummyContract);

        // Convert routeData back to Buffer for comparison
        const origBuf = typeof tc.routeData === 'string'
          ? (tc.routeData.startsWith('0x') ? Buffer.from(tc.routeData.slice(2), 'hex') : Buffer.from(tc.routeData, 'hex'))
          : Buffer.from(tc.routeData);

        const restoredBuf = Buffer.isBuffer(restored.routeData)
          ? restored.routeData
          : Buffer.from(restored.routeData as Uint8Array);

        expect(restoredBuf.equals(origBuf)).toBe(true);
      }
    });

    it('round-trips Vec<FillArgs> with 0, 1, and 50 batched fills', () => {
      const batchCounts = [0, 1, 5, 50];

      for (const count of batchCounts) {
        const fills: FillArgs[] = Array.from({ length: count }, (_, i) => ({
          orderId: BigInt(i + 1),
          wrapperIdx: i % 4,
          router: dummyContract,
          routeData: Buffer.from([i & 0xff]),
        }));

        const vecScv = serializeFillArgsVec(fills);
        expect(vecScv.type).toBe('scvVec');

        const xdrBytes = vecScv.toXDR();
        const restoredScv = xdr.ScVal.fromXDR(xdrBytes);
        const restoredFills = deserializeFillArgsVec(restoredScv);

        expect(restoredFills).toHaveLength(count);
        for (let i = 0; i < count; i++) {
          expect(restoredFills[i]?.orderId).toBe(BigInt(i + 1));
          expect(restoredFills[i]?.wrapperIdx).toBe(i % 4);
          expect(restoredFills[i]?.router).toBe(dummyContract);
        }
      }
    });

    it('round-trips StrKeys and rejects invalid address inputs cleanly', () => {
      const gAddr = Keypair.random().publicKey();
      const cAddr = dummyContract;

      expect(scValToAddress(addressToScVal(gAddr))).toBe(gAddr);
      expect(scValToAddress(addressToScVal(cAddr))).toBe(cAddr);

      // Malformed addresses throw cleanly
      expect(() => addressToScVal('G_INVALID_ADDRESS')).toThrow();
      expect(() => addressToScVal('C_INVALID_CONTRACT')).toThrow();
      expect(() => addressToScVal('')).toThrow();
      expect(() => addressToScVal('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toThrow();
    });
  });

  describe('3. ParallaxBookClient Transaction Builders Verification', () => {
    const userKp = Keypair.random();
    const fillerKp = Keypair.random();
    const client = new ParallaxBookClient({
      contractId: PARALLAX_BOOK_TESTNET,
    });

    it('builds place_buy tx with extreme $10B amount and validates host function call', async () => {
      const tx = await client.buildPlaceBuyTx({
        sourceAccount: userKp.publicKey(),
        sequence: 500n,
        ticker: 'NVDA',
        payAmountUsdcStroops: TEN_BILLION_STROOPS,
        minSharesWad: TEN_BILLION_WAD,
        deadlineSeconds: MAX_UINT64,
        wrapperMask: MAX_UINT32,
        fee: '250',
        timeout: 60,
      });

      expect(tx.operations).toHaveLength(1);
      const op = tx.operations[0]! as any;
      expect(op.type).toBe('invokeHostFunction');

      expect(op.func.type).toBe('hostFunctionTypeInvokeContract');
      const invokeContract = op.func.invokeContract;
      expect(invokeContract.contractAddress).toBeDefined();
      expect(invokeContract.functionName.toString()).toBe('place_buy');

      const args = invokeContract.args;
      expect(args).toHaveLength(6);

      // Verify parameter types and exact fidelity
      expect(scValToAddress(args[0]!)).toBe(userKp.publicKey()); // owner
      expect(scValToNative(args[1]!)).toBe('NVDA');              // ticker_id
      expect(BigInt(scValToNative(args[2]!))).toBe(TEN_BILLION_STROOPS); // pay_amount
      expect(BigInt(scValToNative(args[3]!))).toBe(TEN_BILLION_WAD);     // min_shares
      expect(BigInt(scValToNative(args[4]!))).toBe(MAX_UINT64);          // deadline
      expect(Number(scValToNative(args[5]!))).toBe(MAX_UINT32);          // wrapper_mask

      // Verify transaction headers
      expect(tx.source).toBe(userKp.publicKey());
      expect(tx.sequence).toBe('501');
      expect(tx.fee).toBe('250');
      expect(tx.timeBounds?.maxTime).toBeDefined();
    });

    it('builds place_sell tx with exact parameters and sequence increment', async () => {
      const tx = await client.buildPlaceSellTx({
        sourceAccount: userKp.publicKey(),
        sequence: 501n,
        ticker: 'AAPL',
        sharesWad: 50_000000000000000000n,
        minUsdcPerShare: 225_0000000n,
        deadlineSeconds: 1750000000n,
        wrapperMask: 0b0001,
      });

      expect(tx.operations).toHaveLength(1);
      const op = tx.operations[0]! as any;
      expect(op.type).toBe('invokeHostFunction');

      const invokeContract = op.func.invokeContract;
      expect(invokeContract.functionName.toString()).toBe('place_sell');
      const args = invokeContract.args;
      expect(args).toHaveLength(6);
      expect(scValToAddress(args[0]!)).toBe(userKp.publicKey());
      expect(scValToNative(args[1]!)).toBe('AAPL');
      expect(BigInt(scValToNative(args[2]!))).toBe(50_000000000000000000n);
      expect(BigInt(scValToNative(args[3]!))).toBe(225_0000000n);

      expect(tx.sequence).toBe('502');
    });

    it('builds cancel tx targeting MAX_UINT64 order ID', async () => {
      const tx = await client.buildCancelTx({
        sourceAccount: userKp.publicKey(),
        sequence: 502n,
        orderId: MAX_UINT64,
      });

      expect(tx.operations).toHaveLength(1);
      const op = tx.operations[0]! as any;
      expect(op.type).toBe('invokeHostFunction');
      const invokeContract = op.func.invokeContract;
      expect(invokeContract.functionName.toString()).toBe('cancel');
      const args = invokeContract.args;
      expect(args).toHaveLength(1);
      expect(BigInt(scValToNative(args[0]!))).toBe(MAX_UINT64);
      expect(tx.sequence).toBe('503');
    });

    it('builds fill tx with filler, order ID, wrapper index, router, and route data', async () => {
      const routerContract = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';
      const routeData = '0xdeadbeef';

      const tx = await client.buildFillTx({
        sourceAccount: fillerKp.publicKey(),
        sequence: 700n,
        orderId: MAX_UINT64,
        wrapperIdx: 2,
        router: routerContract,
        routeData,
      });

      expect(tx.operations).toHaveLength(1);
      const op = tx.operations[0]! as any;
      expect(op.type).toBe('invokeHostFunction');
      const invokeContract = op.func.invokeContract;
      expect(invokeContract.functionName.toString()).toBe('fill');
      const args = invokeContract.args;
      expect(args).toHaveLength(5);
      expect(scValToAddress(args[0]!)).toBe(fillerKp.publicKey());
      expect(BigInt(scValToNative(args[1]!))).toBe(MAX_UINT64);
      expect(Number(scValToNative(args[2]!))).toBe(2);
      expect(scValToAddress(args[3]!)).toBe(routerContract);
      expect(tx.sequence).toBe('701');
    });

    it('builds batch_fill tx with 10 batched fills and validates vector encoding', async () => {
      const routerContract = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';
      const fills: FillArgs[] = Array.from({ length: 10 }, (_, i) => ({
        orderId: BigInt(100 + i),
        wrapperIdx: i % 3,
        router: routerContract,
        routeData: `0x0${i}`,
      }));

      const tx = await client.buildBatchFillTx({
        sourceAccount: fillerKp.publicKey(),
        sequence: 701n,
        filler: fillerKp.publicKey(),
        fills,
      });

      expect(tx.operations).toHaveLength(1);
      const op = tx.operations[0]! as any;
      expect(op.type).toBe('invokeHostFunction');
      const invokeContract = op.func.invokeContract;
      expect(invokeContract.functionName.toString()).toBe('batch_fill');
      const args = invokeContract.args;
      expect(args).toHaveLength(2);
      expect(scValToAddress(args[0]!)).toBe(fillerKp.publicKey());

      // Deserialize Vec<FillArgs> parameter from invocation args
      const deserializedFills = deserializeFillArgsVec(args[1]!);
      expect(deserializedFills).toHaveLength(10);
      expect(deserializedFills[0]?.orderId).toBe(100n);
      expect(deserializedFills[9]?.orderId).toBe(109n);
      expect(tx.sequence).toBe('702');
    });
  });

  describe('4. WrapperRegistryClient Transaction Builders Verification', () => {
    const adminKp = Keypair.random();
    const registry = new WrapperRegistryClient({
      contractId: WRAPPER_REGISTRY_TESTNET,
    });
    const tokenAddr = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';

    it('builds add_wrapper tx with all parameters', async () => {
      const tx = await registry.buildAddWrapperTx({
        sourceAccount: adminKp.publicKey(),
        sequence: 10n,
        ticker: 'BENJI',
        token: tokenAddr,
        issuer: Issuer.Benji,
        instantOnly: true,
      });

      expect(tx.operations).toHaveLength(1);
      const op = tx.operations[0]! as any;
      expect(op.type).toBe('invokeHostFunction');
      const invokeContract = op.func.invokeContract;
      expect(invokeContract.functionName.toString()).toBe('add_wrapper');
      const args = invokeContract.args;
      expect(args).toHaveLength(4);
      expect(scValToNative(args[0]!)).toBe('BENJI');
      expect(scValToAddress(args[1]!)).toBe(tokenAddr);
      expect(Number(scValToNative(args[2]!))).toBe(Issuer.Benji);
      expect(Boolean(scValToNative(args[3]!))).toBe(true);
    });

    it('builds set_custom_unit tx with extreme $10B multiplier', async () => {
      const tx = await registry.buildSetCustomUnitTx({
        sourceAccount: adminKp.publicKey(),
        sequence: 11n,
        token: tokenAddr,
        unitWad: TEN_BILLION_WAD,
      });

      expect(tx.operations).toHaveLength(1);
      const op = tx.operations[0]! as any;
      expect(op.type).toBe('invokeHostFunction');
      const invokeContract = op.func.invokeContract;
      expect(invokeContract.functionName.toString()).toBe('set_custom_unit');
      const args = invokeContract.args;
      expect(args).toHaveLength(2);
      expect(scValToAddress(args[0]!)).toBe(tokenAddr);
      expect(BigInt(scValToNative(args[1]!))).toBe(TEN_BILLION_WAD);
    });

    it('builds set_router tx to allowlist / revoke', async () => {
      const tx = await registry.buildSetRouterTx({
        sourceAccount: adminKp.publicKey(),
        sequence: 12n,
        router: tokenAddr,
        allowed: true,
      });

      expect(tx.operations).toHaveLength(1);
      const op = tx.operations[0]! as any;
      expect(op.type).toBe('invokeHostFunction');
      const invokeContract = op.func.invokeContract;
      expect(invokeContract.functionName.toString()).toBe('set_router');
      const args = invokeContract.args;
      expect(args).toHaveLength(2);
      expect(scValToAddress(args[0]!)).toBe(tokenAddr);
      expect(Boolean(scValToNative(args[1]!))).toBe(true);
    });

    it('builds set_token_paused tx', async () => {
      const tx = await registry.buildSetTokenPausedTx({
        sourceAccount: adminKp.publicKey(),
        sequence: 13n,
        token: tokenAddr,
        paused: true,
      });

      expect(tx.operations).toHaveLength(1);
      const op = tx.operations[0]! as any;
      expect(op.type).toBe('invokeHostFunction');
      const invokeContract = op.func.invokeContract;
      expect(invokeContract.functionName.toString()).toBe('set_token_paused');
      const args = invokeContract.args;
      expect(args).toHaveLength(2);
      expect(scValToAddress(args[0]!)).toBe(tokenAddr);
      expect(Boolean(scValToNative(args[1]!))).toBe(true);
    });
  });

  describe('5. Comprehensive Adversarial Fuzzing & Stress Scenarios', () => {
    const userKp = Keypair.random();
    const client = new ParallaxBookClient({
      contractId: PARALLAX_BOOK_TESTNET,
    });
    const registry = new WrapperRegistryClient({
      contractId: WRAPPER_REGISTRY_TESTNET,
    });

    it('handles Account object sourceAccount without network lookup', async () => {
      const sourceAcc = new Account(userKp.publicKey(), '999');
      const tx = await client.buildPlaceBuyTx({
        sourceAccount: sourceAcc,
        ticker: 'TSLA',
        payAmountUsdcStroops: 1000_0000000n,
        minSharesWad: 5_000000000000000000n,
        deadlineSeconds: 1800000000n,
      });

      expect(tx.source).toBe(userKp.publicKey());
      expect(tx.sequence).toBe('1000');
    });

    it('applies default parameters correctly when omitted', async () => {
      const tx = await client.buildPlaceBuyTx({
        sourceAccount: userKp.publicKey(),
        sequence: 1n,
        ticker: 'BENJI',
        payAmountUsdcStroops: 100_0000000n,
        minSharesWad: 100_000000000000000000n,
        deadlineSeconds: 1800000000n,
      });

      const op = tx.operations[0]! as any;
      const args = op.func.invokeContract.args;

      // owner defaults to source account
      expect(scValToAddress(args[0]!)).toBe(userKp.publicKey());
      // wrapperMask defaults to 0xffffffff
      expect(Number(scValToNative(args[5]!))).toBe(MAX_UINT32);
      // fee defaults to 100
      expect(tx.fee).toBe('100');
    });

    it('builds batch_fill with 0 fills without throwing', async () => {
      const tx = await client.buildBatchFillTx({
        sourceAccount: userKp.publicKey(),
        sequence: 10n,
        fills: [],
      });

      expect(tx.operations).toHaveLength(1);
      const op = tx.operations[0]! as any;
      const args = op.func.invokeContract.args;
      const decodedFills = deserializeFillArgsVec(args[1]!);
      expect(decodedFills).toHaveLength(0);
    });

    it('validates Soroban symbol length constraints (max 32 chars) on XDR serialization', () => {
      const valid32 = 'A'.repeat(32);
      const scv32 = symbolToScVal(valid32);
      expect(scValToNative(scv32)).toBe(valid32);
      expect(() => scv32.toXDR()).not.toThrow();

      const invalid33 = 'A'.repeat(33);
      const scv33 = symbolToScVal(invalid33);
      expect(() => scv33.toXDR()).toThrow(/exceeds maximum 32/);
    });

    it('simulates getOrder with extreme $10B order and verifies deserialization', async () => {
      const extremeOrder: Order = {
        id: MAX_UINT64,
        owner: userKp.publicKey(),
        side: Side.Buy,
        status: OrderStatus.Open,
        wrapperMask: MAX_UINT32,
        deadline: MAX_UINT64,
        tickerId: 'NVDA',
        amount: TEN_BILLION_STROOPS,
        limit: TEN_BILLION_WAD,
      };

      const mockServer = {
        simulateTransaction: async () => ({
          transactionData: {},
          result: {
            retval: serializeOrder(extremeOrder),
          },
          latestLedger: 6000000,
        }),
      } as any;

      const testClient = new ParallaxBookClient({ server: mockServer });
      const retrieved = await testClient.getOrder(MAX_UINT64);

      expect(retrieved.id).toBe(MAX_UINT64);
      expect(retrieved.amount).toBe(TEN_BILLION_STROOPS);
      expect(retrieved.limit).toBe(TEN_BILLION_WAD);
      expect(retrieved.wrapperMask).toBe(MAX_UINT32);
    });

    it('simulates getWrapperAt with extreme issuer and verifies deserialization', async () => {
      const extremeWrapper: Wrapper = {
        token: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
        issuer: Issuer.Custom,
        instantOnly: true,
        active: true,
      };

      const mockServer = {
        simulateTransaction: async () => ({
          transactionData: {},
          result: {
            retval: serializeWrapper(extremeWrapper),
          },
          latestLedger: 6000000,
        }),
      } as any;

      const testRegistry = new WrapperRegistryClient({ server: mockServer });
      const retrieved = await testRegistry.getWrapperAt('NVDA', 99);

      expect(retrieved.token).toBe(extremeWrapper.token);
      expect(retrieved.issuer).toBe(Issuer.Custom);
      expect(retrieved.instantOnly).toBe(true);
      expect(retrieved.active).toBe(true);
    });

    it('handles simulation errors gracefully in read methods', async () => {
      const mockFailingServer = {
        simulateTransaction: async () => ({
          error: 'Host error: order does not exist',
        }),
      } as any;

      const testClient = new ParallaxBookClient({ server: mockFailingServer });
      await expect(testClient.getOrder(9999n)).rejects.toThrow(/getOrder\(9999\) simulation failed/);
      await expect(testClient.isPaused()).rejects.toThrow(/isPaused simulation failed/);

      const testRegistry = new WrapperRegistryClient({ server: mockFailingServer });
      await expect(testRegistry.getWrapperCount('NVDA')).rejects.toThrow(/getWrapperCount\(NVDA\) simulation failed/);
      await expect(testRegistry.getWrapperAt('NVDA', 0)).rejects.toThrow(/getWrapperAt\(NVDA, 0\) simulation failed/);
      await expect(testRegistry.getSharesPerToken('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM')).rejects.toThrow(/getSharesPerToken/);
      await expect(testRegistry.isRouter('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM')).rejects.toThrow(/isRouter/);
      await expect(testRegistry.isPaused('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM')).rejects.toThrow(/isPaused/);
    });
  });
});

