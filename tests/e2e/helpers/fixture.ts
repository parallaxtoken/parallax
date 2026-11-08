/**
 * Parallax E2E Testing Framework Fixture
 * 
 * Provides an isolated, zero-dependency test runner and assertion library
 * compatible with both TSX standalone execution and standard Vitest/Jest runners.
 */

export interface TestCase {
  title: string;
  suite: string;
  fn: () => void | Promise<void>;
  tier: number;
}

export interface TestResult {
  title: string;
  suite: string;
  tier: number;
  passed: boolean;
  durationMs: number;
  error?: string;
}

class TestRegistry {
  private static instance: TestRegistry;
  public tests: TestCase[] = [];
  public currentSuite = 'Default Suite';
  public currentTier = 1;

  public static getInstance(): TestRegistry {
    if (!TestRegistry.instance) {
      TestRegistry.instance = new TestRegistry();
    }
    return TestRegistry.instance;
  }
}

const registry = TestRegistry.getInstance();

export function setTestTier(tier: number) {
  registry.currentTier = tier;
}

export function describe(suiteName: string, fn: () => void) {
  const previousSuite = registry.currentSuite;
  registry.currentSuite = previousSuite === 'Default Suite' ? suiteName : `${previousSuite} > ${suiteName}`;
  fn();
  registry.currentSuite = previousSuite;
}

export function it(testName: string, fn: () => void | Promise<void>) {
  registry.tests.push({
    title: testName,
    suite: registry.currentSuite,
    fn,
    tier: registry.currentTier,
  });
}

export const test = it;

// ==========================================
// ASSERTION ENGINE (expect)
// ==========================================

class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

export function expect<T>(actual: T) {
  const isNot = false;

  const matchers = (negated: boolean) => ({
    toBe(expected: unknown) {
      const pass = Object.is(actual, expected);
      if (negated ? pass : !pass) {
        throw new AssertionError(`Expected ${JSON.stringify(actual)} ${negated ? 'not to be' : 'to be'} ${JSON.stringify(expected)}`);
      }
    },

    toEqual(expected: unknown) {
      const actualJson = JSON.stringify(actual, (_, v) => typeof v === 'bigint' ? v.toString() : v);
      const expectedJson = JSON.stringify(expected, (_, v) => typeof v === 'bigint' ? v.toString() : v);
      const pass = actualJson === expectedJson;
      if (negated ? pass : !pass) {
        throw new AssertionError(`Expected ${actualJson} ${negated ? 'not to equal' : 'to equal'} ${expectedJson}`);
      }
    },

    toContain(expected: unknown) {
      let pass = false;
      if (typeof actual === 'string' && typeof expected === 'string') {
        pass = actual.includes(expected);
      } else if (Array.isArray(actual)) {
        pass = actual.includes(expected);
      }
      if (negated ? pass : !pass) {
        throw new AssertionError(`Expected ${JSON.stringify(actual)} ${negated ? 'not to contain' : 'to contain'} ${JSON.stringify(expected)}`);
      }
    },

    toBeDefined() {
      const pass = actual !== undefined;
      if (negated ? pass : !pass) {
        throw new AssertionError(`Expected value ${negated ? 'to be undefined' : 'to be defined'}`);
      }
    },

    toBeUndefined() {
      const pass = actual === undefined;
      if (negated ? pass : !pass) {
        throw new AssertionError(`Expected value ${negated ? 'not to be undefined' : 'to be undefined'}, got ${JSON.stringify(actual)}`);
      }
    },

    toBeGreaterThan(expected: number | bigint) {
      const pass = (actual as any) > (expected as any);
      if (negated ? pass : !pass) {
        throw new AssertionError(`Expected ${actual} ${negated ? 'not to be greater than' : 'to be greater than'} ${expected}`);
      }
    },

    toBeGreaterThanOrEqual(expected: number | bigint) {
      const pass = (actual as any) >= (expected as any);
      if (negated ? pass : !pass) {
        throw new AssertionError(`Expected ${actual} ${negated ? 'not to be >= ' : 'to be >= '} ${expected}`);
      }
    },

    toBeLessThan(expected: number | bigint) {
      const pass = (actual as any) < (expected as any);
      if (negated ? pass : !pass) {
        throw new AssertionError(`Expected ${actual} ${negated ? 'not to be less than' : 'to be less than'} ${expected}`);
      }
    },

    toBeLessThanOrEqual(expected: number | bigint) {
      const pass = (actual as any) <= (expected as any);
      if (negated ? pass : !pass) {
        throw new AssertionError(`Expected ${actual} ${negated ? 'not to be <= ' : 'to be <= '} ${expected}`);
      }
    },

    toHaveLength(expected: number) {
      const len = (actual as any)?.length;
      const pass = len === expected;
      if (negated ? pass : !pass) {
        throw new AssertionError(`Expected length ${len} ${negated ? 'not to be' : 'to be'} ${expected}`);
      }
    },

    toMatch(pattern: RegExp) {
      const pass = pattern.test(String(actual));
      if (negated ? pass : !pass) {
        throw new AssertionError(`Expected "${actual}" ${negated ? 'not to match' : 'to match'} ${pattern}`);
      }
    },

    toThrow(pattern?: RegExp | string) {
      let threw = false;
      let errorMsg = '';
      try {
        if (typeof actual === 'function') {
          (actual as any)();
        } else {
          throw new AssertionError('expect(fn).toThrow() requires a function');
        }
      } catch (err: any) {
        threw = true;
        errorMsg = err?.message || String(err);
      }

      let matches = threw;
      if (threw && pattern) {
        if (pattern instanceof RegExp) {
          matches = pattern.test(errorMsg);
        } else {
          matches = errorMsg.includes(pattern);
        }
      }

      if (negated ? matches : !matches) {
        throw new AssertionError(
          `Expected function ${negated ? 'not to throw' : 'to throw'} matching ${pattern}, ${threw ? `threw: "${errorMsg}"` : 'did not throw'}`
        );
      }
    },
  });

  return {
    ...matchers(false),
    not: matchers(true),
  };
}

export async function runAllTests(tierFilter?: number): Promise<{
  results: TestResult[];
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
}> {
  const testsToRun = tierFilter !== undefined
    ? registry.tests.filter((t) => t.tier === tierFilter)
    : registry.tests;

  const results: TestResult[] = [];
  const t0 = Date.now();

  for (const test of testsToRun) {
    const start = Date.now();
    try {
      await test.fn();
      results.push({
        title: test.title,
        suite: test.suite,
        tier: test.tier,
        passed: true,
        durationMs: Date.now() - start,
      });
    } catch (err: any) {
      results.push({
        title: test.title,
        suite: test.suite,
        tier: test.tier,
        passed: false,
        durationMs: Date.now() - start,
        error: err?.message || String(err),
      });
    }
  }

  const durationMs = Date.now() - t0;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return {
    results,
    total: results.length,
    passed,
    failed,
    durationMs,
  };
}
