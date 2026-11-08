// Typed degraded states (T12). "Cannot look" and "nothing found" are different results everywhere.

export type Degraded =
  | { kind: 'UNREACHABLE'; message: string } // network failure or timeout, nothing was learned
  | { kind: 'GEO_BLOCKED'; message: string } // refused for the caller region
  | { kind: 'AUTH'; message: string } // missing or invalid API key or signature
  | { kind: 'RATE_LIMITED'; message: string }
  | { kind: 'BODY_ERROR'; code: string; message: string } // HTTP 200 carrying a failure code
  | { kind: 'MALFORMED'; message: string }; // response shape did not match

export type Result<T> =
  | { ok: true; data: T; latencyMs: number }
  | { ok: false; degraded: Degraded; latencyMs: number }
  | { ok: false; notFound: true; latencyMs: number };

export const isDegraded = <T>(r: Result<T>): r is Extract<Result<T>, { degraded: Degraded }> => !r.ok && 'degraded' in r;
export const isNotFound = <T>(r: Result<T>): boolean => !r.ok && 'notFound' in r;

export interface RawEnvelope {
  code?: string | number;
  success?: boolean;
  message?: string | null;
  msg?: string | null;
  data?: unknown;
}

/** Maps an HTTP status and envelope to a typed result. HTTP 200 does not mean success. */
export function classify<T>(
  http: number,
  env: RawEnvelope | null,
  latencyMs: number,
  parse: (data: unknown) => T | null,
): Result<T> {
  if (http === 401 || http === 403) {
    return { ok: false, degraded: { kind: http === 403 ? 'GEO_BLOCKED' : 'AUTH', message: `HTTP ${http}` }, latencyMs };
  }
  if (http === 429) return { ok: false, degraded: { kind: 'RATE_LIMITED', message: 'HTTP 429' }, latencyMs };
  if (http >= 500 || env === null) {
    return { ok: false, degraded: { kind: 'UNREACHABLE', message: `HTTP ${http}` }, latencyMs };
  }
  const code = String(env.code ?? '');
  const okCode = code === '000000' || code === '0' || code === '200';
  if (!okCode || env.success === false) {
    const msg = String(env.message ?? env.msg ?? 'unknown error');
    if (/restricted|region|country|prohibit/i.test(msg) || code === '40304' || code === '40305') {
      return { ok: false, degraded: { kind: 'GEO_BLOCKED', message: msg }, latencyMs };
    }
    if (code === '40101' || code === '40102' || code === '40103') {
      return { ok: false, degraded: { kind: 'AUTH', message: msg }, latencyMs };
    }
    return { ok: false, degraded: { kind: 'BODY_ERROR', code, message: msg }, latencyMs };
  }
  if (env.data === null || env.data === undefined) return { ok: false, notFound: true, latencyMs };
  const parsed = parse(env.data);
  if (parsed === null) return { ok: false, degraded: { kind: 'MALFORMED', message: 'unexpected response shape' }, latencyMs };
  return { ok: true, data: parsed, latencyMs };
}
