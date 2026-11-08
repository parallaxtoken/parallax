/**
 * Parallax 620 Hygiene Test Runner
 */

import { runAllTests } from '../e2e/helpers/fixture.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Import the 620 hygiene test suite
import './620_hygiene.test.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const ANSI = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
  };

  console.log(`\n${ANSI.bold}${ANSI.cyan}========================================================================${ANSI.reset}`);
  console.log(`${ANSI.bold}${ANSI.cyan}  PARALLAX 620 HYGIENE & INVARIANT TEST SUITE RUNNER${ANSI.reset}`);
  console.log(`${ANSI.bold}${ANSI.cyan}========================================================================${ANSI.reset}\n`);

  console.log(`${ANSI.dim}Executing 620 automated protocol hygiene, math & invariant checks...${ANSI.reset}\n`);

  const { results, total, passed, failed, durationMs } = await runAllTests(5);

  if (failed > 0) {
    console.log(`\n${ANSI.bold}${ANSI.red}FAILED TESTS DETAILS:${ANSI.reset}`);
    const failedResults = results.filter(r => !r.passed);
    for (const r of failedResults.slice(0, 10)) {
      console.log(`  ${ANSI.red}✗ [${r.suite}] ${r.title}${ANSI.reset}: ${r.error}`);
    }
    if (failedResults.length > 10) {
      console.log(`  ... and ${failedResults.length - 10} more failures`);
    }
  }

  console.log(`\n${ANSI.bold}------------------------------------------------------------------------${ANSI.reset}`);
  console.log(`${ANSI.bold}  620 HYGIENE TEST SUITE SUMMARY${ANSI.reset}`);
  console.log(`${ANSI.bold}------------------------------------------------------------------------${ANSI.reset}`);
  console.log(`  Total Executed: ${ANSI.bold}${total} tests${ANSI.reset}`);
  console.log(`  Passed:         ${ANSI.green}${passed}${ANSI.reset}`);
  console.log(`  Failed:         ${failed > 0 ? ANSI.red : ANSI.green}${failed}${ANSI.reset}`);
  console.log(`  Pass Rate:      ${ANSI.bold}${((passed / total) * 100).toFixed(1)}%${ANSI.reset}`);
  console.log(`  Duration:       ${(durationMs / 1000).toFixed(2)}s`);
  console.log(`${ANSI.bold}${ANSI.cyan}========================================================================${ANSI.reset}\n`);

  const outDir = join(__dirname, '../../data/tests');
  mkdirSync(outDir, { recursive: true });
  const summaryPath = join(outDir, 'hygiene_summary.json');
  writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        total,
        passed,
        failed,
        passRate: total > 0 ? (passed / total) * 100 : 0,
        durationMs,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  );

  console.log(`Summary artifact written to data/tests/hygiene_summary.json\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

