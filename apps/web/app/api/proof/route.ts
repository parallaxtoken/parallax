import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';

const FILES = ['discovery/summary.json', 'counterfactual/summary.json', 'autonomy/summary.json', 'calibration/weekend_moves.json'];

/** Every number the proof page shows comes from a summary file on disk. */
export async function GET() {
  const out: Record<string, unknown> = {};
  for (const f of FILES) {
    try {
      out[f] = JSON.parse(await readFile(join(process.cwd(), '..', '..', 'data', f), 'utf8'));
    } catch {
      out[f] = null;
    }
  }
  return NextResponse.json(out);
}
