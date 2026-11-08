/**
 * Empirical Verification Harness for Challenger U2_4
 *
 * Targets:
 * 1. Zero occurrences of fake hash '4b9a403c88015383a158b1fcb65d2681a95e72d2427a149b5c3e7b1a0398f241' in route.ts
 * 2. `recent` returns `[]` when no keeper daemon is attached, rather than fictitious fills
 * 3. All 4 target equities (NVDA, AAPL, TSLA, BENJI) compute valid peg divergence against live Binance or deterministic fallbacks
 * 4. Error handling: simulation of exceptions produces 500 JSON without crashing
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StellarStockPegEngine } from '@parallax/registry';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

interface TestResult {
  name: string;
  category: string;
  passed: boolean;
  error?: string;
  details?: unknown;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, category: string, details?: unknown) {
  if (!condition) {
    results.push({ name, category, passed: false, error: 'Assertion failed', details });
    console.error(`  ❌ [FAIL] [${category}] ${name}`);
  } else {
    results.push({ name, category, passed: true, details });
    console.log(`  ✅ [PASS] [${category}] ${name}`);
  }
}

async function runTestSuite() {
  console.log('\n========================================================================');
  console.log('  CHALLENGER U2_4: EMPIRICAL TELEMETRY & PEG ENGINE VERIFICATION');
  console.log('========================================================================\n');

  const routeFilePath = path.join(ROOT_DIR, 'apps/web/app/api/agent/keeper/route.ts');
  const routeContent = fs.readFileSync(routeFilePath, 'utf8');

  // -------------------------------------------------------------------------
  // Mission 1: Verify elimination of hardcoded fake hash
  // -------------------------------------------------------------------------
  console.log('--- MISSION 1: Elimination of Hardcoded Fake Hash ---');
  const targetHash = '4b9a403c88015383a158b1fcb65d2681a95e72d2427a149b5c3e7b1a0398f241';
  const occurrences = (routeContent.match(new RegExp(targetHash, 'g')) || []).length;
  assert(occurrences === 0, 'Exact target fake hash has 0 occurrences in route.ts', 'M1', { occurrences });

  const mockHashPattern = /0x[a-f0-9]{64}.*mock/i;
  assert(!mockHashPattern.test(routeContent), 'No mock hex hash pattern present in route.ts', 'M1');

  // Verify route does not contain any hardcoded 64-character hex strings
  const any64CharHex = /[a-f0-9]{64}/i;
  const match = any64CharHex.exec(routeContent);
  assert(match === null, 'No arbitrary 64-character fake tx hash present in route.ts', 'M1', { match: match?.[0] });

  // -------------------------------------------------------------------------
  // Mission 2: Verify `recent` returns `[]` when no keeper daemon is attached
  // -------------------------------------------------------------------------
  console.log('\n--- MISSION 2: `recent` Telemetry Output (No Keeper Daemon) ---');
  // Dynamic import of GET route
  delete process.env.KEEPER_URL;
  const { GET } = await import('../apps/web/app/api/agent/keeper/route.ts');

  const resStandalone = await GET();
  assert(resStandalone.status === 200, 'GET() returns HTTP 200 without KEEPER_URL', 'M2', { status: resStandalone.status });

  const dataStandalone = await resStandalone.json();
  assert(Array.isArray(dataStandalone.recent), '`recent` property is an array', 'M2');
  assert(dataStandalone.recent.length === 0, '`recent` is strictly empty [] when no keeper daemon attached', 'M2', { recentLength: dataStandalone.recent.length });
  assert(dataStandalone.fills === 0, '`fills` count is 0 when no keeper daemon attached', 'M2', { fills: dataStandalone.fills });
  assert(dataStandalone.passes === null, '`passes` is null when no keeper daemon attached', 'M2');
  assert(dataStandalone.longestGapSec === null, '`longestGapSec` is null when no keeper daemon attached', 'M2');

  // Test with unreachable KEEPER_URL (graceful fallback)
  process.env.KEEPER_URL = 'http://127.0.0.1:59999/unreachable-keeper-daemon';
  const resUnreachable = await GET();
  assert(resUnreachable.status === 200, 'GET() falls back to 200 when KEEPER_URL daemon unreachable', 'M2');
  const dataUnreachable = await resUnreachable.json();
  assert(Array.isArray(dataUnreachable.recent) && dataUnreachable.recent.length === 0, '`recent` remains strictly [] when KEEPER_URL unreachable', 'M2');
  delete process.env.KEEPER_URL;

  // -------------------------------------------------------------------------
  // Mission 3: 4 Target Equities (NVDA, AAPL, TSLA, BENJI) Peg Divergence
  // -------------------------------------------------------------------------
  console.log('\n--- MISSION 3: 4 Target Equities Peg Divergence Engine ---');
  const pegs = dataStandalone.pegs;
  assert(Array.isArray(pegs), 'pegs is an array', 'M3');
  assert(pegs.length === 4, 'pegs contains exactly 4 target equities', 'M3', { count: pegs.length });

  const tickers = pegs.map((p: any) => p.ticker);
  assert(tickers.includes('NVDA'), 'pegs includes NVDA', 'M3');
  assert(tickers.includes('AAPL'), 'pegs includes AAPL', 'M3');
  assert(tickers.includes('TSLA'), 'pegs includes TSLA', 'M3');
  assert(tickers.includes('BENJI'), 'pegs includes BENJI', 'M3');

  // BENJI NAV parity invariant test
  const benjiPeg = pegs.find((p: any) => p.ticker === 'BENJI');
  assert(benjiPeg !== undefined, 'BENJI peg entry exists', 'M3');
  assert(benjiPeg.binancePrice === 1.0, 'BENJI Binance price is strictly $1.0000 NAV parity', 'M3', { price: benjiPeg?.binancePrice });
  assert(benjiPeg.stellarDexPrice === 1.0, 'BENJI DEX price is strictly $1.0000', 'M3', { dexPrice: benjiPeg?.stellarDexPrice });
  assert(benjiPeg.divergenceBps === 0, 'BENJI divergence Bps is strictly 0 bps', 'M3', { divergenceBps: benjiPeg?.divergenceBps });
  assert(benjiPeg.isPegged === true, 'BENJI isPegged is strictly true', 'M3');
  assert(benjiPeg.action === 'HOLD', 'BENJI recommended action is HOLD', 'M3');

  // Verify each volatile equity has valid numeric prices and divergence
  for (const ticker of ['NVDA', 'AAPL', 'TSLA']) {
    const peg = pegs.find((p: any) => p.ticker === ticker);
    assert(peg !== undefined, `${ticker} peg entry exists`, 'M3');
    assert(typeof peg.binancePrice === 'number' && peg.binancePrice > 0, `${ticker} binancePrice is positive number`, 'M3', { price: peg?.binancePrice });
    assert(typeof peg.stellarDexPrice === 'number' && peg.stellarDexPrice > 0, `${ticker} stellarDexPrice is positive number`, 'M3', { dexPrice: peg?.stellarDexPrice });
    assert(typeof peg.divergenceBps === 'number' && !isNaN(peg.divergenceBps) && peg.divergenceBps >= 0, `${ticker} divergenceBps is valid non-negative number`, 'M3', { bps: peg?.divergenceBps });
    assert(typeof peg.isPegged === 'boolean', `${ticker} isPegged is boolean`, 'M3', { isPegged: peg?.isPegged });
    assert(['HOLD', 'UPDATE_MULTIPLIER', 'CIRCUIT_BREAK'].includes(peg.action), `${ticker} action is valid enum`, 'M3', { action: peg?.action });

    // Mathematical verification of divergence formula
    const expectedBps = Math.round((Math.abs(peg.stellarDexPrice - peg.binancePrice) / peg.binancePrice) * 10000);
    assert(peg.divergenceBps === expectedBps, `${ticker} divergence matches mathematical formula round(|dex-cex|/cex * 10000)`, 'M3', { actual: peg.divergenceBps, expected: expectedBps });
  }

  // Unit tests on StellarStockPegEngine under adversarial scenarios
  const pegEngine = new StellarStockPegEngine(250);

  // Scenario A: Within tolerance (<= 250 bps)
  const quoteA = { ticker: 'NVDA', priceUsd: 145.0, timestamp: Date.now(), source: 'BINANCE_SPOT' as const };
  const analysisA = pegEngine.analyzePeg('NVDA', quoteA, 147.0); // divergence: |147 - 145| / 145 = 138 bps <= 250
  assert(analysisA.isPegged === true, 'Engine classifies <= 250 bps as isPegged: true', 'M3-Engine', { bps: analysisA.pegDivergenceBps });
  assert(analysisA.recommendedAction === 'HOLD', 'Engine recommends HOLD for divergence within tolerance', 'M3-Engine');

  // Scenario B: Moderate drift (251 - 500 bps)
  const analysisB = pegEngine.analyzePeg('NVDA', quoteA, 150.0); // divergence: |150 - 145| / 145 = 345 bps > 250 and <= 500
  assert(analysisB.isPegged === false, 'Engine classifies > 250 bps as isPegged: false', 'M3-Engine', { bps: analysisB.pegDivergenceBps });
  assert(analysisB.recommendedAction === 'UPDATE_MULTIPLIER', 'Engine recommends UPDATE_MULTIPLIER for moderate divergence', 'M3-Engine');

  // Scenario C: Extreme flash crash / divergence (> 500 bps)
  const analysisC = pegEngine.analyzePeg('NVDA', quoteA, 160.0); // divergence: |160 - 145| / 145 = 1034 bps > 500
  assert(analysisC.isPegged === false, 'Engine classifies > 500 bps as isPegged: false', 'M3-Engine', { bps: analysisC.pegDivergenceBps });
  assert(analysisC.recommendedAction === 'CIRCUIT_BREAK', 'Engine recommends CIRCUIT_BREAK for extreme divergence', 'M3-Engine');

  // Scenario D: Invalid price handling
  let threwZeroPrice = false;
  try {
    pegEngine.analyzePeg('NVDA', { ...quoteA, priceUsd: 0 }, 145.0);
  } catch {
    threwZeroPrice = true;
  }
  assert(threwZeroPrice, 'Engine throws error on non-positive Binance price', 'M3-Engine');

  // -------------------------------------------------------------------------
  // Mission 4: Error Handling & Resilience
  // -------------------------------------------------------------------------
  console.log('\n--- MISSION 4: Error Handling & 500 JSON Resilience ---');

  // Test 4.1: Simulate network exception on fetch without crash
  const originalFetch = globalThis.fetch;

  // Simulate total fetch explosion (DNS failure, network down, etc.)
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    throw new Error('EAI_AGAIN: Simulated total network failure');
  };

  const resNetworkDown = await GET();
  assert(resNetworkDown.status === 200, 'GET() handles total fetch failure gracefully with fallbacks and returns 200', 'M4', { status: resNetworkDown.status });
  const dataNetworkDown = await resNetworkDown.json();
  assert(dataNetworkDown.latestLedger === 5628100, 'Fallback latestLedger 5628100 is used on RPC fetch failure', 'M4');
  assert(dataNetworkDown.pegs.length === 4, 'All 4 pegs fallback deterministically on Binance fetch failure', 'M4');
  assert(dataNetworkDown.pegs.find((p: any) => p.ticker === 'NVDA')?.binancePrice === 145.0, 'NVDA falls back to 145.0', 'M4');
  assert(dataNetworkDown.pegs.find((p: any) => p.ticker === 'AAPL')?.binancePrice === 220.0, 'AAPL falls back to 220.0', 'M4');
  assert(dataNetworkDown.pegs.find((p: any) => p.ticker === 'TSLA')?.binancePrice === 310.0, 'TSLA falls back to 310.0', 'M4');
  assert(dataNetworkDown.pegs.find((p: any) => p.ticker === 'BENJI')?.binancePrice === 1.0, 'BENJI remains 1.0', 'M4');

  // Test 4.2: Simulate catastrophic unexpected exception inside route execution (e.g. out of memory, prototype tampering)
  // We can trigger the route catch block by mocking Date.now or Promise.all to throw
  const originalPromiseAll = Promise.all;
  (Promise as any).all = () => {
    throw new Error('Simulated catastrophic route exception in internal execution');
  };

  try {
    const resCatastrophic = await GET();
    assert(resCatastrophic.status === 500, 'Catastrophic exception produces HTTP 500 JSON response without process crash', 'M4', { status: resCatastrophic.status });

    const dataCatastrophic = await resCatastrophic.json();
    assert(dataCatastrophic.available === false, '500 JSON response contains available: false', 'M4');
    assert(dataCatastrophic.error === 'Simulated catastrophic route exception in internal execution', '500 JSON response contains error message', 'M4', { error: dataCatastrophic.error });
    assert(dataCatastrophic.network === 'stellar-testnet', '500 JSON response retains network: stellar-testnet', 'M4');
    assert(dataCatastrophic.mode === 'STELLAR_TESTNET_LIVE', '500 JSON response retains mode: STELLAR_TESTNET_LIVE', 'M4');
  } finally {
    Promise.all = originalPromiseAll;
    globalThis.fetch = originalFetch;
  }

  // Test 4.3: Simulate unexpected non-Error throw (e.g. throw "string error")
  (Promise as any).all = () => {
    throw 'Non-error string thrown';
  };

  try {
    const resStringThrow = await GET();
    assert(resStringThrow.status === 500, 'Non-Error thrown produces HTTP 500 JSON response', 'M4', { status: resStringThrow.status });
    const dataStringThrow = await resStringThrow.json();
    assert(dataStringThrow.error === 'Unknown keeper error', 'Fallback error message handled for non-Error thrown', 'M4', { error: dataStringThrow.error });
  } finally {
    Promise.all = originalPromiseAll;
    globalThis.fetch = originalFetch;
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n========================================================================');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`TOTAL ASSERTIONS: ${total}`);
  console.log(`PASSED:           ${passed}`);
  console.log(`FAILED:           ${failed}`);
  console.log(`PASS RATE:        ${((passed / total) * 100).toFixed(1)}%`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
