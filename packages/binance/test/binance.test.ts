import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PublicRwaClient, SignedClient, classify, isDegraded, isNotFound, sign } from '../src';

const fx = (n: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', n), 'utf8'));
const jsonFetch = (status: number, body: unknown): typeof fetch =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('public client', () => {
  it('parses the catalogue and lowercases addresses', async () => {
    const c = new PublicRwaClient({ fetchImpl: jsonFetch(200, fx('list.json')) });
    const r = await c.list();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toHaveLength(3);
      expect(r.data.every((x) => x.contractAddress === x.contractAddress.toLowerCase())).toBe(true);
      expect(new Set(r.data.map((x) => x.type))).toEqual(new Set([1, 2, 3]));
    }
  });

  it('parses a dynamic response and keeps a missing reference as null', async () => {
    const f = fx('dynamic_ondo.json');
    f.data.stockInfo.price = null;
    const r = await new PublicRwaClient({ fetchImpl: jsonFetch(200, f) }).dynamic('0xabc');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.stockPrice).toBeNull();
      expect(r.data.sharesMultiplier).not.toBeNull();
    }
  });

  it('treats HTTP 200 with a failure code as a typed body error, not data', async () => {
    const r = await new PublicRwaClient({ fetchImpl: jsonFetch(200, { code: '40001', message: 'Parameter binanceChainId is required', data: null, success: false }) }).list();
    expect(isDegraded(r)).toBe(true);
    if (!r.ok && 'degraded' in r) expect(r.degraded.kind).toBe('BODY_ERROR');
  });

  it('keeps unreachable and not-found apart (T12)', async () => {
    const down = await new PublicRwaClient({ fetchImpl: (async () => { throw new Error('connect ETIMEDOUT'); }) as unknown as typeof fetch }).marketStatus();
    expect(isDegraded(down)).toBe(true);
    const none = await new PublicRwaClient({ fetchImpl: jsonFetch(200, { code: '000000', success: true, data: null }) }).dynamic('0xabc');
    expect(isNotFound(none)).toBe(true);
    expect(isDegraded(none)).toBe(false);
  });

  it('maps 403 to a geo block and 429 to rate limiting', () => {
    const geo = classify(403, null, 1, () => 1);
    const rl = classify(429, null, 1, () => 1);
    expect(!geo.ok && 'degraded' in geo && geo.degraded.kind).toBe('GEO_BLOCKED');
    expect(!rl.ok && 'degraded' in rl && rl.degraded.kind).toBe('RATE_LIMITED');
  });

  it('rejects a malformed shape rather than guessing', async () => {
    const r = await new PublicRwaClient({ fetchImpl: jsonFetch(200, { code: '000000', success: true, data: 'nope' }) }).list();
    expect(!r.ok && 'degraded' in r && r.degraded.kind).toBe('MALFORMED');
  });
});

describe('signed client', () => {
  it('signs timestamp + METHOD + /build path with query + body', () => {
    const ts = '2026-05-11T10:08:57.715Z';
    const sig = sign('secret', ts, 'get', '/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT', '');
    expect(sig).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(sig).toBe(sign('secret', ts, 'GET', '/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT', ''));
    expect(sig).not.toBe(sign('secret', ts, 'GET', '/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT', ''));
  });

  it('sends the key, timestamp and signature headers on the /build path', async () => {
    let seen: { url: string; headers: Record<string, string> } | null = null;
    const f = (async (url: string, init: RequestInit) => {
      seen = { url, headers: init.headers as Record<string, string> };
      return new Response(JSON.stringify({ code: '000000', success: true, data: [{ quoteId: 'q1', toTokenAmount: '100', executionMode: 'SWAP', vendorName: 'LiquidMesh' }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const c = new SignedClient({ apiKey: 'k', secretKey: 's', fetchImpl: f, now: () => new Date('2026-10-10T00:00:00.000Z') });
    const r = await c.quote({ from: '0xa', to: '0xb', amountRaw: '1', taker: '0xc' });
    expect(r.ok).toBe(true);
    expect(seen).not.toBeNull();
    const s = seen as unknown as { url: string; headers: Record<string, string> };
    expect(s.url.startsWith('https://web3.binance.com/build/api/v1/dex/aggregator/quote?')).toBe(true);
    expect(s.headers['X-OC-APIKEY']).toBe('k');
    expect(s.headers['X-OC-TIMESTAMP']).toBe('2026-10-10T00:00:00.000Z');
    expect(s.headers['X-OC-SIGN']).toBeTruthy();
  });

  it('maps a missing key to AUTH, not data', async () => {
    const c = new SignedClient({ apiKey: '', secretKey: '', fetchImpl: jsonFetch(401, { msg: 'API Key is required', code: 40101 }) });
    const r = await c.quote({ from: '0xa', to: '0xb', amountRaw: '1', taker: '0xc' });
    expect(!r.ok && 'degraded' in r && r.degraded.kind).toBe('AUTH');
  });
});
