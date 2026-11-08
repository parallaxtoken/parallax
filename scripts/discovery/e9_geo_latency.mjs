// E9: latency of the public RWA endpoints from the current egress (set by VPN). Records egress IP/country.
import { writeFileSync } from 'node:fs';
import { marketStatus, dynamicV2, bapi } from './lib_binance.mjs';
const geo = await (await fetch('https://ipinfo.io/json')).json();
const NV = '0x02fca66c1d1afb4e2a7884261eb00f63598a7436';
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const out = { generatedAt: new Date().toISOString(), egress: { country: geo.country, region: geo.region, city: geo.city, org: geo.org }, endpoints: {} };
const eps = { marketStatus: () => marketStatus(), dynamicV2: () => dynamicV2(NV), list: () => bapi('/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai', { type: 3 }) };
for (const [n, f] of Object.entries(eps)) { const ms = [], codes = {}; for (let i = 0; i < 15; i++) { const r = await f(); ms.push(r.ms); codes[`${r.http}/${r.code}`] = (codes[`${r.http}/${r.code}`] ?? 0) + 1; } out.endpoints[n] = { n: ms.length, p50: pct(ms, 0.5), p95: pct(ms, 0.95), min: Math.min(...ms), max: Math.max(...ms), codes }; }
writeFileSync('data/discovery/e9_geo_latency.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
