// E11 (pool leg): list every DEX pool per wrapper from GeckoTerminal (public), with dex, quote token,
// reserve USD and 24h volume. Rate-limited to 30 req/min.
import { readFileSync, writeFileSync } from 'node:fs';
const map = JSON.parse(readFileSync('data/discovery/e1_wrapper_map.json', 'utf8'));
const out = { generatedAt: new Date().toISOString(), source: 'GeckoTerminal /networks/bsc/tokens/{addr}/pools', wrappers: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [ticker, rows] of Object.entries(map.tickers)) for (const w of rows) {
  let j;
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/bsc/tokens/${w.token}/pools?page=1`, { headers: { accept: 'application/json' } });
      if (r.status === 429) { await sleep(15000); continue; }
      j = await r.json(); break;
    } catch { await sleep(8000); }
  }
  const pools = (j?.data ?? []).map((p) => ({ pool: p.attributes.address, name: p.attributes.name, dex: p.relationships.dex.data.id, reserveUsd: Number(p.attributes.reserve_in_usd), volume24hUsd: Number(p.attributes.volume_usd?.h24 ?? 0), feeName: p.attributes.pool_fee_percentage ?? null }));
  out.wrappers.push({ ticker, issuer: w.issuer, symbol: w.chain_symbol, token: w.token, pools });
  console.log(ticker, w.chain_symbol, pools.slice(0, 4).map((p) => `${p.dex}:${Math.round(p.reserveUsd)}`).join(' ') + ` (${pools.length} pools)` || 'NO POOLS');
  await sleep(2300);
}
writeFileSync('data/discovery/e11_pools.json', JSON.stringify(out, null, 2));
