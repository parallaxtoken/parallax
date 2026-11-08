// Fingerprints a proof run: git commit, dataset ranges, and the SHA-256 of every result file.
// Output: evidence/run_manifest.json
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['data/discovery', 'data/calibration', 'data/counterfactual', 'data/autonomy', 'data/tests', 'evidence/fork', 'evidence/mainnet', 'docs/CLAIMS.json', 'packages/registry/src/wrappers.generated.json'];
const SKIP = new Set(['raw', 'src']);

function files(p: string): string[] {
  const s = statSync(p);
  if (!s.isDirectory()) return [p];
  return readdirSync(p).flatMap((n) => (SKIP.has(n) ? [] : files(join(p, n))));
}

const entries = ROOTS.flatMap((r) => { try { return files(r); } catch { return []; } })
  .sort()
  .map((f) => ({ file: f.replace(/\\/g, '/'), sha256: createHash('sha256').update(readFileSync(f)).digest('hex'), bytes: statSync(f).size }));

let commit = 'uncommitted';
let dirty = false;
try {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
} catch {
  /* no commits yet */
}

const ranges: Record<string, { from: string | null; to: string | null }> = {};
for (const f of ['data/discovery/e4_session_basis.jsonl']) {
  try {
    const lines = readFileSync(f, 'utf8').split('\n').filter(Boolean);
    ranges[f] = { from: JSON.parse(lines[0]!).t, to: JSON.parse(lines.at(-1)!).t };
  } catch {
    ranges[f] = { from: null, to: null };
  }
}

mkdirSync('evidence', { recursive: true });
writeFileSync('evidence/run_manifest.json', JSON.stringify({ generatedAt: new Date().toISOString(), gitCommit: commit, workingTreeDirty: dirty, datasetRanges: ranges, files: entries }, null, 2));
console.log('manifest', entries.length, 'files');
