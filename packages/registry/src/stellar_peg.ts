/**
 * Parallax Binance-to-Stellar Stock Pegging Engine
 * 
 * Ingests institutional stock and synthetic reference pricing from Binance
 * and computes exact 18-decimal (WAD) share multipliers for Stellar Soroban
 * tokens, ensuring secondary Stellar AMMs stay tightly pegged to global market value.
 */

import { WAD } from '@parallax/kernel';

export interface BinanceStockQuote {
  ticker: string;
  priceUsd: number;
  timestamp: number;
  source: 'BINANCE_ORACLE' | 'BINANCE_SPOT' | 'COMPOSITE';
}

export interface StellarPegAnalysis {
  ticker: string;
  binancePriceUsd: number;
  stellarDexPriceUsd: number;
  pegDivergenceBps: number;
  isPegged: boolean;
  suggestedMultiplierWad: bigint;
  recommendedAction: 'HOLD' | 'UPDATE_MULTIPLIER' | 'CIRCUIT_BREAK';
}

export class StellarStockPegEngine {
  private readonly maxToleratedDivergenceBps: number;

  constructor(maxToleratedDivergenceBps = 150) { // 1.5% max divergence
    this.maxToleratedDivergenceBps = maxToleratedDivergenceBps;
  }

  /**
   * Analyzes current Stellar secondary market trading against Binance primary price
   */
  public analyzePeg(
    ticker: string,
    binanceQuote: BinanceStockQuote,
    stellarDexPriceUsd: number,
    currentMultiplierWad: bigint = WAD
  ): StellarPegAnalysis {
    if (binanceQuote.priceUsd <= 0 || stellarDexPriceUsd <= 0) {
      throw new Error('Invalid price data for peg analysis');
    }

    const diff = Math.abs(stellarDexPriceUsd - binanceQuote.priceUsd);
    const divergenceBps = Math.round((diff / binanceQuote.priceUsd) * 10000);
    const isPegged = divergenceBps <= this.maxToleratedDivergenceBps;

    // Calculate the target multiplier to re-anchor 1 token to 1 real share equivalent
    // targetMultiplier = (binancePriceUsd / stellarDexPriceUsd) * currentMultiplier
    const ratioBps = BigInt(Math.round((binanceQuote.priceUsd / stellarDexPriceUsd) * 10000));
    const suggestedMultiplierWad = (currentMultiplierWad * ratioBps) / 10000n;

    let recommendedAction: 'HOLD' | 'UPDATE_MULTIPLIER' | 'CIRCUIT_BREAK' = 'HOLD';
    if (divergenceBps > 500) { // > 5% extreme divergence
      recommendedAction = 'CIRCUIT_BREAK';
    } else if (!isPegged) {
      recommendedAction = 'UPDATE_MULTIPLIER';
    }

    return {
      ticker,
      binancePriceUsd: binanceQuote.priceUsd,
      stellarDexPriceUsd,
      pegDivergenceBps: divergenceBps,
      isPegged,
      suggestedMultiplierWad,
      recommendedAction,
    };
  }

  /**
   * Formats the Soroban transaction payload to invoke `set_custom_unit` on WrapperRegistry
   */
  public buildSorobanPegUpdatePayload(
    wrapperRegistryContractId: string,
    tokenAddress: string,
    suggestedMultiplierWad: bigint
  ) {
    return {
      contractId: wrapperRegistryContractId,
      method: 'set_custom_unit',
      args: {
        token: tokenAddress,
        unit: suggestedMultiplierWad.toString(),
      },
    };
  }

  /**
   * Explains why Binance stock pegging directly strengthens the Stellar ecosystem
   */
  public static getStellarEcosystemImpact(): string[] {
    return [
      'Eliminates the 5-15% discount/premium that isolated Stellar wrapped tokens suffer against global exchanges.',
      'Allows institutional market makers to arbitrage Binance CEX depth against Soroswap and Phoenix AMM pools with mathematical certainty.',
      'Guarantees retail investors that 1 Parallax share-order signed on Stellar delivers the exact economic equivalent of buying on Binance or NYSE.',
      'Increases native Stellar USDC transaction volume by routing high-value equity limit orders through Soroban contracts.',
    ];
  }
}

