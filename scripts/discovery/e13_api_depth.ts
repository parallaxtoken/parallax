// E13: the five depth endpoints Parallax wires into the product: gas-limit, transaction-detail-by-txhash, top-liquidity,
// address portfolio and broadcast. Records the exact request that worked and the shape of the answer.
// The broadcast leg signs a harmless contract call (USDT.approve of zero to the book, from the keeper) so that the
// answer to "does broadcast accept a contract call" is measured, not assumed.
import { writeFileSync } from 'node:fs';
import '../mainnet/lib';
import { SignedClient } from '@parallax/binance';
import { wrappersFor } from '@parallax/registry';
import { createPublicClient, createWalletClient, encodeFunctionData, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';

const key = process.env.BINANCE_WEB3_API_KEY, secret = process.env.BINANCE_WEB3_SECRET_KEY;
if (!key || !secret) throw new Error('keys required');
const c = new SignedClient({ apiKey: key, secretKey: secret, origin: process.env.BINANCE_WEB3_ORIGIN });
const BOOK = (process.env.NEXT_PUBLIC_PARALLAXBOOK ?? process.env.NEXT_PUBLIC_TAREBOOK) as `0x${string}`;
const USDT = '0x55d398326f99059fF775485246999027B3197955' as const;
const FILL = '0xca034f5a82ca44aca76508def94b30ca6827ccd4ac17d309d454ebc91b08c73d';
const nvdab = wrappersFor('NVDA').find((w) => w.issuer === 'BSTOCKS')!;
const owner = process.env.USER_ADDRESS as string;
const out: Record<string, unknown> = { at: new Date().toISOString() };
const show = (k: string, r: unknown) => { out[k] = r; console.log(k, JSON.stringify(r).slice(0, 500)); };

const account = privateKeyToAccount(process.env.KEEPER_PRIVATE_KEY as `0x${string}`);
const data = encodeFunctionData({ abi: parseAbi(['function approve(address,uint256) returns (bool)']), functionName: 'approve', args: [BOOK, 0n] });

show('gasPrice', await c.gasPrice());
show('gasLimit_approve', await c.gasLimit({ from: account.address, to: USDT, data }));
show('simulate_approve', await c.simulate({ from: account.address, to: USDT, data }));
show('txDetail', await c.txDetail(FILL));
show('topLiquidity', await c.topLiquidity(nvdab.token));
show('portfolio_latest_pnl_owner', await c.tokenLatestPnl(owner, nvdab.token));
show('portfolio_overview_agentic', await c.raw('GET', '/api/v1/dex/market/portfolio/overview', { binanceChainId: '56', walletAddress: '0x6914c90EA6F8760910971af6e2fCE8850659542A', timeFrame: '3' }));

// Broadcast: a contract call (approve of zero), signed locally and relayed through the Transaction API.
const wallet = createWalletClient({ account, chain: bsc, transport: http(process.env.BSC_RPC_URL) });
const pub = createPublicClient({ chain: bsc, transport: http(process.env.BSC_RPC_URL) });
const req = await wallet.prepareTransactionRequest({ account, chain: bsc, to: USDT, data, gas: 80_000n } as never);
const raw = await wallet.signTransaction({ ...(req as object), account } as never);
const b = await c.broadcast(account.address, raw);
show('broadcast_contract_call', b);
if (b.ok) {
  const rc = await pub.waitForTransactionReceipt({ hash: b.data.txHash as `0x${string}`, timeout: 90_000 }).catch(() => null);
  show('broadcast_receipt', rc ? { status: rc.status, block: rc.blockNumber.toString(), gasUsed: rc.gasUsed.toString() } : 'not mined within 90s');
}
writeFileSync('data/discovery/e13_api_depth.json', JSON.stringify(out, null, 1));
