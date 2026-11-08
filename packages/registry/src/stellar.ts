/**
 * Stellar Network & Soroban Configuration for Parallax
 */

export interface StellarNetworkConfig {
  networkPassphrase: string;
  rpcUrl: string;
  horizonUrl: string;
  usdcContractId: string;
  parallaxBookContractId: string;
  wrapperRegistryContractId: string;
}

export const STELLAR_TESTNET: StellarNetworkConfig = {
  networkPassphrase: 'Test SDF Network ; September 2015',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  // Official Circle Native USDC SAC on Stellar Testnet
  usdcContractId: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
  parallaxBookContractId: 'CBM3NZ46TSRLH4W7TF2OWA2GVK4XJYZRVGLTXODUBVVPQEN6SX5M432W',
  wrapperRegistryContractId: 'CAKOH4URENBVDAXAFSIPVSDDRFJTEHKMA77BRCH6B7WMOIOVF5ES2LFU',
};

export const STELLAR_MAINNET: StellarNetworkConfig = {
  networkPassphrase: 'Public Global Stellar Network ; September 2015',
  rpcUrl: 'https://soroban-rpc.mainnet.stellar.org',
  horizonUrl: 'https://horizon.stellar.org',
  // Official Circle Native USDC SAC on Stellar Mainnet
  usdcContractId: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
  parallaxBookContractId: 'CDGM3CCBBH3J2XINJ7HX47YQFNDW5E6OCSLBVZARW6CXOLA7SC4CBTSO',
  wrapperRegistryContractId: 'CBXG3YI5AF5VXZJTHKOOI4JIK4MI4N3D5DKYH5LPUMZWEBRXSJ6TVHWS',
};

export interface StellarWrapperRecord {
  ticker: string;
  symbol: string;
  tokenAddress: string;
  issuerName: string;
  decimals: number;
  active: boolean;
}

/** Initial Stellar RWA & Tokenized Equity Catalog */
export const STELLAR_WRAPPERS: StellarWrapperRecord[] = [
  {
    ticker: 'BENJI',
    symbol: 'FOBXX',
    tokenAddress: 'CDMWXGFCNMAH2YADWNH2RW5EYK2F72YBFA2U4JKN6QCSUQ34GCQP7MQE',
    issuerName: 'Franklin Templeton',
    decimals: 7,
    active: true,
  },
  {
    ticker: 'NVDA',
    symbol: 'bNVDA',
    tokenAddress: 'CBG4XKLKV4TPIBCVR5HM4HZG3CSNJPQ3EEYNAXRYJKAXKKP2PYCDOTNG',
    issuerName: 'Backed Finance',
    decimals: 7,
    active: true,
  },
  {
    ticker: 'AAPL',
    symbol: 'bAAPL',
    tokenAddress: 'CDYYFXXT4RNVQHIFR3FVUSFSWPFPAUYEI7GVBQHGDVJKVMFL3YLLQHTE',
    issuerName: 'Backed Finance',
    decimals: 7,
    active: true,
  },
  {
    ticker: 'TSLA',
    symbol: 'bTSLA',
    tokenAddress: 'CDBPE4Q4RSBQWXYPFAECE5AANQ3BOARNALARQ7CXDS2OYROATR2WLJNO',
    issuerName: 'Backed Finance',
    decimals: 7,
    active: true,
  },
];

export const STELLAR_EQUITY_TICKERS = ['NVDA', 'AAPL', 'TSLA', 'BENJI'] as const;
export type StellarEquityTicker = (typeof STELLAR_EQUITY_TICKERS)[number];

export function getStellarWrapper(ticker: string): StellarWrapperRecord | undefined {
  return STELLAR_WRAPPERS.find((w) => w.ticker.toUpperCase() === ticker.toUpperCase());
}

export function getStellarWrapperByToken(tokenAddress: string): StellarWrapperRecord | undefined {
  return STELLAR_WRAPPERS.find((w) => w.tokenAddress.toUpperCase() === tokenAddress.toUpperCase());
}

export function isStellarEquity(ticker: string): boolean {
  return (STELLAR_EQUITY_TICKERS as readonly string[]).includes(ticker.toUpperCase());
}

export function getStellarIssuerEnum(issuerName: string): number {
  if (issuerName.includes('Backed')) return 0; // BStocks
  if (issuerName.includes('Ondo')) return 1;   // Ondo
  if (issuerName.includes('XStocks')) return 2; // XStocks
  if (issuerName.includes('Franklin')) return 3; // Benji
  return 4; // Custom
}

