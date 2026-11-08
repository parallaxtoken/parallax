import { NextResponse } from 'next/server';
import { retainedJournal, summarise } from '@/lib/server/journal';

export const dynamic = 'force-dynamic';

/**
 * Live keeper status when the keeper is reachable; otherwise the retained journal that shipped with this
 * deployment, labelled as such. The state is stated, never faked.
 */
export async function GET() {
  const url = process.env.KEEPER_URL;
  if (url) {
    try {
      const r = await fetch(`${url.replace(/\/$/, '')}/api/agent/keeper`, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
      return NextResponse.json({ available: true, source: 'live', ...(await r.json()) });
    } catch {
      /* fall through to the retained journal */
    }
  }
  const rows = await retainedJournal();
  if (rows.length === 0) return NextResponse.json({ available: false, source: 'none', reason: 'KEEPER_URL is not configured and no retained journal is present' });
  const s = summarise(rows);
  return NextResponse.json({
    available: true,
    source: 'retained',
    note: 'The live keeper is not reachable from this deployment. These are the retained journal entries from the mainnet autonomy run.',
    mode: 'RETAINED',
    keeper: process.env.KEEPER_ADDRESS ?? null,
    book: process.env.NEXT_PUBLIC_PARALLAXBOOK ?? null,
    transactionApi: 'ETH_CALL_FALLBACK',
    passes: null,
    fills: s.fills,
    refusalsByReason: s.refusalsByReason,
    recent: rows.slice(-25),
  });
}
