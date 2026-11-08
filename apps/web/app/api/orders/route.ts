import { NextResponse } from 'next/server';
import { ordersOf } from '@/lib/server/orders';

export const preferredRegion = ['sin1', 'hkg1'];
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const owner = new URL(req.url).searchParams.get('owner') ?? '';
  const isEvm = /^0x[0-9a-fA-F]{40}$/.test(owner);
  const isStellar = /^G[A-Z2-7]{55}$/.test(owner);
  if (!isEvm && !isStellar) return NextResponse.json({ error: 'owner must be an EVM address (0x...) or Stellar public key (G...)' }, { status: 400 });
  try {
    return NextResponse.json(await ordersOf(owner));
  } catch (e) {
    return NextResponse.json({ error: 'UNREACHABLE', message: e instanceof Error ? e.message : 'chain read failed' }, { status: 502 });
  }
}
