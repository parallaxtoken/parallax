import { encodeFunctionData, type PublicClient } from 'viem';
import { PANCAKE, V3_FEES, v2FactoryAbi, v2RouterAbi, v3FactoryAbi, v3QuoterAbi, v3RouterAbi } from './pancake';

const ZERO = '0x0000000000000000000000000000000000000000';

export interface DirectRoute {
  venue: string;
  router: `0x${string}`;
  /** Output of the swap: tokens for a buy, USDT for a sell. */
  amountOut: bigint;
  data: `0x${string}`;
}

export interface RouteRequest {
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: bigint;
  /** The book: output must land here (the contract also enforces it by balance delta). */
  recipient: `0x${string}`;
  deadline: bigint;
}

/** Quotes every PancakeSwap v3 fee tier and the v2 pair, and returns executable calldata for each live route. */
export async function directRoutes(c: PublicClient, r: RouteRequest): Promise<DirectRoute[]> {
  const out: DirectRoute[] = [];
  for (const fee of V3_FEES) {
    try {
      const pool = await c.readContract({ address: PANCAKE.V3_FACTORY, abi: v3FactoryAbi, functionName: 'getPool', args: [r.tokenIn, r.tokenOut, fee] });
      if (pool === ZERO) continue;
      const q = await c.simulateContract({
        address: PANCAKE.V3_QUOTER,
        abi: v3QuoterAbi,
        functionName: 'quoteExactInputSingle',
        args: [{ tokenIn: r.tokenIn, tokenOut: r.tokenOut, amountIn: r.amountIn, fee, sqrtPriceLimitX96: 0n }],
      });
      const amountOut = q.result[0];
      if (amountOut === 0n) continue;
      out.push({
        venue: `PANCAKE_V3_${fee}`,
        router: PANCAKE.V3_ROUTER,
        amountOut,
        data: encodeFunctionData({
          abi: v3RouterAbi,
          functionName: 'exactInputSingle',
          args: [{ tokenIn: r.tokenIn, tokenOut: r.tokenOut, fee, recipient: r.recipient, amountIn: r.amountIn, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n }],
        }),
      });
    } catch {
      /* pool empty or quoter reverted: not a route */
    }
  }
  try {
    const pair = await c.readContract({ address: PANCAKE.V2_FACTORY, abi: v2FactoryAbi, functionName: 'getPair', args: [r.tokenIn, r.tokenOut] });
    if (pair !== ZERO) {
      const amounts = await c.readContract({ address: PANCAKE.V2_ROUTER, abi: v2RouterAbi, functionName: 'getAmountsOut', args: [r.amountIn, [r.tokenIn, r.tokenOut]] });
      const amountOut = amounts[1] ?? 0n;
      if (amountOut > 0n) {
        out.push({
          venue: 'PANCAKE_V2',
          router: PANCAKE.V2_ROUTER,
          amountOut,
          data: encodeFunctionData({ abi: v2RouterAbi, functionName: 'swapExactTokensForTokens', args: [r.amountIn, 0n, [r.tokenIn, r.tokenOut], r.recipient, r.deadline] }),
        });
      }
    }
  } catch {
    /* no v2 route */
  }
  return out.sort((a, b) => (a.amountOut < b.amountOut ? 1 : a.amountOut > b.amountOut ? -1 : 0));
}
