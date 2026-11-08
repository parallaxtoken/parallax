import { NextResponse } from 'next/server';
import { allTickers, currentSession, getShelf } from '@/lib/server/shelf';

export const preferredRegion = ['sin1', 'hkg1'];
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/** All tickers with their wrappers, units and best route. Degraded sources are typed, never hidden. */
export async function GET(req: Request) {
  const usd = Number(new URL(req.url).searchParams.get('usd') ?? 50);
  const [session, shelves] = await Promise.all([currentSession(), Promise.all(allTickers().map((t) => getShelf(t, Number.isFinite(usd) && usd > 0 ? usd : 50)))]);
  return NextResponse.json({ session, shelves: shelves.filter(Boolean) });
}
