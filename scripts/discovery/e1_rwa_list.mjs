// E1 (API leg): call the RWA token list with no type and with every type 0..10; record counts per chain/type.
import { writeFileSync } from 'node:fs';
const URL_ = 'https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai';
const H = { 'Accept-Encoding': 'identity', 'User-Agent': 'binance-web3/1.1 (Skill)' };
const out = { generatedAt: new Date().toISOString(), url: URL_, calls: [] };
for (const t of [null, ...Array.from({ length: 11 }, (_, i) => i)]) {
  const u = t === null ? URL_ : `${URL_}?type=${t}`;
  const t0 = Date.now();
  const r = await fetch(u, { headers: H }); const j = await r.json();
  const rows = Array.isArray(j.data) ? j.data : [];
  const byChainType = {}; for (const x of rows) { const k = `chain${x.chainId}/type${x.type}/assetType${x.assetType}`; byChainType[k] = (byChainType[k] ?? 0) + 1; }
  out.calls.push({ type: t, http: r.status, code: j.code, ms: Date.now() - t0, rows: rows.length, byChainType, message: j.message });
  if (t === null) writeFileSync('data/discovery/raw/rwa_list_all.json', JSON.stringify(j));
  console.log(String(t).padEnd(5), r.status, j.code, rows.length, JSON.stringify(byChainType));
}
writeFileSync('data/discovery/e1_rwa_list_by_type.json', JSON.stringify(out, null, 2));
