import { NextResponse } from 'next/server';
import { buildPlan, type PlanRequest } from '@/lib/server/plan';

export const preferredRegion = ['sin1', 'hkg1'];
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/**
 * Returns the exact ordered calls (approve, placeBuy / placeSell / swap) with the decomposition attached.
 * The wallet previews and signs them; this endpoint never signs and never holds a key.
 */
export async function POST(req: Request) {
  let body: PlanRequest;
  try {
    body = (await req.json()) as PlanRequest;
  } catch {
    return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'JSON body required' }, { status: 400 });
  }
  const plan = await buildPlan(body);
  return NextResponse.json(plan, { status: plan.ok ? 200 : plan.code === 'BAD_REQUEST' ? 400 : 422 });
}
