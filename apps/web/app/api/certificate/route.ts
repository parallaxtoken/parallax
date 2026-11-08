import { NextResponse } from 'next/server';
import { createHash, createHmac } from 'node:crypto';
import { getShelf } from '@/lib/server/shelf';
import { wrappersFor } from '@parallax/registry';

export const preferredRegion = ['sin1', 'hkg1'];
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/**
 * Parallax Certificate: a decomposition of one ticker across every wrapper at a block, hash-committed.
 * Priced per call with B402 (x402 V2) when the merchant is configured; otherwise the state is stated.
 */
const ORIGIN = process.env.BINANCE_WEB3_ORIGIN ?? 'https://web3.binance.com';
// The B402 facilitator on BSC settles in the United Stables token (the `supported` response names it), 18 decimals.
const PRICE_WEI = process.env.CERT_PRICE_WEI ?? '10000000000000000'; // 0.01
const U_ASSET = '0xcE24439F2D9C6a2289F741120FE202248B666666';
const USDT_ASSET = '0x55d398326f99059fF775485246999027B3197955';

interface Kind { scheme: string; network: string; extra: Record<string, unknown> }
interface Requirement { scheme: string; network: string; amount: string; asset: string; payTo: string; maxTimeoutSeconds: number; extra: Record<string, unknown> }

/** Key-order independent JSON, so a wallet that re-serialises the accepted entry still matches. */
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

async function b402(op: 'supported' | 'verify' | 'settle', body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const key = process.env.BINANCE_WEB3_API_KEY, secret = process.env.BINANCE_WEB3_SECRET_KEY;
  if (!key || !secret) return { status: 503, json: { code: 'NOT_CONFIGURED' } };
  const path = `/build/api/v2/b402/${op}`;
  const raw = JSON.stringify({ body });
  const ts = new Date().toISOString();
  const sig = createHmac('sha256', secret).update(ts + 'POST' + path + raw, 'utf8').digest('base64');
  const r = await fetch(`${ORIGIN}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-OC-APIKEY': key, 'X-OC-TIMESTAMP': ts, 'X-OC-SIGN': sig }, body: raw, signal: AbortSignal.timeout(15000) });
  return { status: r.status, json: (await r.json()) as Record<string, unknown> };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ticker = (url.searchParams.get('ticker') ?? '').toUpperCase();
  if (!wrappersFor(ticker).length) return NextResponse.json({ error: 'unknown ticker' }, { status: 400 });

  const payTo = process.env.B402_PAY_TO;
  // Both options the facilitator reports for BSC: United Stables by EIP-3009 and Tether USD by permit2-exact.
  // The paying wallet picks one; the replayed payment must match one of these entries exactly.
  const requirementsFor = async (): Promise<Requirement[]> => {
    const s = await b402('supported', {});
    const kinds = ((s.json.data as { kinds?: Kind[] } | undefined)?.kinds ?? []).filter((k) => k.network === 'eip155:56' && k.scheme === 'exact');
    if (!payTo) return [];
    const pick = (name: string, method: string) => kinds.find((k) => k.extra.name === name && k.extra.assetTransferMethod === method);
    const out: Requirement[] = [];
    const usdt = pick('Tether USD', 'permit2-exact');
    const u = pick('United Stables', 'eip3009');
    if (usdt) out.push({ scheme: usdt.scheme, network: 'eip155:56', amount: PRICE_WEI, asset: USDT_ASSET, payTo, maxTimeoutSeconds: 300, extra: usdt.extra });
    if (u) out.push({ scheme: u.scheme, network: 'eip155:56', amount: PRICE_WEI, asset: U_ASSET, payTo, maxTimeoutSeconds: 300, extra: u.extra });
    return out;
  };

  const header = req.headers.get('x-payment') ?? req.headers.get('payment-signature');
  if (!header) {
    const reqs = await requirementsFor();
    if (reqs.length === 0) return NextResponse.json({ error: 'B402_NOT_CONFIGURED', message: 'Paid certificates need the B402 merchant configured (API key with B402 permission and a payTo address).' }, { status: 503 });
    return NextResponse.json({ x402Version: 2, resource: { url: `${url.origin}/api/certificate?ticker=${ticker}` }, accepts: reqs }, { status: 402 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'bad payment header' }, { status: 400 });
  }
  const all = await requirementsFor();
  if (all.length === 0) return NextResponse.json({ error: 'B402_NOT_CONFIGURED' }, { status: 503 });
  const accepted = canon((payload as { accepted?: unknown }).accepted);
  const reqs = all.find((r) => canon(r) === accepted);
  if (!reqs) return NextResponse.json({ error: 'payment does not match requirements' }, { status: 402 });
  const verified = await b402('verify', { x402Version: 2, paymentPayload: payload, paymentRequirements: reqs });
  if (verified.status !== 200 || (verified.json.data as { isValid?: boolean } | undefined)?.isValid === false) return NextResponse.json({ error: 'payment not valid', detail: verified.json }, { status: 402 });

  const shelf = await getShelf(ticker, 50);
  if (!shelf) return NextResponse.json({ error: 'no shelf' }, { status: 404 });
  const body = { ticker, block: shelf.block, asOf: shelf.asOf, session: shelf.session, referenceUsdPerShare: shelf.referenceUsdPerShare, wrappers: shelf.wrappers.map((w) => ({ symbol: w.symbol, issuer: w.issuer, token: w.token, unitWad: w.unitWad, paused: w.unitPaused, quote: w.quote })) };
  const canonical = JSON.stringify(body);
  const hash = createHash('sha256').update(canonical).digest('hex');
  const settled = await b402('settle', { x402Version: 2, paymentPayload: payload, paymentRequirements: reqs });
  const settlement = settled.json.data as { success?: boolean; transaction?: string; errorReason?: string } | undefined;
  if (settled.status !== 200 || settlement?.success !== true) return NextResponse.json({ error: 'settlement failed', detail: settlement ?? settled.json }, { status: 402 });
  return NextResponse.json({ certificate: body, sha256: hash, settlement: settled.json.data ?? null });
}
