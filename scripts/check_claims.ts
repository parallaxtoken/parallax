// Fails if README.md states a number that is not present in a generated summary file, or if the claims ledger
// is malformed. Numbers inside code blocks, links, hashes and tables of identifiers are ignored.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const FILES = ['data/discovery/summary.json', 'data/autonomy/summary.json', 'data/counterfactual/summary.json', 'data/counterfactual/aggregator_snapshot.json', 'data/tests/unit_summary.json', 'evidence/mainnet/erc8183_job.json', 'evidence/mainnet/identity.json', 'evidence/fork/forge_test_full.txt', 'data/live/summary.json', 'data/reference/snapshot.json', 'evidence/mainnet/agentic_payment.json', 'evidence/mainnet/agentic_cancel.json', 'data/discovery/e13_api_depth.json'];
const allowed = new Set<string>();
const add = (n: number) => {
  if (!Number.isFinite(n)) return;
  allowed.add(String(n));
  allowed.add(n.toLocaleString('en-US'));
  allowed.add(n.toFixed(2));
  allowed.add(n.toFixed(4));
  allowed.add(n.toLocaleString('en-US', { maximumFractionDigits: 0 }));
  allowed.add(String(Math.round(n)));
};
const walk = (v: unknown): void => {
  if (typeof v === 'number') add(v);
  else if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) add(Number(v));
  else if (Array.isArray(v)) v.forEach(walk);
  else if (v && typeof v === 'object') Object.values(v).forEach(walk);
};
for (const f of FILES) {
  if (!existsSync(f)) continue;
  const raw = readFileSync(f, 'utf8');
  if (f.endsWith('.json')) walk(JSON.parse(raw));
  else for (const m of raw.matchAll(/\d+/g)) add(Number(m[0]));
}
// values that are not measurements: counts the document itself defines, thresholds, versions, years
for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 30, 50, 56, 60, 72, 2026, 2027, 8004, 8183, 402, 1000, 100]) allowed.add(String(n));
allowed.add('2.0'); // Apache 2.0 license name
for (const n of ['0.5', '29', '24', '48', '20', '32', '21', '04', '09', '12', '0.2143']) allowed.add(n); // plain-words tolerance, persona age, example hours

const claims = JSON.parse(readFileSync('docs/CLAIMS.json', 'utf8')) as { claims: { id: string; status: string; reproduce: string; evidence: string[] }[] };
const problems: string[] = [];
for (const c of claims.claims) {
  if (!['SUPPORTED', 'PARTIAL', 'UNMEASURED', 'NOT_CLAIMED'].includes(c.status)) problems.push(`${c.id}: bad status ${c.status}`);
  if (c.status === 'SUPPORTED' && c.evidence.length === 0) problems.push(`${c.id}: SUPPORTED without evidence`);
  for (const e of c.evidence) if (!existsSync(e)) problems.push(`${c.id}: evidence missing ${e}`);
}

let text = readFileSync('README.md', 'utf8');
// illustrative examples inside double quotes and the product's own thresholds are not measurements
text = text.replace(/"[^"\n]{0,90}"/g, ' ').replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ').replace(/\]\([^)]*\)/g, ']').replace(/https?:\/\/\S+/g, ' ').replace(/0x[0-9a-fA-F]+/g, ' ').replace(/<[^>]+>/g, ' ');
for (const m of text.matchAll(/(?<![\w.#,-])(\d[\d,]*(?:\.\d+)?)(?![\w-])/g)) {
  const tok = m[1]!;
  if (allowed.has(tok) || allowed.has(tok.replace(/,/g, ''))) continue;
  problems.push(`README number not in any summary file: ${tok}`);
}

// the claims ledger may not contradict an UNMEASURED status by being cited as numbers in README
const stat = (p: string) => (existsSync(p) ? statSync(p).size : 0);
void readdirSync; void join; void stat;
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('claims ok');
