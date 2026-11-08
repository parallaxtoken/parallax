/**
 * Parallax Stellar SDK Constants & Official Testnet Deployments
 */

import { Issuer, type EquityWrapperInfo, type StellarEquityTicker } from './types.js';

export const STELLAR_TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
export const STELLAR_MAINNET_PASSPHRASE = 'Public Global Stellar Network ; September 2015';

export const DEFAULT_SOROBAN_TESTNET_RPC = 'https://soroban-testnet.stellar.org';
export const DEFAULT_HORIZON_TESTNET_URL = 'https://horizon-testnet.stellar.org';
export const DEFAULT_PARALLAX_DOMAIN = 'parallax.finance';

/** Official Parallax Book Contract on Stellar Testnet */
export const PARALLAX_BOOK_TESTNET = 'CBM3NZ46TSRLH4W7TF2OWA2GVK4XJYZRVGLTXODUBVVPQEN6SX5M432W';

/** Official Wrapper Registry Contract on Stellar Testnet */
export const WRAPPER_REGISTRY_TESTNET = 'CAKOH4URENBVDAXAFSIPVSDDRFJTEHKMA77BRCH6B7WMOIOVF5ES2LFU';

/** Official Circle Native USDC SAC on Stellar Testnet */
export const USDC_SAC_TESTNET = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';

/** Backed Finance NVDA (bNVDA SAC) on Stellar Testnet */
export const NVDA_TOKEN_TESTNET = 'CBG4XKLKV4TPIBCVR5HM4HZG3CSNJPQ3EEYNAXRYJKAXKKP2PYCDOTNG';

/** Backed Finance AAPL (bAAPL SAC) on Stellar Testnet */
export const AAPL_TOKEN_TESTNET = 'CDYYFXXT4RNVQHIFR3FVUSFSWPFPAUYEI7GVBQHGDVJKVMFL3YLLQHTE';

/** Backed Finance TSLA (bTSLA SAC) on Stellar Testnet */
export const TSLA_TOKEN_TESTNET = 'CDBPE4Q4RSBQWXYPFAECE5AANQ3BOARNALARQ7CXDS2OYROATR2WLJNO';

/** Franklin OnChain U.S. Government Money Fund (BENJI / FOBXX SAC) on Stellar Testnet */
export const BENJI_TOKEN_TESTNET = 'CDMWXGFCNMAH2YADWNH2RW5EYK2F72YBFA2U4JKN6QCSUQ34GCQP7MQE';

/** Fixed-point math scales */
export const WAD_DECIMALS = 18;
export const WAD = 1_000_000_000_000_000_000n;

export const STROOP_DECIMALS = 7;
export const STROOP = 10_000_000n;

/** Multiplier to convert 7-decimal SAC stroop to 18-decimal WAD (10^11) */
export const SCALE_STROOP_TO_WAD = 100_000_000_000n;

/** Peg divergence tolerance threshold (250 bps = 2.5%) */
export const MAX_PEG_DIVERGENCE_BPS = 250;

/** Extreme peg divergence circuit breaker threshold (500 bps = 5.0%) */
export const CIRCUIT_BREAKER_DIVERGENCE_BPS = 500;

export const STELLAR_EQUITY_TICKERS: readonly StellarEquityTicker[] = ['NVDA', 'AAPL', 'TSLA', 'BENJI'];

export const STELLAR_EQUITY_CATALOG: readonly EquityWrapperInfo[] = [
  {
    ticker: 'NVDA',
    symbol: 'bNVDA',
    tokenAddress: NVDA_TOKEN_TESTNET,
    issuerName: 'Backed Finance',
    issuerEnum: Issuer.BStocks,
    decimals: 7,
    active: true,
  },
  {
    ticker: 'AAPL',
    symbol: 'bAAPL',
    tokenAddress: AAPL_TOKEN_TESTNET,
    issuerName: 'Backed Finance',
    issuerEnum: Issuer.BStocks,
    decimals: 7,
    active: true,
  },
  {
    ticker: 'TSLA',
    symbol: 'bTSLA',
    tokenAddress: TSLA_TOKEN_TESTNET,
    issuerName: 'Backed Finance',
    issuerEnum: Issuer.BStocks,
    decimals: 7,
    active: true,
  },
  {
    ticker: 'BENJI',
    symbol: 'FOBXX',
    tokenAddress: BENJI_TOKEN_TESTNET,
    issuerName: 'Franklin Templeton',
    issuerEnum: Issuer.Benji,
    decimals: 7,
    active: true,
  },
];
