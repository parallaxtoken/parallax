import { NextResponse } from 'next/server';
import { getShelf } from '@/lib/server/shelf';

export const preferredRegion = ['sin1', 'hkg1'];
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await ctx.params;
  const usd = Number(new URL(req.url).searchParams.get('usd') ?? 50);
  const shelf = await getShelf(ticker, Number.isFinite(usd) && usd > 0 ? usd : 50);
  if (!shelf) return NextResponse.json({ error: 'NO_WRAPPER', message: `Unknown ticker ${ticker}` }, { status: 404 });
  return NextResponse.json(shelf);
}
