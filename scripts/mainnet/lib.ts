// Shared helpers for the mainnet evidence scripts. Keys are read from .env.local and never printed.
import { readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, http, parseAbi, type Account, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';

export function loadEnv(file = '.env.local'): void {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!m) continue;
    const v = (m[2] ?? '').split(/\s+#/)[0]?.trim() ?? '';
    if (v && !process.env[m[1]!]) process.env[m[1]!] = v;
  }
}
loadEnv();

export const rpc = process.env.BSC_RPC_URL ?? 'https://bsc-dataseed1.defibit.io';
export const pub = createPublicClient({ chain: bsc, transport: http(rpc) });
export const acct = (name: 'DEPLOYER' | 'KEEPER' | 'USER'): Account => privateKeyToAccount(process.env[`${name}_PRIVATE_KEY`] as Hex);
export const wallet = (a: Account) => createWalletClient({ account: a, chain: bsc, transport: http(rpc) });
export const BOOK = (process.env.NEXT_PUBLIC_PARALLAXBOOK ?? process.env.NEXT_PUBLIC_TAREBOOK) as `0x${string}`;
export const REGISTRY = process.env.NEXT_PUBLIC_REGISTRY as `0x${string}`;
export const USDT = '0x55d398326f99059fF775485246999027B3197955' as const;

export const erc20 = parseAbi([
  'function approve(address,uint256) returns (bool)',
  'function allowance(address,address) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
]);
export const bookAbi = parseAbi([
  'function placeBuy(bytes32 tickerId, uint128 payAmount, uint128 minShares, uint64 deadline, uint32 wrapperMask) returns (uint256)',
  'function placeSell(bytes32 tickerId, uint128 shares, uint128 minUsdtPerShare, uint64 deadline, uint32 wrapperMask) returns (uint256)',
  'function cancel(uint256 id)',
  'function fill(uint256 id, uint256 wrapperIdx, address router, bytes routeData)',
  'function nextId() view returns (uint256)',
  'function orders(uint256) view returns (address owner, uint8 side, uint8 status, uint32 wrapperMask, uint64 deadline, bytes32 tickerId, uint128 amount, uint128 limit)',
  'event OrderPlaced(uint256 indexed id, address indexed owner, bytes32 indexed tickerId, uint8 side, uint256 amount, uint256 limit, uint64 deadline, uint32 wrapperMask)',
]);

export async function send(w: ReturnType<typeof wallet>, req: Parameters<ReturnType<typeof wallet>['writeContract']>[0], label: string): Promise<Hex> {
  const hash = await w.writeContract(req);
  const rc = await pub.waitForTransactionReceipt({ hash });
  console.log(`${label}: ${rc.status} ${hash} gas ${rc.gasUsed}`);
  if (rc.status !== 'success') throw new Error(`${label} reverted`);
  return hash;
}
