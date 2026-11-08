import { NextResponse } from 'next/server';
import { ordersOf } from '@/lib/server/orders';

export const preferredRegion = ['sin1', 'hkg1'];
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const owner = new URL(req.url).searchParams.get('owner') ?? '';
  if (!/^0x[0-9a-fA-F]{40}$/.test(owner)) return NextResponse.json({ error: 'owner must be an address' }, { status: 400 });
  try {
    return NextResponse.json(await ordersOf(owner));
  } catch (e) {
    return NextResponse.json({ error: 'UNREACHABLE', message: e instanceof Error ? e.message : 'chain read failed' }, { status: 502 });
  }
}
