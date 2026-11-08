/**
 * Parallax E2E Testing Oracles and Ground Truth Engines
 * 
 * Provides reference implementations and mathematical models derived strictly
 * from project requirements, Stellar SEP specifications, and Soroban contracts.
 */

export const STROOP = 10_000_000n; // 10^7 (Stellar SAC decimals)
export const WAD = 1_000_000_000_000_000_000n; // 10^18 (Soroban share standard)
export const SCALE_STROOP_TO_WAD = 100_000_000_000n; // 10^11
export const I128_MAX = (1n << 127n) - 1n; // 170,141,183,460,469,231,731,687,303,715,884,105,727n
export const I128_MIN = -(1n << 127n);

// ==========================================
// 1. SOROBAN FIXED-POINT ARITHMETIC ORACLE (F1, F3)
// ==========================================

export class SorobanArithmeticOracle {
  /**
   * Simulates the legacy unpatched Rust formula:
   * let tokens_wad = tokens_out * SCALE_STROOP_TO_WAD;
   * let shares = (tokens_wad * unit) / WAD;
   * Throws if intermediate product exceeds i128::MAX.
   */
  public static legacyCalculateShares(tokensOut: bigint, unit: bigint = WAD): bigint {
    const tokensWad = tokensOut * SCALE_STROOP_TO_WAD;
    const intermediate = tokensWad * unit;
    if (intermediate > I128_MAX) {
      throw new Error(`i128 overflow in legacy formula: ${intermediate} > ${I128_MAX}`);
    }
    return intermediate / WAD;
  }

  /**
   * Evaluates the normalized, overflow-free formula:
   * shares = (tokens_out * unit) / STROOP;
   */
  public static normalizedCalculateShares(tokensOut: bigint, unit: bigint = WAD): bigint {
    if (tokensOut < 0n || unit < 0n) {
      throw new Error('Bad parameters: negative amounts not permitted');
    }
    const intermediate = tokensOut * unit;
    if (intermediate > I128_MAX) {
      throw new Error(`i128 overflow in normalized calculation: ${intermediate} > ${I128_MAX}`);
    }
    return intermediate / STROOP;
  }

  /**
   * Checks the share floor invariant:
   * delivered_shares >= order.limit
   */
  public static checkShareFloor(tokensOut: bigint, unit: bigint, minSharesFloor: bigint): {
    passes: boolean;
    sharesDelivered: bigint;
    difference: bigint;
  } {
    const sharesDelivered = this.normalizedCalculateShares(tokensOut, unit);
    return {
      passes: sharesDelivered >= minSharesFloor,
      sharesDelivered,
      difference: sharesDelivered - minSharesFloor,
    };
  }
}

// ==========================================
// 2. EQUITY TOKEN CATALOG ORACLE (F2)
// ==========================================

export interface EquityCatalogRecord {
  ticker: string;
  symbol: string;
  tokenAddress: string;
  issuerName: string;
  issuerType: 'BStocks' | 'Ondo' | 'XStocks' | 'Benji' | 'Custom';
  decimals: number;
  active: boolean;
  defaultUnitWad: bigint;
}

export const EQUITY_CATALOG: Record<string, EquityCatalogRecord> = {
  NVDA: {
    ticker: 'NVDA',
    symbol: 'bNVDA',
    tokenAddress: 'CBG4XKLKV4TPIBCVR5HM4HZG3CSNJPQ3EEYNAXRYJKAXKKP2PYCDOTNG',
    issuerName: 'Backed Finance',
    issuerType: 'BStocks',
    decimals: 7,
    active: true,
    defaultUnitWad: WAD,
  },
  AAPL: {
    ticker: 'AAPL',
    symbol: 'bAAPL',
    tokenAddress: 'CDYYFXXT4RNVQHIFR3FVUSFSWPFPAUYEI7GVBQHGDVJKVMFL3YLLQHTE',
    issuerName: 'Backed Finance',
    issuerType: 'BStocks',
    decimals: 7,
    active: true,
    defaultUnitWad: WAD,
  },
  TSLA: {
    ticker: 'TSLA',
    symbol: 'bTSLA',
    tokenAddress: 'CDBPE4Q4RSBQWXYPFAECE5AANQ3BOARNALARQ7CXDS2OYROATR2WLJNO',
    issuerName: 'Backed Finance',
    issuerType: 'BStocks',
    decimals: 7,
    active: true,
    defaultUnitWad: WAD,
  },
  BENJI: {
    ticker: 'BENJI',
    symbol: 'FOBXX',
    tokenAddress: 'CDMWXGFCNMAH2YADWNH2RW5EYK2F72YBFA2U4JKN6QCSUQ34GCQP7MQE',
    issuerName: 'Franklin Templeton',
    issuerType: 'Benji',
    decimals: 7,
    active: true,
    defaultUnitWad: WAD, // $1.00 FOBXX share parity
  },
};

