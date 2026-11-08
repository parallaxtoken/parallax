import { NextResponse } from 'next/server';
import { getLive } from '@/lib/server/live';

export const preferredRegion = ['sin1', 'hkg1'];
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/** Live counters: orders and fills from the chain, keeper health from the hosted keeper, quotes from Supabase. */
export async function GET() {
  return NextResponse.json(await getLive());
}
