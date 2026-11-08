import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface JournalRow {
  t: string;
  orderId: string;
  status: string;
  decision: string;
  reasons: string[];
  wrapper?: string;
  router?: string;
  venue?: string;
  simSource?: string;
  simResult?: string;
  txHash?: string;
  sharesWad?: string;
}

/** The retained keeper journal shipped with the deployment. Used only when the live keeper is not reachable. */
export async function retainedJournal(limit = 200): Promise<JournalRow[]> {
  try {
    const text = await readFile(join(process.cwd(), '..', '..', 'data', 'keeper', 'journal.jsonl'), 'utf8');
    return text.split('\n').filter(Boolean).map((l) => JSON.parse(l) as JournalRow).slice(-limit);
  } catch {
    return [];
  }
}

export function summarise(rows: JournalRow[]) {
  const fills = rows.filter((r) => r.status === 'CONFIRMED').length;
  const refusals: Record<string, number> = {};
  const seen = new Set<string>();
  for (const r of rows) {
    if (!['WAIT', 'SKIP', 'REFUSED'].includes(r.status)) continue;
    const k = `${r.orderId}:${r.reasons.join(',')}`;
    if (seen.has(k)) continue;
    seen.add(k);
    for (const x of r.reasons) refusals[x] = (refusals[x] ?? 0) + 1;
  }
  return { fills, refusalsByReason: refusals, entries: rows.length };
}