// ==========================================
// 3. BINANCE STOCK PEG ORACLE (F7, F12)
// ==========================================

export interface PegAnalysisResult {
  ticker: string;
  binancePriceUsd: number;
  stellarDexPriceUsd: number;
  divergenceBps: number;
  isPegged: boolean;
  suggestedMultiplierWad: bigint;
  recommendedAction: 'HOLD' | 'UPDATE_MULTIPLIER' | 'CIRCUIT_BREAK';
}

export class BinancePegOracle {
  public static analyzePeg(
    ticker: string,
    binancePriceUsd: number,
    stellarDexPriceUsd: number,
    currentMultiplierWad: bigint = WAD,
    maxToleratedDivergenceBps = 150
  ): PegAnalysisResult {
    if (binancePriceUsd <= 0 || stellarDexPriceUsd <= 0) {
      throw new Error('Invalid price data for peg analysis: prices must be positive');
    }

    const diff = Math.abs(stellarDexPriceUsd - binancePriceUsd);
    const divergenceBps = Math.round((diff / binancePriceUsd) * 10000);
    const isPegged = divergenceBps <= maxToleratedDivergenceBps;

    const ratioBps = BigInt(Math.round((binancePriceUsd / stellarDexPriceUsd) * 10000));
    const suggestedMultiplierWad = (currentMultiplierWad * ratioBps) / 10000n;

    let recommendedAction: 'HOLD' | 'UPDATE_MULTIPLIER' | 'CIRCUIT_BREAK' = 'HOLD';
    if (divergenceBps > 500) {
      recommendedAction = 'CIRCUIT_BREAK';
    } else if (!isPegged) {
      recommendedAction = 'UPDATE_MULTIPLIER';
    }

    return {
      ticker,
      binancePriceUsd,
      stellarDexPriceUsd,
      divergenceBps,
      isPegged,
      suggestedMultiplierWad,
      recommendedAction,
    };
  }
}

// ==========================================
// 4. SEP-1 / SEP-10 / SEP-24 / SEP-38 ORACLE (F4, F5, F6, F7)
// ==========================================

export class SepOracle {
  /**
   * Generates a fully compliant SEP-1 stellar.toml content string.
   */
  public static generateStellarToml(domain = 'parallax.finance'): string {
    return `VERSION = "2.0.0"
NETWORK_PASSPHRASE = "Test SDF Network ; September 2015"
TRANSFER_SERVER_0024 = "https://${domain}/api/sep24"
WEB_AUTH_ENDPOINT = "https://${domain}/api/auth"
ANCHOR_QUOTE_SERVER = "https://${domain}/api/sep38"
SIGNING_KEY = "GBEXAMPLESTELLARAUTHENTICATIONKEYPARALLAX1234567890ABCDEF"

[DOCUMENTATION]
ORG_NAME = "Parallax Protocol"
ORG_URL = "https://${domain}"
ORG_DESCRIPTION = "Share-Equivalence Standing Limit Order Protocol on Stellar Soroban"
ORG_OFFICIAL_EMAIL = "contact@${domain}"

[[CURRENCIES]]
code = "USDC"
issuer = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
status = "live"
display_decimals = 7
desc = "USD Coin Native SAC"

[[CURRENCIES]]
code = "bNVDA"
issuer = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
status = "live"
display_decimals = 7
desc = "Backed NVIDIA Tokenized Equity"

[[CURRENCIES]]
code = "bAAPL"
issuer = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
status = "live"
display_decimals = 7
desc = "Backed Apple Tokenized Equity"

[[CURRENCIES]]
code = "bTSLA"
issuer = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
status = "live"
display_decimals = 7
desc = "Backed Tesla Tokenized Equity"

[[CURRENCIES]]
code = "BENJI"
issuer = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
status = "live"
display_decimals = 7
desc = "Franklin OnChain U.S. Government Money Fund (FOBXX)"
`;
  }

