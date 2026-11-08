import { NextResponse } from 'next/server';
import { decompose, sharesPerToken, usdPerShare, usdPerToken, wadFromDecimal, wadToDecimal, WAD } from '@parallax/kernel';
import { TICKERS, wrapperByToken, wrappersFor } from '@parallax/registry';
import { currentSession, getShelf } from '@/lib/server/shelf';
import { buildPlan } from '@/lib/server/plan';
import { client as verifyClient, gatherFill, verifyFill } from '@parallax/verify';

export const preferredRegion = ['sin1', 'hkg1'];
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/**
 * Read-only MCP server over HTTP (JSON-RPC 2.0). No tool accepts a URL: inputs are tickers, registry
 * addresses, numbers and order ids, so there is no server-side request forgery surface.
 */
const TOOLS = [
  { name: 'parallax_shelf', description: 'Every wrapper of a ticker (bStocks, Ondo, xStocks) with unit, session, route and net premium, in shares.', inputSchema: { type: 'object', properties: { ticker: { type: 'string', enum: TICKERS } }, required: ['ticker'] } },
  { name: 'parallax_decompose', description: 'Split one wrapper price into gross, unit and net against the equity reference.', inputSchema: { type: 'object', properties: { wrapper: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' } }, required: ['wrapper'] } },
  { name: 'parallax_best_route', description: 'The wrapper delivering the most real shares for an amount in USD, with the plan calls an agent wallet can preview.', inputSchema: { type: 'object', properties: { ticker: { type: 'string', enum: TICKERS }, usd: { type: 'number', minimum: 1, maximum: 100000 } }, required: ['ticker', 'usd'] } },
  { name: 'parallax_verify_fill', description: 'Recompute a ParallaxBook fill from chain logs: unit at the block, shares, floor, recipient, single fill.', inputSchema: { type: 'object', properties: { orderId: { type: 'integer', minimum: 0 } }, required: ['orderId'] } },
  { name: 'parallax_session', description: 'Market session, reference age and next open for a ticker.', inputSchema: { type: 'object', properties: { ticker: { type: 'string', enum: TICKERS } }, required: ['ticker'] } },
] as const;

type Json = Record<string, unknown>;
const text = (v: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x)) }] });
const err = (message: string) => ({ isError: true, content: [{ type: 'text', text: message }] });

async function callTool(name: string, args: Json) {
  switch (name) {
    case 'parallax_shelf': {
      const s = typeof args.ticker === 'string' ? await getShelf(args.ticker) : null;
      return s ? text(s) : err('unknown ticker');
    }
    case 'parallax_session': {
      const s = typeof args.ticker === 'string' && wrappersFor(args.ticker).length ? await currentSession() : null;
      return s ? text(s) : err('unknown ticker');
    }
    case 'parallax_decompose': {
      const w = typeof args.wrapper === 'string' ? wrapperByToken(args.wrapper) : undefined;
      if (!w) return err('wrapper is not in the registry');
      const shelf = await getShelf(w.ticker);
      const v = shelf?.wrappers.find((x) => x.token.toLowerCase() === w.token.toLowerCase());
      if (!shelf || !v?.unitWad || !v.apiTokenPriceUsd || !shelf.referenceUsdPerShare) return err('unit, price or reference unavailable; nothing is guessed');
      const d = decompose(usdPerToken(wadFromDecimal(v.apiTokenPriceUsd)), usdPerShare(BigInt(shelf.referenceUsdPerShare)), sharesPerToken(BigInt(v.unitWad)));
      return text({ wrapper: w.symbol, ticker: w.ticker, grossBps: Number((d.gross * 10000n) / WAD), unitBps: Number((d.unit * 10000n) / WAD), netBps: Number((d.net * 10000n) / WAD), usdPerShare: wadToDecimal(d.perShare, 4), session: shelf.session.session, referenceAgeSec: shelf.session.referenceAgeSec });
    }
    case 'parallax_best_route': {
      if (typeof args.ticker !== 'string' || typeof args.usd !== 'number') return err('ticker and usd required');
      const plan = await buildPlan({ intent: 'instant-buy', ticker: args.ticker, usd: String(args.usd), owner: '0x000000000000000000000000000000000000dEaD' });
      return text(plan);
    }
    case 'parallax_verify_fill': {
      const book = process.env.NEXT_PUBLIC_PARALLAXBOOK as `0x${string}` | undefined;
      if (!book) return err('ParallaxBook is not deployed yet');
      if (typeof args.orderId !== 'number' || !Number.isInteger(args.orderId)) return err('orderId must be an integer');
      const clean = (v?: string) => v?.split(/\s+#/)[0]?.trim() || undefined;
      const from = process.env.NEXT_PUBLIC_PARALLAXBOOK_BLOCK ? BigInt(process.env.NEXT_PUBLIC_PARALLAXBOOK_BLOCK) : undefined;
      const state = clean(process.env.BSC_ARCHIVE_RPC_URL);
      const ev = await gatherFill(verifyClient(clean(process.env.BSC_LOGS_RPC_URL) ?? 'https://bsc.rpc.blxrbdn.com'), book, BigInt(args.orderId), from, state ? verifyClient(state) : undefined);
      return text(verifyFill(ev));
    }
    default:
      return err('unknown tool');
  }
}

export async function GET() {
  return NextResponse.json({ name: 'parallax-mcp', transport: 'http-jsonrpc', tools: TOOLS.map((t) => t.name) });
}

export async function POST(req: Request) {
  let body: { jsonrpc?: string; id?: number | string | null; method?: string; params?: Json };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 });
  }
  const id = body.id ?? null;
  const ok = (result: unknown) => NextResponse.json({ jsonrpc: '2.0', id, result });
  switch (body.method) {
    case 'initialize':
      return ok({ protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'parallax', version: '0.1.0' } });
    case 'tools/list':
      return ok({ tools: TOOLS });
    case 'tools/call': {
      const p = body.params ?? {};
      try {
        return ok(await callTool(String(p.name), (p.arguments as Json) ?? {}));
      } catch (e) {
        return ok(err(e instanceof Error ? e.message : 'tool failed'));
      }
    }
    case 'ping':
      return ok({});
    default:
      return NextResponse.json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  }
}

