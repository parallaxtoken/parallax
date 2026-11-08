import { describe, expect, it } from 'vitest';
import {
  Account,
  Keypair,
  Networks,
  TransactionBuilder,
  WebAuth,
  nativeToScVal,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import {
  CIRCUIT_BREAKER_DIVERGENCE_BPS,
  DEFAULT_PARALLAX_DOMAIN,
  DEFAULT_SOROBAN_TESTNET_RPC,
  Issuer,
  MAX_PEG_DIVERGENCE_BPS,
  NVDA_TOKEN_TESTNET,
  OrderStatus,
  PARALLAX_BOOK_TESTNET,
  ParallaxBookClient,
  SCALE_STROOP_TO_WAD,
  STELLAR_EQUITY_CATALOG,
  STELLAR_EQUITY_TICKERS,
  STELLAR_TESTNET_PASSPHRASE,
  STROOP,
  Sep10Client,
  Sep38Client,
  Side,
  USDC_SAC_TESTNET,
  WAD,
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
} from '../src/index.js';

describe('@parallax/stellar-sdk', () => {
  describe('Constants & Configuration', () => {
    it('declares valid 56-character Stellar contract addresses', () => {
      expect(PARALLAX_BOOK_TESTNET).toMatch(/^C[A-Z0-9]{55}$/);
      expect(WRAPPER_REGISTRY_TESTNET).toMatch(/^C[A-Z0-9]{55}$/);
      expect(USDC_SAC_TESTNET).toMatch(/^C[A-Z0-9]{55}$/);
    });

    it('contains all 4 equity wrappers in catalog conforming to SAC 7 decimals', () => {
      expect(STELLAR_EQUITY_TICKERS).toEqual(['NVDA', 'AAPL', 'TSLA', 'BENJI']);
      expect(STELLAR_EQUITY_CATALOG).toHaveLength(4);

      for (const item of STELLAR_EQUITY_CATALOG) {
        expect(item.decimals).toBe(7);
        expect(item.tokenAddress).toMatch(/^C[A-Z0-9]{55}$/);
        expect(item.active).toBe(true);
      }
    });

    it('declares correct mathematical constants for stroop to wad normalization', () => {
      expect(STROOP).toBe(10_000_000n);
      expect(WAD).toBe(1_000_000_000_000_000_000n);
      expect(SCALE_STROOP_TO_WAD).toBe(100_000_000_000n);
      expect(STROOP * SCALE_STROOP_TO_WAD).toBe(WAD);
      expect(MAX_PEG_DIVERGENCE_BPS).toBe(250);
      expect(CIRCUIT_BREAKER_DIVERGENCE_BPS).toBe(500);
    });
  });

  describe('Soroban ScVal Serializers', () => {
    it('round-trips contract and account addresses correctly', () => {
      const contractAddr = PARALLAX_BOOK_TESTNET;
      const scvContract = addressToScVal(contractAddr);
      expect(scValToAddress(scvContract)).toBe(contractAddr);

      const accountKp = Keypair.random();
      const scvAccount = addressToScVal(accountKp.publicKey());
      expect(scValToAddress(scvAccount)).toBe(accountKp.publicKey());
    });

    it('serializes primitive ScVal types', () => {
      expect(symbolToScVal('NVDA').type).toBe('scvSymbol');
      expect(i128ToScVal(1000n).type).toBe('scvI128');
      expect(u64ToScVal(42n).type).toBe('scvU64');
      expect(u32ToScVal(5).type).toBe('scvU32');
    });

    it('serializes bytes from hex string and Uint8Array', () => {
      const hexScVal = bytesToScVal('0xdeadbeef');
      expect(hexScVal.type).toBe('scvBytes');

      const rawBytes = new Uint8Array([1, 2, 3, 4]);
      const bytesScVal = bytesToScVal(rawBytes);
      expect(bytesScVal.type).toBe('scvBytes');
    });

    it('round-trips Order struct through ScVal serialization', () => {
      const dummyOwner = Keypair.random().publicKey();
      const order = {
        id: 101n,
        owner: dummyOwner,
        side: Side.Buy,
        status: OrderStatus.Open,
        wrapperMask: 1,
        deadline: 1750000000n,
        tickerId: 'NVDA',
        amount: 145_0000000n,
        limit: 1_000000000000000000n,
      };

      const scVal = serializeOrder(order);
      expect(scVal.type).toBe('scvMap');

      const deserialized = deserializeOrder(scVal);
      expect(deserialized.id).toBe(order.id);
      expect(deserialized.owner).toBe(order.owner);
      expect(deserialized.side).toBe(Side.Buy);
      expect(deserialized.status).toBe(OrderStatus.Open);
      expect(deserialized.wrapperMask).toBe(1);
      expect(deserialized.deadline).toBe(order.deadline);
      expect(deserialized.tickerId).toBe('NVDA');
      expect(deserialized.amount).toBe(order.amount);
      expect(deserialized.limit).toBe(order.limit);
    });

    it('round-trips Wrapper struct through ScVal serialization', () => {
      const wrapper = {
        token: NVDA_TOKEN_TESTNET,
        issuer: Issuer.BStocks,
        instantOnly: false,
        active: true,
      };

      const scVal = serializeWrapper(wrapper);
      expect(scVal.type).toBe('scvMap');

      const deserialized = deserializeWrapper(scVal);
      expect(deserialized.token).toBe(wrapper.token);
      expect(deserialized.issuer).toBe(Issuer.BStocks);
      expect(deserialized.instantOnly).toBe(false);
      expect(deserialized.active).toBe(true);
    });

    it('round-trips FillArgs struct and Vec<FillArgs> through ScVal', () => {
      const fill = {
        orderId: 201n,
        wrapperIdx: 0,
        router: PARALLAX_BOOK_TESTNET,
        routeData: new Uint8Array([0xaa, 0xbb]),
      };

      const scVal = serializeFillArgs(fill);
      const deserialized = deserializeFillArgs(scVal);
      expect(deserialized.orderId).toBe(201n);
      expect(deserialized.wrapperIdx).toBe(0);
      expect(deserialized.router).toBe(PARALLAX_BOOK_TESTNET);

      const vecScVal = serializeFillArgsVec([fill]);
      expect(vecScVal.type).toBe('scvVec');

      const deserializedList = deserializeFillArgsVec(vecScVal);
      expect(deserializedList).toHaveLength(1);
      expect(deserializedList[0]?.orderId).toBe(201n);
    });
  });

  describe('ParallaxBookClient Transaction Builders', () => {
    const userKp = Keypair.random();
    const client = new ParallaxBookClient({
      networkPassphrase: STELLAR_TESTNET_PASSPHRASE,
      contractId: PARALLAX_BOOK_TESTNET,
    });

    it('builds place_buy transaction with correct invocation footprint', async () => {
      const tx = await client.buildPlaceBuyTx({
        sourceAccount: userKp.publicKey(),
        sequence: 100n,
        ticker: 'NVDA',
        payAmountUsdcStroops: 145_0000000n,
        minSharesWad: 1_000000000000000000n,
        deadlineSeconds: 1750000000n,
        wrapperMask: 1,
      });

      expect(tx.operations).toHaveLength(1);
      expect(tx.source).toBe(userKp.publicKey());
      expect(tx.sequence).toBe('101');
      expect(tx.networkPassphrase).toBe(STELLAR_TESTNET_PASSPHRASE);
    });

    it('builds place_sell transaction with correct parameters', async () => {
      const tx = await client.buildPlaceSellTx({
        sourceAccount: userKp.publicKey(),
        sequence: 101n,
        ticker: 'AAPL',
        sharesWad: 1_000000000000000000n,
        minUsdcPerShare: 220_0000000n,
        deadlineSeconds: 1750000000n,
      });

      expect(tx.operations).toHaveLength(1);
      expect(tx.sequence).toBe('102');
    });

    it('builds cancel transaction with target order ID', async () => {
      const tx = await client.buildCancelTx({
        sourceAccount: userKp.publicKey(),
        sequence: 102n,
        orderId: 101n,
      });

      expect(tx.operations).toHaveLength(1);
      expect(tx.sequence).toBe('103');
    });

    it('builds fill transaction for single order execution', async () => {
      const fillerKp = Keypair.random();
      const tx = await client.buildFillTx({
        sourceAccount: fillerKp.publicKey(),
        sequence: 50n,
        orderId: 101n,
        wrapperIdx: 0,
        router: PARALLAX_BOOK_TESTNET,
        routeData: '0x1234',
      });

      expect(tx.operations).toHaveLength(1);
      expect(tx.source).toBe(fillerKp.publicKey());
      expect(tx.sequence).toBe('51');
    });

    it('builds batch_fill transaction aggregating multiple orders', async () => {
      const fillerKp = Keypair.random();
      const fills = [
        {
          orderId: 101n,
          wrapperIdx: 0,
          router: PARALLAX_BOOK_TESTNET,
          routeData: '0x01',
        },
        {
          orderId: 102n,
          wrapperIdx: 1,
          router: PARALLAX_BOOK_TESTNET,
          routeData: '0x02',
        },
      ];

      const tx = await client.buildBatchFillTx({
        sourceAccount: fillerKp.publicKey(),
        sequence: 51n,
        fills,
      });

      expect(tx.operations).toHaveLength(1);
      expect(tx.sequence).toBe('52');
    });

    it('executes simulation query with mock server', async () => {
      const mockServer = {
        simulateTransaction: async () => ({
          transactionData: {},
          result: {
            retval: nativeToScVal(false, { type: 'bool' }),
          },
          latestLedger: 5625000,
        }),
      } as unknown as rpc.Server;

      const testClient = new ParallaxBookClient({
        server: mockServer,
      });

      const paused = await testClient.isPaused();
      expect(paused).toBe(false);
    });

    it('executes getOrder simulation query with mock server', async () => {
      const dummyOwner = Keypair.random().publicKey();
      const mockOrder = {
        id: 101n,
        owner: dummyOwner,
        side: Side.Buy,
        status: OrderStatus.Open,
        wrapperMask: 1,
        deadline: 1750000000n,
        tickerId: 'NVDA',
        amount: 145_0000000n,
        limit: 1_000000000000000000n,
      };

      const mockServer = {
        simulateTransaction: async () => ({
          transactionData: {},
          result: {
            retval: serializeOrder(mockOrder),
          },
          latestLedger: 5625000,
        }),
      } as unknown as rpc.Server;

      const testClient = new ParallaxBookClient({ server: mockServer });
      const order = await testClient.getOrder(101n);
      expect(order.id).toBe(101n);
      expect(order.tickerId).toBe('NVDA');
      expect(order.amount).toBe(145_0000000n);
    });
  });

  describe('WrapperRegistryClient Transaction Builders', () => {
    const adminKp = Keypair.random();
    const registry = new WrapperRegistryClient({
      networkPassphrase: STELLAR_TESTNET_PASSPHRASE,
      contractId: WRAPPER_REGISTRY_TESTNET,
    });

    it('builds add_wrapper transaction', async () => {
      const tx = await registry.buildAddWrapperTx({
        sourceAccount: adminKp.publicKey(),
        sequence: 200n,
        ticker: 'NVDA',
        token: NVDA_TOKEN_TESTNET,
        issuer: Issuer.BStocks,
        instantOnly: false,
      });

      expect(tx.operations).toHaveLength(1);
      expect(tx.source).toBe(adminKp.publicKey());
    });

    it('builds set_wrapper_active transaction', async () => {
      const tx = await registry.buildSetWrapperActiveTx({
        sourceAccount: adminKp.publicKey(),
        sequence: 201n,
        ticker: 'NVDA',
        index: 0,
        active: false,
      });

      expect(tx.operations).toHaveLength(1);
    });

    it('builds set_custom_unit transaction for peg re-anchoring', async () => {
      const tx = await registry.buildSetCustomUnitTx({
        sourceAccount: adminKp.publicKey(),
        sequence: 202n,
        token: NVDA_TOKEN_TESTNET,
        unitWad: 1_020000000000000000n, // +2.0% peg adjustment
      });

      expect(tx.operations).toHaveLength(1);
    });

    it('builds set_router transaction to allowlist DEX router', async () => {
      const tx = await registry.buildSetRouterTx({
        sourceAccount: adminKp.publicKey(),
        sequence: 203n,
        router: PARALLAX_BOOK_TESTNET,
        allowed: true,
      });

      expect(tx.operations).toHaveLength(1);
    });

    it('builds set_token_paused transaction', async () => {
      const tx = await registry.buildSetTokenPausedTx({
        sourceAccount: adminKp.publicKey(),
        sequence: 204n,
        token: NVDA_TOKEN_TESTNET,
        paused: true,
      });

      expect(tx.operations).toHaveLength(1);
    });

    it('executes wrapper_count simulation with mock server', async () => {
      const mockServer = {
        simulateTransaction: async () => ({
          transactionData: {},
          result: {
            retval: nativeToScVal(4, { type: 'u32' }),
          },
          latestLedger: 5625000,
        }),
      } as unknown as rpc.Server;

      const testRegistry = new WrapperRegistryClient({
        server: mockServer,
      });

      const count = await testRegistry.getWrapperCount('NVDA');
      expect(count).toBe(4);
    });

    it('executes getSharesPerToken simulation with mock server', async () => {
      const mockServer = {
        simulateTransaction: async () => ({
          transactionData: {},
          result: {
            retval: nativeToScVal(1_050000000000000000n, { type: 'i128' }),
          },
          latestLedger: 5625000,
        }),
      } as unknown as rpc.Server;

      const testRegistry = new WrapperRegistryClient({ server: mockServer });
      const unit = await testRegistry.getSharesPerToken(NVDA_TOKEN_TESTNET);
      expect(unit).toBe(1_050000000000000000n);
    });
  });

  describe('SEP-10 WebAuth Client', () => {
    const serverKp = Keypair.random();
    const clientKp = Keypair.random();
    const domain = 'parallax.finance';

    it('parses genuine challenge transaction XDR and validates parameters', () => {
      const challengeXdr = WebAuth.buildChallengeTx(
        serverKp,
        clientKp.publicKey(),
        domain,
        300,
        Networks.TESTNET,
        domain
      );

      const sep10 = new Sep10Client({
        webAuthEndpoint: 'https://auth.parallax.finance/auth',
        serverSigningKey: serverKp.publicKey(),
        homeDomain: domain,
        webAuthDomain: domain,
        networkPassphrase: Networks.TESTNET,
      });

      const parsed = sep10.parseChallenge(challengeXdr);
      expect(parsed.clientAccountId).toBe(clientKp.publicKey());
      expect(parsed.homeDomain).toBe(domain);
      expect(parsed.maxTime - parsed.minTime).toBe(300);
    });

    it('signs challenge with secret key and cryptographically validates signers', () => {
      const challengeXdr = WebAuth.buildChallengeTx(
        serverKp,
        clientKp.publicKey(),
        domain,
        300,
        Networks.TESTNET,
        domain
      );

      const sep10 = new Sep10Client({
        webAuthEndpoint: 'https://auth.parallax.finance/auth',
        serverSigningKey: serverKp.publicKey(),
        homeDomain: domain,
        networkPassphrase: Networks.TESTNET,
      });

      const signedXdr = sep10.signChallengeWithSecret(challengeXdr, clientKp.secret());

      // Validate signature against server and client public keys
      const signers = WebAuth.verifyChallengeTxSigners(
        signedXdr,
        serverKp.publicKey(),
        Networks.TESTNET,
        [clientKp.publicKey()],
        domain,
        domain
      );

      expect(signers).toContain(clientKp.publicKey());
    });

    it('detects when Freighter wallet is unavailable in Node/SSR environment', async () => {
      const sep10 = new Sep10Client({
        webAuthEndpoint: 'https://auth.parallax.finance/auth',
        serverSigningKey: serverKp.publicKey(),
      });

      await expect(sep10.signChallengeWithFreighter('fakeXdr')).rejects.toThrow(
        /Freighter wallet is not available/
      );
    });

    it('decodes JWT claims and detects expired tokens', () => {
      const sep10 = new Sep10Client({
        webAuthEndpoint: 'https://auth.parallax.finance/auth',
        serverSigningKey: serverKp.publicKey(),
      });

      const now = Math.floor(Date.now() / 1000);
      const validPayload = Buffer.from(
        JSON.stringify({
          sub: clientKp.publicKey(),
          iss: 'https://auth.parallax.finance/auth',
          iat: now - 100,
          exp: now + 3600,
        })
      ).toString('base64url');

      const validToken = `header.${validPayload}.signature`;
      const claims = sep10.verifyJwt(validToken);
      expect(claims.sub).toBe(clientKp.publicKey());

      const expiredPayload = Buffer.from(
        JSON.stringify({
          sub: clientKp.publicKey(),
          iss: 'https://auth.parallax.finance/auth',
          iat: now - 3600,
          exp: now - 100,
        })
      ).toString('base64url');

      const expiredToken = `header.${expiredPayload}.signature`;
      expect(() => sep10.verifyJwt(expiredToken)).toThrow(/JWT token has expired/);
    });
  });

  describe('SEP-38 Anchor RFQ & Peg Engine Client', () => {
    it('queries asset catalog info via getInfo', async () => {
      const mockFetch = async () =>
        new Response(
          JSON.stringify({
            assets: [
              { asset: 'stellar:USDC:CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA' },
              { asset: 'stellar:bNVDA:CBG4XKLKV4TPIBCVR5HM4HZG3CSNJPQ3EEYNAXRYJKAXKKP2PYCDOTNG' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

      const client = new Sep38Client({
        quoteServer: 'https://quotes.parallax.finance',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const info = await client.getInfo();
      expect(info.assets).toHaveLength(2);
    });

    it('requests firm binding RFQ quote with bearer auth header', async () => {
      let capturedHeader = '';
      const mockFetch = async (_url: unknown, opts?: RequestInit) => {
        capturedHeader = (opts?.headers as Record<string, string>)?.Authorization ?? '';
        return new Response(
          JSON.stringify({
            id: 'quote-101',
            expires_at: '2026-11-08T20:00:00Z',
            total_price: '145.20',
            price: '145.00',
            sell_asset: 'USDC',
            sell_amount: '145.20',
            buy_asset: 'bNVDA',
            buy_amount: '1.0',
            fee: { total: '0.20', asset: 'USDC' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const client = new Sep38Client({
        quoteServer: 'https://quotes.parallax.finance',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const quote = await client.requestFirmQuote('sample-jwt-token', {
        sellAsset: 'USDC',
        buyAsset: 'bNVDA',
        sellAmount: '145.20',
      });

      expect(capturedHeader).toBe('Bearer sample-jwt-token');
      expect(quote.id).toBe('quote-101');
      expect(quote.price).toBe('145.00');
    });

    it('evaluates normal peg within 250 bps threshold (action = HOLD)', async () => {
      const client = new Sep38Client({ quoteServer: 'https://quotes.parallax.finance' });

      const quote = await client.fetchPeggedQuote({
        ticker: 'NVDA',
        sellAmountUsdc: '145.00',
        binanceRefPriceUsd: 145.0,
        simulatedDexPriceUsd: 145.5, // ~34 bps divergence
      });

      expect(quote.isPegged).toBe(true);
      expect(quote.circuitBreakerTripped).toBe(false);
      expect(quote.action).toBe('HOLD');
      expect(quote.pegDivergenceBps).toBeLessThan(MAX_PEG_DIVERGENCE_BPS);
      expect(quote.estimatedSharesWad).toBeGreaterThan(0n);
    });

    it('detects moderate peg drift exceeding 250 bps (action = UPDATE_MULTIPLIER)', async () => {
      const client = new Sep38Client({ quoteServer: 'https://quotes.parallax.finance' });

      const quote = await client.fetchPeggedQuote({
        ticker: 'AAPL',
        sellAmountUsdc: '220.00',
        binanceRefPriceUsd: 220.0,
        simulatedDexPriceUsd: 228.0, // ~364 bps divergence (> 250 bps, < 500 bps)
      });

      expect(quote.isPegged).toBe(false);
      expect(quote.circuitBreakerTripped).toBe(false);
      expect(quote.action).toBe('UPDATE_MULTIPLIER');
      expect(quote.suggestedMultiplierWad).not.toBe(WAD);
    });

    it('trips circuit breaker upon extreme divergence exceeding 500 bps', async () => {
      const client = new Sep38Client({ quoteServer: 'https://quotes.parallax.finance' });

      const quote = await client.fetchPeggedQuote({
        ticker: 'TSLA',
        sellAmountUsdc: '300.00',
        binanceRefPriceUsd: 300.0,
        simulatedDexPriceUsd: 330.0, // 1000 bps divergence (10%)
      });

      expect(quote.isPegged).toBe(false);
      expect(quote.circuitBreakerTripped).toBe(true);
      expect(quote.action).toBe('CIRCUIT_BREAK');
    });

    it('enforces fixed $1.0000 stable NAV parity invariant for BENJI', async () => {
      const client = new Sep38Client({ quoteServer: 'https://quotes.parallax.finance' });

      const quote = await client.fetchPeggedQuote({
        ticker: 'BENJI',
        sellAmountUsdc: '100.00',
        binanceRefPriceUsd: 999.0, // Any external price input is overridden to 1.0000
        simulatedDexPriceUsd: 1.0,
      });

      expect(quote.binanceRefPriceUsd).toBe(1.0);
      expect(quote.stellarDexPriceUsd).toBe(1.0);
      expect(quote.pegDivergenceBps).toBe(0);
      expect(quote.isPegged).toBe(true);
      expect(quote.action).toBe('HOLD');
      expect(quote.estimatedSharesWad).toBe(100n * WAD);
    });
  });
});
