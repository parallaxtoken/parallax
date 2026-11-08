/**
 * Parallax Stellar SDK Core Domain Types
 */

import type { Account, rpc } from '@stellar/stellar-sdk';

/**
 * Order side enum conforming to Soroban ParallaxBook contract:
 * Buy = 0, Sell = 1
 */
export enum Side {
  Buy = 0,
  Sell = 1,
}

/**
 * Order status enum conforming to Soroban ParallaxBook contract:
 * Open = 0, Filled = 1, Cancelled = 2
 */
export enum OrderStatus {
  Open = 0,
  Filled = 1,
  Cancelled = 2,
}

/**
 * Asset wrapper issuer enum conforming to Soroban WrapperRegistry contract:
 * BStocks = 0 (Backed Finance), Ondo = 1, XStocks = 2, Benji = 3 (Franklin Templeton), Custom = 4
 */
export enum Issuer {
  BStocks = 0,
  Ondo = 1,
  XStocks = 2,
  Benji = 3,
  Custom = 4,
}

/**
 * Soroban FillArgs parameter struct for filling standing orders
 */
export interface FillArgs {
  orderId: bigint;
  wrapperIdx: number;
  router: string;
  routeData: Uint8Array | Buffer | string;
}

/**
 * Tokenized equity wrapper record stored in Soroban WrapperRegistry
 */
export interface Wrapper {
  token: string;
  issuer: Issuer;
  instantOnly: boolean;
  active: boolean;
}

/**
 * Standing limit order stored in Soroban ParallaxBook
 */
export interface Order {
  id: bigint;
  owner: string;
  side: Side;
  status: OrderStatus;
  wrapperMask: number;
  deadline: bigint;
  tickerId: string;
  /** BUY: USDC stroops (7 decimals); SELL: shares WAD (18 decimals) */
  amount: bigint;
  /** BUY: min shares floor WAD (18 decimals); SELL: min USDC stroops per share */
  limit: bigint;
}

/**
 * Supported stock tickers on Parallax Stellar Testnet
 */
export type StellarEquityTicker = 'NVDA' | 'AAPL' | 'TSLA' | 'BENJI';

export interface EquityWrapperInfo {
  ticker: StellarEquityTicker;
  symbol: string;
  tokenAddress: string;
  issuerName: string;
  issuerEnum: Issuer;
  decimals: number;
  active: boolean;
}

/* =========================================================================
   Contract Client Configurations & Method Parameter Types
   ========================================================================= */

export interface ParallaxBookConfig {
  rpcUrl?: string;
  networkPassphrase?: string;
  contractId?: string;
  server?: rpc.Server;
  allowHttp?: boolean;
  timeout?: number;
  headers?: Record<string, string>;
}

export interface WrapperRegistryConfig {
  rpcUrl?: string;
  networkPassphrase?: string;
  contractId?: string;
  server?: rpc.Server;
  allowHttp?: boolean;
  timeout?: number;
  headers?: Record<string, string>;
}

export interface BaseTxParams {
  /**
   * Source account public key (G... or C...) or Stellar Account instance.
   */
  sourceAccount: string | Account;
  /** Optional explicit sequence number if sourceAccount is string */
  sequence?: string | bigint;
  /** Base transaction fee in stroops (default: '100') */
  fee?: string;
  /** Transaction timeout in seconds (default: 30) */
  timeout?: number;
}

export interface PlaceBuyParams extends BaseTxParams {
  owner?: string;
  ticker: string;
  payAmountUsdcStroops: bigint;
  minSharesWad: bigint;
  deadlineSeconds: bigint | number;
  wrapperMask?: number;
}

export interface PlaceSellParams extends BaseTxParams {
  owner?: string;
  ticker: string;
  sharesWad: bigint;
  minUsdcPerShare: bigint;
  deadlineSeconds: bigint | number;
  wrapperMask?: number;
}

