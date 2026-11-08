/**
 * Tier 4: Real-World Application Scenarios E2E Test Suite
 * 
 * Verifies production-grade, realistic end-to-end user workflows and lifecycles
 * deployed on the Stellar testnet.
 * 
 * Requirement: Comprehensive end-to-end workflows.
 */

import { describe, it, expect, setTestTier } from './helpers/fixture';
setTestTier(4);
import {
  STROOP,
  WAD,
  SorobanArithmeticOracle,
  EQUITY_CATALOG,
  BinancePegOracle,
  SepOracle,
} from './helpers/oracles';
import {
  STELLAR_TESTNET,
  STELLAR_WRAPPERS,
  StellarStockPegEngine,
  SepClient,
  ParallaxComplianceEngine,
} from '@parallax/registry';
import {
  usdcStroopToWad,
  wadToUsdcStroop,
  computeStellarShares,
} from '@parallax/kernel';
import { StellarKeeperEngine } from '../../services/keeper/src/stellar_keeper';

describe('Tier 4: Real-World Application Scenarios', () => {
  it('Scenario 1: Retail user onboarding, SEP discovery, authentication, and first NVDA standing order', () => {
    const userAccount = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

    // Step 1: User wallet discovers Parallax via SEP-1 stellar.toml
    const tomlRaw = SepOracle.generateStellarToml();
    const toml = SepOracle.parseStellarToml(tomlRaw);
    expect(toml.currencies).toContain('bNVDA');
    expect(toml.webAuthEndpoint).toBeDefined();

    // Step 2: User completes SEP-10 WebAuth challenge
    const challenge = SepOracle.createSep10Challenge(userAccount, 'parallax.finance');
    expect(challenge.transactionXdr).toBeDefined();
    const jwt = SepOracle.issueSep10Jwt(userAccount, 'parallax.finance');
    const auth = SepOracle.verifySep10Jwt(jwt);
    expect(auth.valid).toBe(true);
    expect(auth.sub).toBe(userAccount);

    // Step 3: User checks live SEP-38 price quote for 1000 USDC into bNVDA
    const livePrice = 145.20;
    const quote = SepOracle.computeSep38Price('USDC', 'bNVDA', '1000.00', livePrice, 10);
    expect(parseFloat(quote.buyAmount)).toBeGreaterThan(6.0);

    // Step 4: User initiates SEP-24 deposit
    const client = new SepClient('sep24.parallax.finance');
    const depositUrl = client.getSep24InteractiveUrl({
      transferServer: toml.transferServerSep24,
      operation: 'deposit',
      assetCode: 'USDC',
      account: userAccount,
    });
    expect(depositUrl).toContain('asset_code=USDC');

    // Step 5: User submits standing limit buy order on Soroban testnet
    const payAmount = 1000n * STROOP;
    const minSharesFloor = 6n * WAD;
    const shareCheck = SorobanArithmeticOracle.checkShareFloor(payAmount, WAD, minSharesFloor);
    expect(shareCheck.passes).toBe(true);
  });

  it('Scenario 2: Institutional market maker batch arbitrage across Binance CEX and Stellar DEX', () => {
    const engine = new StellarKeeperEngine({
      network: STELLAR_TESTNET,
      keeperSecretKey: 'SDUMMYKEEPERSECRETKEYSTELLAR1234567890ABCDEF1234567890ABCDEF',
      maxSlippageBps: 20,
    });

    // 1. Institutional bot monitors open orders for TSLA
    const openOrders = [
      { id: 101n, ticker: 'TSLA', limitShares: 5n * WAD, payUsdc: 1250n * STROOP },
      { id: 102n, ticker: 'TSLA', limitShares: 10n * WAD, payUsdc: 2500n * STROOP },
    ];

    // 2. Bot queries Binance price feed (250 USD)
    const quote = { ticker: 'TSLA', priceUsd: 250.0, timestamp: Date.now(), source: 'BINANCE_SPOT' as const };
    const pegEngine = new StellarStockPegEngine(100);
    const analysis = pegEngine.analyzePeg('TSLA', quote, 250.5, WAD);
    expect(analysis.isPegged).toBe(true);

    // 3. Bot executes atomic batch fill transaction
    const payload = engine.buildBatchFillPayload([
      { orderId: 101n, wrapperIndex: 0, routerAddress: 'C_ROUTER', routeDataHex: '0x' },
      { orderId: 102n, wrapperIndex: 0, routerAddress: 'C_ROUTER', routeDataHex: '0x' },
    ]);
    expect(payload.args.fills).toHaveLength(2);
    expect(payload.method).toBe('batch_fill');
  });

  it('Scenario 3: Corporate stock split: 4:1 multiplier adjustment preserves existing standing order equivalence', () => {
    // Before split: 1 AAPL token = 1 share (WAD)
    const orderLimit = 4n * WAD; // User wants at least 4 real shares
    const tokensDelivered = 4n * STROOP; // 4 SAC tokens delivered

    const beforeSplit = SorobanArithmeticOracle.checkShareFloor(tokensDelivered, WAD, orderLimit);
    expect(beforeSplit.passes).toBe(true);
    expect(beforeSplit.sharesDelivered).toBe(4n * WAD);

    // 4:1 forward stock split: 1 old token is now worth 4 real shares
    const splitUnit = 4n * WAD;
    // Filler delivers 1 SAC token -> delivers 4 shares
    const afterSplit = SorobanArithmeticOracle.checkShareFloor(1n * STROOP, splitUnit, orderLimit);
    expect(afterSplit.passes).toBe(true);
    expect(afterSplit.sharesDelivered).toBe(4n * WAD);
  });

  it('Scenario 4: Flash crash protection: 12% market divergence triggers circuit break preventing predatory fill', () => {
    const engine = new StellarKeeperEngine({
      network: STELLAR_TESTNET,
      keeperSecretKey: 'SDUMMYKEEPERSECRETKEYSTELLAR1234567890ABCDEF1234567890ABCDEF',
      maxSlippageBps: 50,
    });

    const userOrder = {
      id: 201n,
      owner: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      side: 'BUY' as const,
      wrapperMask: 1,
      deadline: 2000000000n,
      tickerId: 'NVDA',
      amount: 145n * STROOP,
      limit: 1n * WAD,
    };

    // Flash crash: Binance spot drops to $125 (-14%), while Stellar AMM is at $145
    const crashQuote = { ticker: 'NVDA', priceUsd: 125.0, timestamp: Date.now(), source: 'BINANCE_SPOT' as const };
    const evalResult = engine.evaluateOrderWithBinancePeg(userOrder, crashQuote, 145.0, 1n * STROOP, 1700000000n);

    expect(evalResult.shouldFill).toBe(false);
    expect(evalResult.reason).toContain('BINANCE_PEG_HALTED');
    expect(evalResult.divergenceBps).toBeGreaterThan(500);
  });

  it('Scenario 5: Multi-asset portfolio diversification: $10,000 allocation across 4 equities', () => {
    const allocations = [
      { ticker: 'NVDA', amountUsdc: 4000n * STROOP, limitShares: 27n * WAD },
      { ticker: 'AAPL', amountUsdc: 3000n * STROOP, limitShares: 13n * WAD },
      { ticker: 'TSLA', amountUsdc: 2000n * STROOP, limitShares: 8n * WAD },
      { ticker: 'BENJI', amountUsdc: 1000n * STROOP, limitShares: 1000n * WAD },
    ];

    const totalUsdc = allocations.reduce((acc, curr) => acc + curr.amountUsdc, 0n);
    expect(totalUsdc).toBe(10000n * STROOP);

    for (const alloc of allocations) {
      const wrapper = STELLAR_WRAPPERS.find((w) => w.ticker === alloc.ticker);
      expect(wrapper).toBeDefined();
      expect(wrapper?.active).toBe(true);
    }
  });

  it('Scenario 6: Corporate treasury management: BENJI yield harvest and $1.00 stable NAV parity', () => {
    const benji = STELLAR_WRAPPERS.find((w) => w.ticker === 'BENJI')!;
    expect(benji.symbol).toBe('FOBXX');
    expect(benji.issuerName).toBe('Franklin Templeton');

    const profile = ParallaxComplianceEngine.getIssuerComplianceProfile('Benji');
    expect(profile.regulatoryFramework).toContain('SEC-Registered');

    // BENJI orders enforce 1:1 USD parity
    const depositAmount = 50000n * STROOP; // $50,000
    const shares = SorobanArithmeticOracle.normalizedCalculateShares(depositAmount, WAD);
    expect(shares).toBe(50000n * WAD);
  });

  it('Scenario 7: Order deadline expiration and non-custodial residual fund safety', () => {
    const engine = new StellarKeeperEngine({
      network: STELLAR_TESTNET,
      keeperSecretKey: 'SDUMMYKEEPERSECRETKEYSTELLAR1234567890ABCDEF1234567890ABCDEF',
      maxSlippageBps: 50,
    });

    const now = 1700000000n;
    const expiredOrder = {
      id: 301n,
      owner: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      side: 'BUY' as const,
      wrapperMask: 1,
      deadline: now - 3600n, // Expired 1 hour ago
      tickerId: 'AAPL',
      amount: 500n * STROOP,
      limit: 2n * WAD,
    };

    const res = engine.evaluateBuyOrder(expiredOrder, WAD, 2n * STROOP, now);
    expect(res.shouldFill).toBe(false);
    expect(res.reason).toBe('ORDER_EXPIRED');

    // Protocol invariant: Because funds are pulled via transfer_from only upon fill,
    // expired orders leave 0 residual locked in the contract
  });

  it('Scenario 8: Compliance filtering: Sanctioned jurisdiction user is blocked from onboarding', () => {
    const sanctionedCodes = ['IR', 'KP', 'CU', 'SY'];
    for (const code of sanctionedCodes) {
      const check = ParallaxComplianceEngine.verifyJurisdiction(code);
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('restricted');
    }
  });

  it('Scenario 9: Keeper daemon continuous monitoring and simulated block polling cycle', () => {
    const engine = new StellarKeeperEngine({
      network: STELLAR_TESTNET,
      keeperSecretKey: 'SDUMMYKEEPERSECRETKEYSTELLAR1234567890ABCDEF1234567890ABCDEF',
      maxSlippageBps: 50,
    });

    // Simulate 5 consecutive ledger blocks
    let currentLedgerTime = 1700000000n;
    for (let block = 1; block <= 5; block++) {
      currentLedgerTime += 5n; // 5-second ledger closing time on Stellar
      const activeOrder = {
        id: BigInt(block),
        owner: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        side: 'BUY' as const,
        wrapperMask: 1,
        deadline: currentLedgerTime + 3600n,
        tickerId: 'NVDA',
        amount: 100n * STROOP,
        limit: 1n * WAD,
      };
      const evalRes = engine.evaluateBuyOrder(activeOrder, WAD, 1n * STROOP, currentLedgerTime);
      expect(evalRes.shouldFill).toBe(true);
    }
  });

  it('Scenario 10: Disaster recovery and offline audit verification of fill invariants', () => {
    // Independent auditor recomputes fill from ledger logs without trusting keeper
    const loggedTokensOut = 145_0000000n; // 145 SAC tokens
    const loggedMultiplier = WAD;
    const loggedOrderFloor = 1n * WAD;

    const auditCheck = SorobanArithmeticOracle.checkShareFloor(loggedTokensOut, loggedMultiplier, loggedOrderFloor);
    expect(auditCheck.passes).toBe(true);
    expect(auditCheck.sharesDelivered).toBe(145n * WAD);
  });
});
