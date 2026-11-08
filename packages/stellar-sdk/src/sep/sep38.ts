/**
 * SEP-38 Anchor RFQ (Request for Quote) & Secondary Market Peg Engine Client
 */

import { computeStellarShares, STROOP, WAD } from '@parallax/kernel';
import {
  CIRCUIT_BREAKER_DIVERGENCE_BPS,
  MAX_PEG_DIVERGENCE_BPS,
} from '../constants.js';
import {
  type PeggedQuoteParams,
  type PeggedQuoteResult,
  type Sep38ClientConfig,
  type Sep38FirmQuoteParams,
  type Sep38FirmQuoteResponse,
  type Sep38InfoResponse,
  type Sep38Price,
  type Sep38PriceParams,
  type Sep38PricesResponse,
} from '../types.js';

export class Sep38Client {
  public readonly quoteServer: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: Sep38ClientConfig) {
    this.quoteServer = config.quoteServer.replace(/\/+$/, '');
    this.fetchFn = config.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * SEP-38 GET /info: Queries anchor quote asset directory and capabilities
   */
  public async getInfo(): Promise<Sep38InfoResponse> {
    const url = `${this.quoteServer}/info`;
    const res = await this.fetchFn(url, {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`SEP-38 GET /info failed with status ${res.status}`);
    }

    return (await res.json()) as Sep38InfoResponse;
  }

  /**
   * SEP-38 GET /prices: Queries indicative prices for exchanging sellAsset for available buy assets
   */
  public async getPrices(sellAsset: string): Promise<Sep38PricesResponse> {
    const url = new URL(`${this.quoteServer}/prices`);
    url.searchParams.set('sell_asset', sellAsset);

    const res = await this.fetchFn(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`SEP-38 GET /prices failed with status ${res.status}`);
    }

    return (await res.json()) as Sep38PricesResponse;
  }

  /**
   * SEP-38 GET /price: Queries single-pair indicative price with fee breakdown
   */
  public async getPrice(params: Sep38PriceParams): Promise<Sep38Price> {
    const url = new URL(`${this.quoteServer}/price`);
    url.searchParams.set('sell_asset', params.sellAsset);
    url.searchParams.set('buy_asset', params.buyAsset);
    if (params.sellAmount) url.searchParams.set('sell_amount', params.sellAmount);
    if (params.buyAmount) url.searchParams.set('buy_amount', params.buyAmount);
    if (params.context) url.searchParams.set('context', params.context);

    const res = await this.fetchFn(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`SEP-38 GET /price failed with status ${res.status}`);
    }

    const raw = (await res.json()) as Record<string, unknown>;
    const feeObj = (raw.fee as Record<string, unknown>) ?? {};

    return {
      totalPrice: String(raw.total_price ?? raw.totalPrice ?? '1.0'),
      price: String(raw.price ?? '1.0'),
      fee: {
        total: String(feeObj.total ?? '0'),
        asset: String(feeObj.asset ?? params.sellAsset),
      },
    };
  }

  /**
   * SEP-38 POST /quote: Submits an authenticated request for a binding firm RFQ quote
   */
  public async requestFirmQuote(
    authToken: string,
    params: Sep38FirmQuoteParams
  ): Promise<Sep38FirmQuoteResponse> {
    const url = `${this.quoteServer}/quote`;
    const body: Record<string, string> = {
      sell_asset: params.sellAsset,
      buy_asset: params.buyAsset,
    };
    if (params.sellAmount) body.sell_amount = params.sellAmount;
    if (params.buyAmount) body.buy_amount = params.buyAmount;
    if (params.expireAfter) body.expire_after = params.expireAfter;

    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`SEP-38 POST /quote failed with status ${res.status}: ${errText}`);
    }

    const raw = (await res.json()) as Record<string, unknown>;
    const feeObj = (raw.fee as Record<string, unknown>) ?? {};

    return {
      id: String(raw.id ?? ''),
      expiresAt: String(raw.expires_at ?? raw.expiresAt ?? ''),
      totalPrice: String(raw.total_price ?? raw.totalPrice ?? '1.0'),
      price: String(raw.price ?? '1.0'),
      sellAsset: String(raw.sell_asset ?? raw.sellAsset ?? params.sellAsset),
      sellAmount: String(raw.sell_amount ?? raw.sellAmount ?? params.sellAmount ?? '0'),
      buyAsset: String(raw.buy_asset ?? raw.buyAsset ?? params.buyAsset),
      buyAmount: String(raw.buy_amount ?? raw.buyAmount ?? '0'),
      fee: {
        total: String(feeObj.total ?? '0'),
        asset: String(feeObj.asset ?? params.sellAsset),
      },
    };
  }

  /**
   * Secondary market peg calculation:
   * Compares Binance spot equity reference prices with Stellar DEX quotes,
   * calculates peg divergence against 250 bps threshold, checks circuit breakers,
   * and computes real share equivalents delivered.
   */
  public async fetchPeggedQuote(params: PeggedQuoteParams): Promise<PeggedQuoteResult> {
    const ticker = params.ticker.toUpperCase();
    const sellUsdc = parseFloat(params.sellAmountUsdc);
    if (isNaN(sellUsdc) || sellUsdc <= 0) {
      throw new Error(`Invalid sellAmountUsdc: ${params.sellAmountUsdc}`);
    }

    const currentMultiplierWad = params.currentMultiplierWad ?? WAD;

    // Franklin Templeton BENJI maintains a fixed $1.0000 NAV parity invariant
    let binanceRefPriceUsd = params.binanceRefPriceUsd;
    if (ticker === 'BENJI' || ticker === 'FOBXX') {
      binanceRefPriceUsd = 1.0;
    }

    if (binanceRefPriceUsd <= 0) {
      throw new Error(`Invalid binanceRefPriceUsd: ${params.binanceRefPriceUsd}`);
    }

    // Determine Stellar DEX price: query SEP-38 or use simulated/provided DEX price
    let stellarDexPriceUsd = params.simulatedDexPriceUsd;
    if (stellarDexPriceUsd === undefined) {
      try {
        const quote = await this.getPrice({
          sellAsset: 'USDC',
          buyAsset: ticker,
          sellAmount: params.sellAmountUsdc,
        });
        stellarDexPriceUsd = parseFloat(quote.totalPrice);
      } catch {
        // Fall back to reference price if DEX quote server is unreachable offline
        stellarDexPriceUsd = binanceRefPriceUsd;
      }
    }

    if (stellarDexPriceUsd <= 0) {
      throw new Error(`Invalid stellarDexPriceUsd: ${stellarDexPriceUsd}`);
    }

    // Calculate basis points divergence
    const diff = Math.abs(stellarDexPriceUsd - binanceRefPriceUsd);
    const pegDivergenceBps = Math.round((diff / binanceRefPriceUsd) * 10000);

    const isPegged = pegDivergenceBps <= MAX_PEG_DIVERGENCE_BPS;
    const circuitBreakerTripped = pegDivergenceBps > CIRCUIT_BREAKER_DIVERGENCE_BPS;

    // Suggested multiplier to re-anchor 1 token to 1 real share equivalent
    // targetMultiplier = (binancePriceUsd / stellarDexPriceUsd) * currentMultiplier
    const ratioBps = BigInt(Math.round((binanceRefPriceUsd / stellarDexPriceUsd) * 10000));
    const suggestedMultiplierWad = (currentMultiplierWad * ratioBps) / 10000n;

    // Tokens received in 7-decimal Stellar SAC stroops
    const tokensOut = sellUsdc / stellarDexPriceUsd;
    const tokensOutStroop = BigInt(Math.round(tokensOut * Number(STROOP)));

    // Real delivered share units (18 decimals WAD)
    const estimatedSharesWad = computeStellarShares(tokensOutStroop, suggestedMultiplierWad);

    // Minimum share floor: based on reference price with 50 bps execution buffer
    const minSharesNominal = sellUsdc / (binanceRefPriceUsd * 1.005);
    const minSharesFloorWad = BigInt(Math.round(minSharesNominal * 1e18));

    let action: 'HOLD' | 'UPDATE_MULTIPLIER' | 'CIRCUIT_BREAK' = 'HOLD';
    if (circuitBreakerTripped) {
      action = 'CIRCUIT_BREAK';
    } else if (!isPegged) {
      action = 'UPDATE_MULTIPLIER';
    }

    return {
      ticker,
      sellAmountUsdc: params.sellAmountUsdc,
      binanceRefPriceUsd,
      stellarDexPriceUsd,
      pegDivergenceBps,
      isPegged,
      circuitBreakerTripped,
      suggestedMultiplierWad,
      estimatedTokensOutStroop: tokensOutStroop,
      estimatedSharesWad,
      minSharesFloorWad,
      action,
    };
  }
}
