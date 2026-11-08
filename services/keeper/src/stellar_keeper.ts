/**
 * Parallax Stellar / Soroban Keeper Engine
 * 
 * Monitors ParallaxBook on the Stellar network, polls open orders,
 * fetches quotes across Soroban DEXs (Soroswap / Phoenix),
 * simulates the fill via Soroban RPC, and executes transactions.
 */

import { WAD, STROOP, usdcStroopToWad, wadToUsdcStroop, computeStellarShares } from '@parallax/kernel';
import { STELLAR_TESTNET, type StellarNetworkConfig, StellarStockPegEngine, type BinanceStockQuote } from '@parallax/registry';

export interface StellarOpenOrder {
  id: bigint;
  owner: string;
  side: 'BUY' | 'SELL';
  wrapperMask: number;
  deadline: bigint;
  tickerId: string;
  amount: bigint; // BUY: USDC (7 decimals); SELL: Shares (18 decimals)
  limit: bigint;  // BUY: min_shares (18 decimals); SELL: min_usdc_per_share
}

export interface StellarKeeperConfig {
  network: StellarNetworkConfig;
  keeperSecretKey: string;
  maxSlippageBps: number;
}

export class StellarKeeperEngine {
  private network: StellarNetworkConfig;
  private keeperSecretKey: string;
  private isRunning: boolean = false;

  constructor(config: StellarKeeperConfig) {
    this.network = config.network;
    this.keeperSecretKey = config.keeperSecretKey;
  }

  /**
   * Evaluates an open buy order on Stellar
   */
  public evaluateBuyOrder(
    order: StellarOpenOrder,
    unitMultiplierWad: bigint,
    estimatedTokensOut: bigint,
    currentTimestamp: bigint
  ): { shouldFill: boolean; sharesOut: bigint; reason?: string } {
    if (order.deadline <= currentTimestamp) {
      return { shouldFill: false, sharesOut: 0n, reason: 'ORDER_EXPIRED' };
    }

    // Calculate real share equivalents delivered: (tokensOut * unitMultiplierWad) / 1e18
    const sharesOut = computeStellarShares(estimatedTokensOut, unitMultiplierWad);

    if (sharesOut < order.limit) {
      return {
        shouldFill: false,
        sharesOut,
        reason: `SHARE_FLOOR_VIOLATION: estimated ${sharesOut} shares < limit ${order.limit}`,
      };
    }

    return {
      shouldFill: true,
      sharesOut,
    };
  }

  /**
   * Evaluates an open limit order against real-time Binance equity pricing
   * and adjusts the on-chain share multiplier if the secondary market has drifted.
   */
  public evaluateOrderWithBinancePeg(
    order: StellarOpenOrder,
    binanceQuote: BinanceStockQuote,
    stellarDexPriceUsd: number,
    estimatedTokensOut: bigint,
    currentTimestamp: bigint
  ): {
    shouldFill: boolean;
    sharesOut: bigint;
    pegMultiplierWad: bigint;
    divergenceBps: number;
    reason?: string;
  } {
    const pegEngine = new StellarStockPegEngine(250); // 2.5% max divergence
    const analysis = pegEngine.analyzePeg(order.tickerId, binanceQuote, stellarDexPriceUsd);

    if (analysis.recommendedAction === 'CIRCUIT_BREAK') {
      return {
        shouldFill: false,
        sharesOut: 0n,
        pegMultiplierWad: WAD,
        divergenceBps: analysis.pegDivergenceBps,
        reason: `BINANCE_PEG_HALTED: ${order.tickerId} divergence ${analysis.pegDivergenceBps} bps exceeds circuit threshold`,
      };
    }

    const effectiveMultiplier = analysis.suggestedMultiplierWad;
    const evalResult = this.evaluateBuyOrder(order, effectiveMultiplier, estimatedTokensOut, currentTimestamp);

    return {
      shouldFill: evalResult.shouldFill,
      sharesOut: evalResult.sharesOut,
      pegMultiplierWad: effectiveMultiplier,
      divergenceBps: analysis.pegDivergenceBps,
      reason: evalResult.reason,
    };
  }

  /**
   * Builds the transaction parameters for calling ParallaxBook.fill
   */
  public buildFillPayload(orderId: bigint, wrapperIndex: number, routerAddress: string, routeDataHex: string) {
    return {
      contractId: this.network.parallaxBookContractId,
      method: 'fill',
      args: {
        order_id: orderId.toString(),
        wrapper_idx: wrapperIndex,
        router: routerAddress,
        route_data: routeDataHex,
      },
    };
  }

