// On-chain quoting against PancakeSwap v3 (QuoterV2) and v2 (router) for USDT -> wrapper, no API key needed.
import { createPublicClient, http, parseAbi, parseUnits } from 'viem';
import { bsc } from 'viem/chains';
export const client = createPublicClient({ chain: bsc, transport: http(process.env.BSC_RPC_URL || 'https://bsc-dataseed1.defibit.io') });
export const A = {
  USDT: '0x55d398326f99059fF775485246999027B3197955',
  USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
  V3_FACTORY: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
  V3_QUOTER: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
  V2_FACTORY: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
  V2_ROUTER: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
};
const v3f = parseAbi(['function getPool(address,address,uint24) view returns (address)']);
const quoter = parseAbi(['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)']);
const v2r = parseAbi(['function getAmountsOut(uint256,address[]) view returns (uint256[])']);
const v2f = parseAbi(['function getPair(address,address) view returns (address)']);
const ZERO = '0x0000000000000000000000000000000000000000';
export const FEES = [100, 500, 2500, 10000];
const poolCache = new Map();
async function cachedPool(abi, address, fn, args) { const k = address + fn + args.join(); if (!poolCache.has(k)) poolCache.set(k, await client.readContract({ address, abi, functionName: fn, args })); return poolCache.get(k); }
export async function quoteBuy(quoteToken, token, usd) {
  const amountIn = parseUnits(String(usd), 18);
  const out = [];
  for (const fee of FEES) {
    try {
      const pool = await cachedPool(v3f, A.V3_FACTORY, 'getPool', [quoteToken, token, fee]);
      if (pool === ZERO) continue;
      const r = await client.simulateContract({ address: A.V3_QUOTER, abi: quoter, functionName: 'quoteExactInputSingle', args: [{ tokenIn: quoteToken, tokenOut: token, amountIn, fee, sqrtPriceLimitX96: 0n }] });
      out.push({ venue: `PANCAKE_V3_${fee}`, pool, tokensOut: r.result[0], gas: r.result[3] });
    } catch (e) { out.push({ venue: `PANCAKE_V3_${fee}`, error: (e.shortMessage || e.message).slice(0, 80) }); }
  }
  try {
    const pair = await cachedPool(v2f, A.V2_FACTORY, 'getPair', [quoteToken, token]);
    if (pair !== ZERO) { const r = await client.readContract({ address: A.V2_ROUTER, abi: v2r, functionName: 'getAmountsOut', args: [amountIn, [quoteToken, token]] }); out.push({ venue: 'PANCAKE_V2', pool: pair, tokensOut: r[1] }); }
  } catch (e) { out.push({ venue: 'PANCAKE_V2', error: (e.shortMessage || e.message).slice(0, 80) }); }
  return out;
}