  /**
   * Parses SEP-1 TOML into structured records.
   */
  public static parseStellarToml(raw: string): {
    version: string;
    networkPassphrase: string;
    webAuthEndpoint: string;
    transferServerSep24: string;
    anchorQuoteServer: string;
    currencies: string[];
  } {
    const lines = raw.split(/\r?\n/);
    let version = '';
    let networkPassphrase = '';
    let webAuthEndpoint = '';
    let transferServerSep24 = '';
    let anchorQuoteServer = '';
    const currencies: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...rest] = trimmed.split('=');
      if (!key || rest.length === 0) continue;
      const k = key.trim();
      const val = rest.join('=').trim().replace(/^["']|["']$/g, '');

      if (k === 'VERSION') version = val;
      else if (k === 'NETWORK_PASSPHRASE') networkPassphrase = val;
      else if (k === 'WEB_AUTH_ENDPOINT') webAuthEndpoint = val;
      else if (k === 'TRANSFER_SERVER_0024') transferServerSep24 = val;
      else if (k === 'ANCHOR_QUOTE_SERVER') anchorQuoteServer = val;
      else if (k === 'code') currencies.push(val);
    }

    return {
      version,
      networkPassphrase,
      webAuthEndpoint,
      transferServerSep24,
      anchorQuoteServer,
      currencies,
    };
  }

  /**
   * Simulates SEP-10 challenge creation and validation.
   */
  public static createSep10Challenge(
    clientAccount: string,
    homeDomain = 'parallax.finance',
    timeoutSeconds = 300
  ): {
    transactionXdr: string;
    networkPassphrase: string;
    timebounds: { minTime: number; maxTime: number };
  } {
    if (!clientAccount.startsWith('G') || clientAccount.length !== 56) {
      throw new Error(`Invalid Stellar client account public key: ${clientAccount}`);
    }
    const now = Math.floor(Date.now() / 1000);
    const timebounds = { minTime: now, maxTime: now + timeoutSeconds };
    // Simulated deterministic base64 XDR structure
    const payload = JSON.stringify({ clientAccount, homeDomain, timebounds });
    const transactionXdr = Buffer.from(payload).toString('base64');
    return {
      transactionXdr,
      networkPassphrase: 'Test SDF Network ; September 2015',
      timebounds,
    };
  }

  /**
   * Simulates SEP-10 JWT issuance and validation.
   */
  public static issueSep10Jwt(
    account: string,
    homeDomain = 'parallax.finance',
    durationSeconds = 86400
  ): string {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: `https://${homeDomain}/api/auth`,
        sub: account,
        iat: now,
        exp: now + durationSeconds,
      })
    ).toString('base64url');
    const signature = Buffer.from(`signature-${account}-${now}`).toString('base64url');
    return `${header}.${payload}.${signature}`;
  }

  public static verifySep10Jwt(jwt: string): { valid: boolean; sub: string; expired: boolean } {
    const parts = jwt.split('.');
    if (parts.length !== 3) return { valid: false, sub: '', expired: false };
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      const now = Math.floor(Date.now() / 1000);
      const expired = now > payload.exp;
      const valid = Boolean(!expired && payload.sub && payload.iss);
      return {
        valid,
        sub: payload.sub || '',
        expired,
      };
    } catch {
      return { valid: false, sub: '', expired: false };
    }
  }

  /**
   * Evaluates SEP-38 conversion pricing derived from live Binance feed.
   */
  public static computeSep38Price(
    sellAsset: string,
    buyAsset: string,
    sellAmount: string,
    referencePriceUsd: number,
    feeBps = 10 // 0.1% fee
  ): {
    price: string;
    totalPrice: string;
    buyAmount: string;
    fee: { total: string; asset: string };
  } {
    const amountNum = parseFloat(sellAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new Error('sell_amount must be greater than zero');
    }

    const feeAmount = (amountNum * feeBps) / 10000;
    const netSellAmount = amountNum - feeAmount;

    // e.g. selling USDC to buy bNVDA: buyAmount = netSellAmount / referencePriceUsd
    const buyAmountNum = netSellAmount / referencePriceUsd;
    const effectivePrice = (amountNum / buyAmountNum).toFixed(6);

    return {
      price: referencePriceUsd.toFixed(6),
      totalPrice: effectivePrice,
      buyAmount: buyAmountNum.toFixed(6),
      fee: {
        total: feeAmount.toFixed(6),
        asset: sellAsset,
      },
    };
  }
}
