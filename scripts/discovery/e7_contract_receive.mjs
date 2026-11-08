// E7 (eth_call leg): simulate transfer(contract, amount) from a real holder (a pool) for every wrapper. A revert
// means a contract recipient is refused. A Foundry fork test repeats this against a freshly deployed contract.
import { readFileSync, writeFileSync } from 'node:fs';
import { createPublicClient, http, parseAbi } from 'viem';
import { bsc } from 'viem/chains';
const c = createPublicClient({ chain: bsc, transport: http(process.env.BSC_RPC_URL || 'https://bsc-dataseed1.defibit.io') });
const pools = JSON.parse(readFileSync('data/discovery/e11_pools.json', 'utf8'));
const erc = parseAbi(['function transfer(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)']);
const RECIPIENTS = { contract_v3_router: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4', contract_multicall3: '0xcA11bde05977b3631167028862bE2a173976CA11', eoa_fresh: '0x1111111111111111111111111111111111111111' };
const out = { generatedAt: new Date().toISOString(), block: (await c.getBlockNumber()).toString(), recipients: RECIPIENTS, rows: [] };
for (const w of pools.wrappers) {
  const row = { ticker: w.ticker, issuer: w.issuer, symbol: w.symbol, token: w.token, holder: null, results: {} };
  for (const p of w.pools.filter((x) => x.pool && x.dex !== 'uniswap-v4-bsc' && x.dex !== 'pancakeswap-infinity-clmm')) {
    try { const b = await c.readContract({ address: w.token, abi: erc, functionName: 'balanceOf', args: [p.pool] }); if (b > 10n ** 12n) { row.holder = p.pool; break; } } catch { /* next */ }
  }
  if (!row.holder) { row.results = 'NO_HOLDER_FOUND'; out.rows.push(row); console.log(w.symbol.padEnd(8), 'no holder'); continue; }
  for (const [k, to] of Object.entries(RECIPIENTS)) {
    try { await c.simulateContract({ address: w.token, abi: erc, functionName: 'transfer', args: [to, 10n ** 12n], account: row.holder }); row.results[k] = 'OK'; }
    catch (e) { row.results[k] = 'REVERT ' + (e.shortMessage || e.message).slice(0, 140); }
  }
  out.rows.push(row);
  console.log(w.symbol.padEnd(8), JSON.stringify(row.results));
}
writeFileSync('data/discovery/e7_contract_receive.json', JSON.stringify(out, null, 2));
