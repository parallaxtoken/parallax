// Renders DISCOVERY.md from the template and data/discovery/summary.json. No number is typed in the template.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const s = JSON.parse(readFileSync('data/discovery/summary.json', 'utf8'));
const get = (path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), s);
const fmt = (v) => {
  if (typeof v === 'number') { if (Number.isInteger(v)) return v.toLocaleString('en-US'); return Math.abs(v) >= 100 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : v.toFixed(Math.abs(v) < 1 ? 4 : 2); }
  return String(v);
};
function brokenTable() {
  const b = s.brokenQuotes.bySessionIssuer; const rows = ['| Session | Issuer | Observations | API price >5% off | Direct-pool quote >5% off | No route |', '|---|---|---:|---:|---:|---:|'];
  for (const [sess, byI] of Object.entries(b)) for (const [i, e] of Object.entries(byI)) rows.push(`| ${sess} | ${i} | ${e.observations} | ${e.apiBroken} | ${e.chainBroken} | ${e.noRoute} |`);
  return rows.join('\n');
}
let history = { status: 'IN PROGRESS', text: 'The windowed log scan has not finished at snapshot time; xStocks multiplier update arrays are read from token state.' };
if (s.history) { history = { status: s.history.failedWindows === 0 ? 'DONE' : 'PARTIAL', text: `Scanned ${s.history.days} days (${s.history.windows} block windows, ${s.history.failedWindows} failed). Ondo oracle emitted ${s.history.ondoEvents} events (${Object.entries(s.history.ondoByKind).map(([k, v]) => `${k} ${v}`).join(', ')}) touching ${s.history.ondoAssetsWithSValueUpdate} assets with a value update. bStocks multiplier events in the window: ${s.history.bstockMultiplierEvents}. xStocks multiplierUpdates array length per ticker: ${Object.entries(s.history.xstocksUpdateArrays).map(([k, v]) => `${k} ${v}`).join(', ')}.` }; }
const t = readFileSync('scripts/discovery/DISCOVERY.template.md', 'utf8')
  .replace('{{table:brokenQuotes}}', brokenTable()).replace('{{historyStatus}}', history.status).replace('{{historyText}}', history.text)
  .replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (m, k) => { const v = get(k); if (v === undefined) throw new Error('missing summary key ' + k); return fmt(v); });
writeFileSync('DISCOVERY.md', t);
console.log('DISCOVERY.md written', t.length, 'chars');
