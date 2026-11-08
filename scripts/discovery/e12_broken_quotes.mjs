// E12: flag recorded quotes more than 5% from the equity reference (last non-null Ondo stockInfo.price for the
// ticker), by session and wrapper issuer. Source: e4_session_basis.jsonl. Re-runnable as the recorder grows.
import { readFileSync, writeFileSync } from 'node:fs';
import { session } from './e4_backfill_session.mjs';
const lines = readFileSync('data/discovery/e4_session_basis.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const lastRef = {}; const TH = 0.05;
const agg = {}; let total = 0;
const bump = (s, issuer, k) => { const e = ((agg[s] ??= {})[issuer] ??= { observations: 0, apiBroken: 0, chainBroken: 0, noReference: 0, noRoute: 0 }); e[k]++; };
for (const rec of lines) {
  const s = session(Date.parse(rec.t));
  for (const r of rec.rows) if (r.issuer === 'ONDO' && r.stockPrice) lastRef[r.ticker] = Number(r.stockPrice);
  for (const r of rec.rows) {
    total++; const ref = lastRef[r.ticker];
    bump(s, r.issuer, 'observations');
    if (!ref) { bump(s, r.issuer, 'noReference'); continue; }
    const unit = r.unit ? Number(BigInt(r.unit)) / 1e18 : 1; const u = r.issuer === 'XSTOCKS' ? 1 : unit;
    if (r.apiPrice && Math.abs(Number(r.apiPrice) / u / ref - 1) > TH) bump(s, r.issuer, 'apiBroken');
    if (!r.tokensOut) { bump(s, r.issuer, 'noRoute'); continue; }
    const perShare = r.quoteUsd / (Number(BigInt(r.tokensOut)) / 1e18 * u);
    if (Math.abs(perShare / ref - 1) > TH) bump(s, r.issuer, 'chainBroken');
  }
}
const out = { generatedAt: new Date().toISOString(), threshold: TH, cycles: lines.length, observations: total, referenceNote: 'last non-null Ondo stockInfo.price per ticker', bySessionIssuer: agg };
writeFileSync('data/discovery/e12_broken_quotes.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