export interface CancelParams extends BaseTxParams {
  orderId: bigint | number;
}

export interface FillParams extends BaseTxParams {
  filler?: string;
  orderId: bigint | number;
  wrapperIdx: number;
  router: string;
  routeData: Uint8Array | Buffer | string;
}

export interface BatchFillParams extends BaseTxParams {
  filler?: string;
  fills: FillArgs[];
}

export interface AddWrapperParams extends BaseTxParams {
  ticker: string;
  token: string;
  issuer: Issuer;
  instantOnly?: boolean;
}

export interface SetWrapperActiveParams extends BaseTxParams {
  ticker: string;
  index: number;
  active: boolean;
}

export interface SetCustomUnitParams extends BaseTxParams {
  token: string;
  unitWad: bigint;
}

export interface SetRouterParams extends BaseTxParams {
  router: string;
  allowed: boolean;
}

export interface SetTokenPausedParams extends BaseTxParams {
  token: string;
  paused: boolean;
}

/* =========================================================================
   SEP-10 & SEP-38 Parameter & Response Types
   ========================================================================= */

export interface Sep10ClientConfig {
  webAuthEndpoint: string;
  serverSigningKey: string;
  networkPassphrase?: string;
  homeDomain?: string;
  webAuthDomain?: string;
  fetchFn?: typeof fetch;
}

export interface Sep10ChallengeResponse {
  transaction: string;
  network_passphrase?: string;
}

export interface Sep10ParsedChallenge {
  clientAccountId: string;
  homeDomain: string;
  nonce: string;
  minTime: number;
  maxTime: number;
}

export interface Sep10JwtClaims {
  sub: string;
  iss: string;
  iat: number;
  exp: number;
  jti?: string;
  client_domain?: string;
  [key: string]: unknown;
}

export interface Sep38ClientConfig {
  quoteServer: string;
  fetchFn?: typeof fetch;
}

export interface Sep38AssetInfo {
  asset: string;
  country_codes?: string[];
  sell_delivery_methods?: Array<{ name: string; description: string }>;
  buy_delivery_methods?: Array<{ name: string; description: string }>;
}

export interface Sep38InfoResponse {
  assets: Sep38AssetInfo[];
}

export interface Sep38Price {
  totalPrice: string;
  price: string;
  fee: {
    total: string;
    asset: string;
  };
}

export interface Sep38PricesResponse {
  buy_assets: Array<{
    asset: string;
    price: string;
    decimals: number;
  }>;
}

export interface Sep38PriceParams {
  sellAsset: string;
  buyAsset: string;
  sellAmount?: string;
  buyAmount?: string;
  context?: string;
}

export interface Sep38FirmQuoteParams {
  sellAsset: string;
  buyAsset: string;
  sellAmount?: string;
  buyAmount?: string;
  expireAfter?: string;
}

export interface Sep38FirmQuoteResponse {
  id: string;
  expiresAt: string;
  totalPrice: string;
  price: string;
  sellAsset: string;
  sellAmount: string;
  buyAsset: string;
  buyAmount: string;
  fee: {
    total: string;
    asset: string;
  };
}

export interface PeggedQuoteParams {
  ticker: StellarEquityTicker | string;
  sellAmountUsdc: string;
  binanceRefPriceUsd: number;
  currentMultiplierWad?: bigint;
  simulatedDexPriceUsd?: number;
}

export interface PeggedQuoteResult {
  ticker: string;
  sellAmountUsdc: string;
  binanceRefPriceUsd: number;
  stellarDexPriceUsd: number;
  pegDivergenceBps: number;
  isPegged: boolean;
  circuitBreakerTripped: boolean;
  suggestedMultiplierWad: bigint;
  estimatedTokensOutStroop: bigint;
  estimatedSharesWad: bigint;
  minSharesFloorWad: bigint;
  action: 'HOLD' | 'UPDATE_MULTIPLIER' | 'CIRCUIT_BREAK';
}
