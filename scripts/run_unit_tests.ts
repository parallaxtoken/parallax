// Runs the TypeScript unit suites and records the total in data/tests/unit_summary.json.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const pkgs = ['packages/kernel', 'packages/registry', 'packages/binance', 'packages/verify', 'services/keeper'];
const out: Record<string, { passed: number; failed: number }> = {};
let total = 0;
for (const p of pkgs) {
  const name = '.vitest-result.json';
  const file = join(p, name);
  try {
    execFileSync('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${name}`], { cwd: p, stdio: 'ignore', shell: true });
  } catch {
    /* a failing suite still writes the file */
  }
  const j = JSON.parse(readFileSync(file, 'utf8')) as { numPassedTests: number; numFailedTests: number };
  out[p] = { passed: j.numPassedTests, failed: j.numFailedTests };
  total += j.numPassedTests;
  rmSync(file);
}
mkdirSync('data/tests', { recursive: true });
writeFileSync('data/tests/unit_summary.json', JSON.stringify({ generatedAt: new Date().toISOString(), total, packages: out }, null, 2));
console.log(JSON.stringify({ total, out }));
