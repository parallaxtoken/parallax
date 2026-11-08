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
  // Testnet native USDC SAC address
  usdcContractId: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USDC_TESTNET',
  parallaxBookContractId: 'CAPARALLAXBOOKSOROBANTESTNETCONTRACTID1234567890ABCDEF',
  wrapperRegistryContractId: 'CAWRAPPERREGISTRYSOROBANTESTNETCONTRACTID1234567890ABCDEF',
};

export const STELLAR_MAINNET: StellarNetworkConfig = {
  networkPassphrase: 'Public Global Stellar Network ; September 2015',
  rpcUrl: 'https://soroban-rpc.mainnet.stellar.org',
  horizonUrl: 'https://horizon.stellar.org',
  // Circle Native USDC SAC on Stellar Mainnet
  usdcContractId: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
  parallaxBookContractId: '', // To be filled on mainnet deployment
  wrapperRegistryContractId: '', // To be filled on mainnet deployment
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
    tokenAddress: 'CBENJIFOBXXSTELLARSACCONTRACTADDRESS123456789ABCDEF',
    issuerName: 'Franklin Templeton',
    decimals: 7,
    active: true,
  },
  {
    ticker: 'NVDA',
    symbol: 'bNVDA',
    tokenAddress: 'CBNVDABRIDGEDSTELLARSACCONTRACTADDRESS123456789ABCDEF',
    issuerName: 'Backed Finance',
    decimals: 7,
    active: true,
  },
  {
    ticker: 'AAPL',
    symbol: 'bAAPL',
    tokenAddress: 'CBAAPLBRIDGEDSTELLARSACCONTRACTADDRESS123456789ABCDEF',
    issuerName: 'Backed Finance',
    decimals: 7,
    active: true,
  },
  {
    ticker: 'TSLA',
    symbol: 'bTSLA',
    tokenAddress: 'CBTSLABRIDGEDSTELLARSACCONTRACTADDRESS123456789ABCDEF',
    issuerName: 'Backed Finance',
    decimals: 7,
    active: true,
  },
];
