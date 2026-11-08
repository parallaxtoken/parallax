// Evidence for the independent reference: for each core ticker, the issuer feed (Ondo equity feed through the Binance
// API), the independent source with its timestamp, and the verdict the keeper and planner would reach.
import { mkdirSync, writeFileSync } from 'node:fs';
import './mainnet/lib';
import { PublicRwaClient } from '@parallax/binance';
import { independentReference, verdict, DEFAULT_MAX_DISAGREE_BPS } from '@parallax/independent';
import { CORE_TICKERS, wrappersFor } from '@parallax/registry';
import { wadFromDecimal, wadToDecimal } from '@parallax/kernel';

const rwa = new PublicRwaClient({ origin: process.env.BINANCE_API_ORIGIN });
const maxBps = Number(process.env.REFERENCE_MAX_DISAGREE_BPS ?? DEFAULT_MAX_DISAGREE_BPS);
const rows = [];
for (const t of CORE_TICKERS) {
  const ondo = wrappersFor(t).find((w) => w.issuer === 'ONDO');
  let issuer: bigint | null = null;
  if (ondo) {
    const d = await rwa.dynamic(ondo.token);
    if (d.ok && d.data.stockPrice) issuer = wadFromDecimal(d.data.stockPrice);
  }
  const ind = await independentReference(t);
  const v = verdict(issuer, ind.ok ? ind.usdPerShare : null, maxBps, true);
  rows.push({
    ticker: t,
    issuerFeedUsd: issuer === null ? null : wadToDecimal(issuer, 2),
    independentSource: ind.ok ? ind.source : null,
    independentUsd: ind.ok ? wadToDecimal(ind.usdPerShare, 2) : null,
    independentAsOf: ind.ok ? ind.intraday?.at ?? ind.asOf : null,
    independentDailyClose: ind.ok ? ind.daily?.close ?? null : null,
    failure: ind.ok ? null : ind.message,
    verdict: v.status, disagreeBps: v.disagreeBps, floorSource: v.floorSource,
  });
  console.log(t, JSON.stringify(rows.at(-1)));
}
mkdirSync('data/reference', { recursive: true });
const agree = rows.filter((r) => r.verdict === 'AGREE').length;
writeFileSync('data/reference/snapshot.json', JSON.stringify({ generatedAt: new Date().toISOString(), maxBps, tickers: rows.length, agree, disagree: rows.filter((r) => r.verdict === 'DISAGREE').length, unavailable: rows.filter((r) => r.verdict === 'UNAVAILABLE').length, rows }, null, 2));
