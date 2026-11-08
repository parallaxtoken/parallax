import { describe, expect, it } from 'vitest';
import { disagreementBps, independentReference, parseNasdaqQuote, parseYahooChart, verdict } from '../src';

const wad = (s: string) => BigInt(Math.round(Number(s) * 1e6)) * 10n ** 12n;

const yahooIntraday = { chart: { result: [{ timestamp: [1791576000, 1791576300], indicators: { quote: [{ close: [229.1, null] }] } }] } };
const yahooDaily = { chart: { result: [{ timestamp: [1791400000, 1791486400], indicators: { quote: [{ close: [230.48, 229.28] }] } }] } };

describe('independent reference', () => {
  it('parses a yahoo chart skipping a null last bar', () => {
    const r = parseYahooChart('NVDA', yahooIntraday, yahooDaily, '2026-10-10T00:00:00Z');
    expect(r.intraday?.price).toBe('229.100000');
    expect(r.daily?.close).toBe('229.280000');
    expect(r.daily?.previousClose).toBe('230.480000');
    expect(r.usdPerShare).toBe(wad('229.1'));
    expect(r.source).toBe('YAHOO_CHART');
  });
  it('parses a nasdaq quote and rejects a malformed one', () => {
    const r = parseNasdaqQuote('NVDA', { data: { primaryData: { lastSalePrice: '$1,229.28', lastTradeTimestamp: 'Oct 9, 2026' } } }, 'x');
    expect(r.usdPerShare).toBe(wad('1229.28'));
    expect(() => parseNasdaqQuote('NVDA', { data: {} }, 'x')).toThrow();
  });
  it('falls over from yahoo to nasdaq and then fails typed, never with a made-up price', async () => {
    const f = (async (url: string) => {
      if (url.includes('yahoo')) return { ok: false, status: 429, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ data: { primaryData: { lastSalePrice: '$229.28', lastTradeTimestamp: 'Oct 9, 2026' } } }) };
    }) as unknown as typeof fetch;
    const ok = await independentReference('NVDA', { fetchImpl: f });
    expect(ok.ok && ok.source).toBe('NASDAQ_QUOTE');
    const down = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
    const bad = await independentReference('NVDA', { fetchImpl: down });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.tried).toEqual(['YAHOO_CHART', 'NASDAQ_QUOTE']);
  });
  it('computes disagreement in bps of the independent price', () => {
    expect(disagreementBps(wad('230.53'), wad('229.28'))).toBe(54);
    expect(disagreementBps(wad('100'), 0n)).toBe(Number.POSITIVE_INFINITY);
  });
  it('fails closed: disagreement refuses, a missing independent source refuses when required', () => {
    expect(verdict(wad('230.53'), wad('229.28'), 200, true).status).toBe('AGREE');
    expect(verdict(wad('240'), wad('229.28'), 200, true).status).toBe('DISAGREE');
    expect(verdict(wad('230'), null, 200, true).status).toBe('UNAVAILABLE');
    expect(verdict(wad('230'), null, 200, false).floorSource).toBe('ISSUER_FEED');
    expect(verdict(null, wad('229'), 200, true).floorSource).toBe('INDEPENDENT');
    expect(verdict(null, null, 200, false).status).toBe('UNAVAILABLE');
  });
});
