// E8: reconstruct unit history. Ondo: oracle logs (SValueUpdated, CorporateAction*), windowed raw eth_getLogs.
// xStocks: multiplierUpdates[] state array. bStocks: UIMultiplierUpdated logs on each token, same windows.
import { readFileSync, writeFileSync } from 'node:fs';
import { keccak256, toBytes, createPublicClient, http, parseAbi } from 'viem';
import { bsc } from 'viem/chains';
const LOGS = process.env.LOGS_RPC_URL || 'https://bsc.rpc.blxrbdn.com', STATE = process.env.BSC_RPC_URL || 'https://bsc-dataseed1.defibit.io';
const DAYS = Number(process.env.DAYS || 30), WIN = 4999, CONC = 4;
const ORACLE = '0xF4Fd8a1B412633e10527454137A29Db7Aa35F15e';
const post = async (u, m, p) => { for (let a = 0; a < 6; a++) { try { const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }), signal: AbortSignal.timeout(20000) }); const j = await r.json(); if (!j.error) return j.result; if (a === 5) throw new Error(j.error.message); } catch (e) { if (a === 5) throw e; } await new Promise((r) => setTimeout(r, 800 * (a + 1))); } };
const sig = (s) => keccak256(toBytes(s));
const T = { SValueUpdated: sig('SValueUpdated(address,uint256,uint256)'), CorporateActionScheduled: sig('CorporateActionScheduled(address,uint128,uint256)'), CorporateActionApplied: sig('CorporateActionApplied(address,uint128,uint128)'), CorporateActionCancelled: sig('CorporateActionCancelled(address)'), AssetAdded: sig('AssetAdded(address,uint256,uint256,uint256)'), AssetRemoved: sig('AssetRemoved(address)'), DriftParametersUpdated: sig('DriftParametersUpdated(address,uint256,uint256,uint256,uint256)'), MinimumPauseDurationUpdated: sig('MinimumPauseDurationUpdated(uint256,uint256)'), RoleGranted: sig('RoleGranted(bytes32,address,address)'), RoleRevoked: sig('RoleRevoked(bytes32,address,address)'), RoleAdminChanged: sig('RoleAdminChanged(bytes32,bytes32,bytes32)'), UIMultiplierUpdated: sig('UIMultiplierUpdated(uint256,uint256,uint256)') };
const name = Object.fromEntries(Object.entries(T).map(([k, v]) => [v, k]));
const head = parseInt(await post(LOGS, 'eth_blockNumber', []), 16), from = head - DAYS * 115200;
const map = JSON.parse(readFileSync('data/discovery/e1_wrapper_map.json', 'utf8'));
const bstocks = Object.values(map.tickers).flat().filter((w) => w.issuer === 'BSTOCKS');
const windows = []; for (let hi = head; hi > from; hi -= WIN) windows.push([Math.max(from, hi - WIN + 1), hi]);
const out = { generatedAt: new Date().toISOString(), headBlock: head, fromBlock: from, days: DAYS, windows: windows.length, ondoOracleEvents: [], bstockMultiplierEvents: [], failedWindows: [] };
let next = 0, done = 0;
await Promise.all(Array.from({ length: CONC }, async () => { for (;;) { const i = next++; if (i >= windows.length) return; const [lo, hi] = windows[i]; const range = { fromBlock: '0x' + lo.toString(16), toBlock: '0x' + hi.toString(16) };
  try {
    for (const l of await post(LOGS, 'eth_getLogs', [{ ...range, address: ORACLE }])) out.ondoOracleEvents.push({ block: parseInt(l.blockNumber, 16), tx: l.transactionHash, event: name[l.topics[0]] ?? l.topics[0], asset: l.topics[1] ? '0x' + l.topics[1].slice(26) : null, data: l.data });
    for (const l of await post(LOGS, 'eth_getLogs', [{ ...range, address: bstocks.map((w) => w.token), topics: [T.UIMultiplierUpdated] }])) out.bstockMultiplierEvents.push({ block: parseInt(l.blockNumber, 16), tx: l.transactionHash, token: l.address, data: l.data });
  } catch (e) { out.failedWindows.push({ lo, hi, error: e.message }); }
  if (++done % 100 === 0) console.log('windows', done, '/', windows.length); } }));
out.ondoOracleEvents.sort((a, b) => a.block - b.block); out.bstockMultiplierEvents.sort((a, b) => a.block - b.block);
const c = createPublicClient({ chain: bsc, transport: http(STATE) });
const xs = parseAbi(['function multiplierUpdatesLength() view returns (uint256)', 'function multiplierUpdates(uint256) view returns (uint256 previousMultiplier, uint256 newMultiplier, uint256 activationTime)']);
out.xstocksUpdates = {};
for (const [t, rows] of Object.entries(map.tickers)) for (const w of rows.filter((r) => r.issuer === 'XSTOCKS')) {
  try { const n = Number(await c.readContract({ address: w.token, abi: xs, functionName: 'multiplierUpdatesLength' })); const arr = [];
    for (let i = Math.max(0, n - 8); i < n; i++) { const u = await c.readContract({ address: w.token, abi: xs, functionName: 'multiplierUpdates', args: [BigInt(i)] }); arr.push({ i, previousMultiplier: u[0].toString(), newMultiplier: u[1].toString(), activationTime: new Date(Number(u[2]) * 1000).toISOString() }); }
    out.xstocksUpdates[t] = { token: w.token, n, lastUpdates: arr };
  } catch (e) { out.xstocksUpdates[t] = { token: w.token, error: e.shortMessage || e.message }; }
}
writeFileSync('data/discovery/e8_unit_history.json', JSON.stringify(out, null, 2));
console.log('ondo events', out.ondoOracleEvents.length, 'bstock events', out.bstockMultiplierEvents.length, 'failed windows', out.failedWindows.length);
