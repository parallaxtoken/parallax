import { createPublicClient, http, parseAbi } from 'viem';
import { bsc } from 'viem/chains';
const c = createPublicClient({ chain: bsc, transport: http(process.env.BSC_RPC_URL || 'https://bsc-dataseed1.defibit.io') });
const abi = parseAbi(['function uiMultiplier() view returns (uint256)','function newUIMultiplier() view returns (uint256)','function effectiveAt() view returns (uint256)','function hasPendingMultiplier() view returns (bool)','function compliance() view returns (address)','function pauseManager() view returns (address)','function identifier() view returns (string)','function symbol() view returns (string)','function totalSupply() view returns (uint256)']);
const t = process.argv[2];
const block = await c.getBlockNumber();
const r = {};
for (const f of ['symbol','identifier','uiMultiplier','newUIMultiplier','effectiveAt','hasPendingMultiplier','compliance','pauseManager','totalSupply']) {
  try { const v = await c.readContract({ address: t, abi, functionName: f }); r[f] = typeof v === 'bigint' ? v.toString() : v; } catch (e) { r[f] = 'ERR ' + e.shortMessage; }
}
const pmAbi = parseAbi(['function isTokenPaused(address) view returns (bool)']);
try { r.isTokenPaused = await c.readContract({ address: r.pauseManager, abi: pmAbi, functionName: 'isTokenPaused', args: [t] }); } catch (e) { r.isTokenPaused = 'ERR ' + e.shortMessage; }
r.block = block.toString();
console.log(JSON.stringify(r, null, 1));
