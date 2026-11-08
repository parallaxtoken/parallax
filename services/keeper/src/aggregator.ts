import type { PublicClient } from 'viem';
import type { SignedClient } from '@parallax/binance';
import { registryAbi, type DirectRoute, type RouteRequest } from '@parallax/registry';

/**
 * Aggregator routes with the book as taker (E6): the Trading API builds swap calldata whose sender is the book,
 * so the book can execute it. Only routers the registry allowlists are returned (T5). Failures are silent here
 * because the caller has direct-pool routes as the fallback; typed degraded states are recorded by the engine.
 */
export async function aggregatorRoutes(
  signed: SignedClient,
  chain: PublicClient,
  registry: `0x${string}`,
  req: RouteRequest,
): Promise<DirectRoute[]> {
  const q = await signed.quote({ from: req.tokenIn, to: req.tokenOut, amountRaw: req.amountIn.toString(), taker: req.recipient });
  if (!q.ok) return [];
  const out: DirectRoute[] = [];
  for (const route of q.data.filter((r) => r.executionMode === 'SWAP').slice(0, 2)) {
    const s = await signed.swap({ quoteId: route.quoteId, from: req.tokenIn, to: req.tokenOut, amountRaw: req.amountIn.toString(), taker: req.recipient, slippagePercent: '1' });
    if (!s.ok) continue;
    const router = s.data.to as `0x${string}`;
    const allowed = await chain.readContract({ address: registry, abi: registryAbi, functionName: 'isRouter', args: [router] }).catch(() => false);
    if (!allowed) continue;
    out.push({ venue: `AGGREGATOR_${route.vendorName ?? 'UNKNOWN'}`, router, amountOut: BigInt(route.toTokenAmount), data: s.data.data as `0x${string}` });
  }
  return out;
}
