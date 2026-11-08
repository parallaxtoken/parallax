import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/server/shelf';

export const preferredRegion = ['sin1', 'hkg1'];
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await currentSession());
}
