import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = join(process.cwd(), '..', '..');

/** Reads a generated summary file. A missing file is a state, not an error: callers render it as such. */
export async function readData<T>(rel: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(join(ROOT, 'data', rel), 'utf8')) as T;
  } catch {
    return null;
  }
}

export interface DiscoverySummary {
  tickers: number;
  wrappers: number;
  units: { maxUnitPct: number; maxOndoVsBstocksBps: number; nonOneByIssuer: Record<string, number> };
  reference: { bstocksWithoutStockPrice: number; bstocksTotal: number; xstocksApiPriceVsStockMaxAbsPct: number };
  apiVsChain: { xstocksMismatch: number; xstocksTotal: number };
  liquidity: Record<string, { medianDeepestPoolUsd: number; under10k: number; n: number }>;
  weekendSharePct: number;
  backfill: Record<string, { n: number; medianAbsBps: number }>;
  brokenQuotes: { cycles: number; observations: number; bySessionIssuer: Record<string, Record<string, { observations: number; apiBroken: number; chainBroken: number; noRoute: number }>> };
  contractReceive: { tested: number; allOk: number };
  history?: { days: number; ondoEvents: number; ondoByKind: Record<string, number> };
}

export const discovery = () => readData<DiscoverySummary>('discovery/summary.json');

export async function readText(rel: string): Promise<string | null> {
  try {
    return await readFile(join(ROOT, rel), 'utf8');
  } catch {
    return null;
  }
}
