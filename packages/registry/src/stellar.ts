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
  // Testnet native USDC SAC address (56-char base32 Strkey)
  usdcContractId: 'CAQCFV4HYEWR7P6G76ME4G5JZZ6WAFG4XB47D7U4YDCYCWCVXZCZXMC6',
  parallaxBookContractId: 'CBPARALLAXBOOKTESTNET77777777777777777777777777777777777',
  wrapperRegistryContractId: 'CBWRAPPERREGISTRYTESTNET77777777777777777777777777777777',
};

export const STELLAR_MAINNET: StellarNetworkConfig = {
  networkPassphrase: 'Public Global Stellar Network ; September 2015',
  rpcUrl: 'https://soroban-rpc.mainnet.stellar.org',
  horizonUrl: 'https://horizon.stellar.org',
  // Circle Native USDC SAC on Stellar Mainnet (56-char base32 Strkey)
  usdcContractId: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
  parallaxBookContractId: 'CCPARALLAXBOOKMAINNET77777777777777777777777777777777777',
  wrapperRegistryContractId: 'CCWRAPPERREGISTRYMAINNET77777777777777777777777777777777',
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
    tokenAddress: 'CBENJIFOBXXSTELLARSAC77777777777777777777777777777777777',
    issuerName: 'Franklin Templeton',
    decimals: 7,
    active: true,
  },
  {
    ticker: 'NVDA',
    symbol: 'bNVDA',
    tokenAddress: 'CBNVDABRIDGEDSTELLARSAC77777777777777777777777777777777',
    issuerName: 'Backed Finance',
    decimals: 7,
    active: true,
  },
  {
    ticker: 'AAPL',
    symbol: 'bAAPL',
    tokenAddress: 'CBAAPLBRIDGEDSTELLARSAC77777777777777777777777777777777',
    issuerName: 'Backed Finance',
    decimals: 7,
    active: true,
  },
  {
    ticker: 'TSLA',
    symbol: 'bTSLA',
    tokenAddress: 'CBTSLABRIDGEDSTELLARSAC77777777777777777777777777777777',
    issuerName: 'Backed Finance',
    decimals: 7,
    active: true,
  },
];