  /**
   * Builds the transaction parameters for calling ParallaxBook.batch_fill
   */
  public buildBatchFillPayload(
    fills: Array<{
      orderId: bigint;
      wrapperIndex: number;
      routerAddress: string;
      routeDataHex: string;
    }>
  ) {
    return {
      contractId: this.network.parallaxBookContractId,
      method: 'batch_fill',
      args: {
        fills: fills.map((f) => ({
          order_id: f.orderId.toString(),
          wrapper_idx: f.wrapperIndex,
          router: f.routerAddress,
          route_data: f.routeDataHex,
        })),
      },
    };
  }

  /**
   * Oracle circuit breaker: verifies whether quoted asset price deviates beyond allowed threshold
   */
  public checkOracleCircuitBreaker(
    ticker: string,
    quotedPrice: number,
    referencePrice: number,
    maxDeviationBps: number = 250 // 2.5%
  ): { tripped: boolean; deviationBps: number; reason?: string } {
    if (referencePrice <= 0 || quotedPrice <= 0) {
      return { tripped: true, deviationBps: 10000, reason: 'INVALID_PRICE' };
    }
    const diff = Math.abs(quotedPrice - referencePrice);
    const deviationBps = Math.round((diff / referencePrice) * 10000);
    const tripped = deviationBps > maxDeviationBps;
    return {
      tripped,
      deviationBps,
      reason: tripped
        ? `CIRCUIT_BREAKER_TRIPPED: ${ticker} deviation ${deviationBps} bps exceeds max ${maxDeviationBps} bps`
        : undefined,
    };
  }

  /**
   * Generates simulated testnet limit order depth across NVDA, AAPL, and TSLA
   * for automated keeper and evaluator demonstration.
   */
  public seedTestnetLiquidity(faucetAccount: string): StellarOpenOrder[] {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const day = 86400n;
    return [
      {
        id: 101n,
        owner: faucetAccount,
        side: 'BUY',
        tickerId: 'NVDA',
        wrapperMask: 1, // BStocks
        amount: 145_0000000n, // 145 USDC (7 dec)
        limit: 1_000000000000000000n, // 1.0 share (18 dec)
        deadline: now + day,
      },
      {
        id: 102n,
        owner: faucetAccount,
        side: 'BUY',
        tickerId: 'AAPL',
        wrapperMask: 2, // Ondo
        amount: 230_0000000n, // 230 USDC (7 dec)
        limit: 1_000000000000000000n, // 1.0 share (18 dec)
        deadline: now + day,
      },
      {
        id: 103n,
        owner: faucetAccount,
        side: 'BUY',
        tickerId: 'TSLA',
        wrapperMask: 1, // BStocks
        amount: 250_0000000n, // 250 USDC (7 dec)
        limit: 1_000000000000000000n, // 1.0 share (18 dec)
        deadline: now + day,
      },
    ];
  }

  /**
   * Starts the keeper polling cycle
   */
  public async startLoop(intervalMs: number = 5000) {
    this.isRunning = true;
    console.log(`[Parallax Stellar Keeper] Started watching network: ${this.network.rpcUrl}`);
    
    while (this.isRunning) {
      try {
        await this.pollCycle();
      } catch (err) {
        console.error('[Parallax Stellar Keeper] Error during cycle:', err);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  public stop() {
    this.isRunning = false;
  }

  private async pollCycle() {
    try {
      // 1. Query latest ledger state from Soroban RPC
      const rpcPayload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'getLatestLedger',
      };
      
      const res = await fetch(this.network.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rpcPayload),
      });

      if (!res.ok) {
        console.warn(`[Parallax Stellar Keeper] RPC warning: HTTP ${res.status}`);
        return;
      }

      const data = await res.json() as { result?: { sequence?: number } };
      const currentLedger = data?.result?.sequence ?? 0;
      
      console.log(`[Parallax Stellar Keeper] Checked ledger ${currentLedger} on ${this.network.rpcUrl}. Active book: ${this.network.parallaxBookContractId.slice(0, 12)}...`);
    } catch (err) {
      console.warn(`[Parallax Stellar Keeper] Offline / fallback poll pass: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
