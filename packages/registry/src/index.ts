import { createPublicClient, http, keccak256, parseAbi, toBytes, type PublicClient } from 'viem';
import { bsc } from 'viem/chains';
import { sharesPerToken, type Issuer, type SharesPerToken } from '@parallax/kernel';
import generated from './wrappers.generated.json';

export interface WrapperRecord {
  ticker: string;
  tickerId: `0x${string}`;
  issuer: Issuer;
  symbol: string;
  token: `0x${string}`;
  decimals: number;
  unit: { kind: 'TOKEN_UI_MULTIPLIER' | 'ORACLE_SVALUE' | 'BALANCE_IS_SHARES'; source: `0x${string}`; selector: `0x${string}`; decimals: number };
  pause: { source: `0x${string}`; selector: `0x${string}`; perToken: boolean };
  deepestDirectPool: { dex: string; pool: `0x${string}`; reserveUsd: number } | null;
  contractReceive: 'OK' | 'REFUSED' | 'UNKNOWN';
  provenance: string[];
  coingeckoId: string | null;
  /** Part of the measured discovery set (full evidence), as opposed to catalogue coverage. */
  core: boolean;
}

export const CHAIN_ID = 56;
export const USDT = generated.usdt as `0x${string}`;
export const ONDO_ORACLE = generated.ondoOracle as `0x${string}`;
export const WRAPPERS = generated.wrappers as unknown as WrapperRecord[];
export const GENERATED_AT = generated.generatedAt;

export const tickerIdOf = (ticker: string): `0x${string}` => keccak256(toBytes(ticker.toUpperCase()));
export const TICKERS = Array.from(new Set(WRAPPERS.map((w) => w.ticker)));
export const CORE_TICKERS = Array.from(new Set(WRAPPERS.filter((w) => w.core).map((w) => w.ticker)));
export const wrappersFor = (ticker: string): WrapperRecord[] => WRAPPERS.filter((w) => w.ticker === ticker.toUpperCase());
export const wrapperByToken = (token: string): WrapperRecord | undefined => WRAPPERS.find((w) => w.token.toLowerCase() === token.toLowerCase());

/** Order of wrappers per ticker as registered on-chain: the index ParallaxBook.fill expects. */
export const registryIndex = (w: WrapperRecord): number => wrappersFor(w.ticker).findIndex((x) => x.token === w.token);

const bstockAbi = parseAbi(['function uiMultiplier() view returns (uint256)', 'function pauseManager() view returns (address)']);
const ondoAbi = parseAbi(['function tokenPauseManager() view returns (address)']);
const oracleAbi = parseAbi(['function getSValue(address) view returns (uint128 sValue, bool paused)']);
const pmAbi = parseAbi(['function isTokenPaused(address) view returns (bool)']);
const xAbi = parseAbi(['function isPaused() view returns (bool)', 'function getCurrentMultiplier() view returns (uint256 currentMultiplier, uint256 periodsPassed, uint256 currentMultiplierNonce)']);

export interface UnitRead {
  unit: SharesPerToken;
  paused: boolean;
  blockNumber: bigint;
  /** For xStocks, the informational multiplier (not the unit). */
  multiplier: bigint | null;
}

export function makeClient(rpcUrl?: string): PublicClient {
  return createPublicClient({ chain: bsc, transport: http(rpcUrl ?? process.env.BSC_RPC_URL ?? 'https://bsc-dataseed1.defibit.io') }) as PublicClient;
}

/** Reads the unit and pause state from the issuer's own source. Mirrors WrapperRegistry.sharesPerToken / isPaused. */
export async function readUnit(client: PublicClient, w: WrapperRecord, blockNumber?: bigint): Promise<UnitRead> {
  const bn = blockNumber ?? (await client.getBlockNumber());
  const opts = { blockNumber: bn } as const;
  if (w.issuer === 'BSTOCKS') {
    const m = await client.readContract({ address: w.token, abi: bstockAbi, functionName: 'uiMultiplier', ...opts });
    const pm = await client.readContract({ address: w.token, abi: bstockAbi, functionName: 'pauseManager', ...opts });
    const paused = await client.readContract({ address: pm, abi: pmAbi, functionName: 'isTokenPaused', args: [w.token], ...opts });
    return { unit: sharesPerToken(m), paused, blockNumber: bn, multiplier: m };
  }
  if (w.issuer === 'ONDO') {
    const [s, oraclePaused] = await client.readContract({ address: ONDO_ORACLE, abi: oracleAbi, functionName: 'getSValue', args: [w.token], ...opts });
    const pm = await client.readContract({ address: w.token, abi: ondoAbi, functionName: 'tokenPauseManager', ...opts });
    const tokenPaused = await client.readContract({ address: pm, abi: pmAbi, functionName: 'isTokenPaused', args: [w.token], ...opts });
    return { unit: sharesPerToken(s), paused: oraclePaused || tokenPaused, blockNumber: bn, multiplier: s };
  }
  const paused = await client.readContract({ address: w.token, abi: xAbi, functionName: 'isPaused', ...opts });
  const [m] = await client.readContract({ address: w.token, abi: xAbi, functionName: 'getCurrentMultiplier', ...opts });
  return { unit: sharesPerToken(10n ** 18n), paused, blockNumber: bn, multiplier: m };
}

export * from './pancake';
export * from './routes';
export * from './live';

export * from './stellar';
