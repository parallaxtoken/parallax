// E7 (view-level): can an arbitrary contract/EOA hold/receive the token? checkIsCompliant reverts if not.
import { createPublicClient, http, parseAbi } from 'viem';
import { bsc } from 'viem/chains';
const c = createPublicClient({ chain: bsc, transport: http(process.env.BSC_RPC_URL || 'https://bsc-dataseed1.defibit.io') });
const tok = parseAbi(['function compliance() view returns (address)','function symbol() view returns (string)']);
const cmp = parseAbi(['function checkIsCompliant(address token, address user) view']);
const [token, ...subjects] = process.argv.slice(2);
const compliance = await c.readContract({ address: token, abi: tok, functionName: 'compliance' });
const out = { token, compliance, block: (await c.getBlockNumber()).toString(), results: {} };
for (const s of subjects) {
  try { await c.readContract({ address: compliance, abi: cmp, functionName: 'checkIsCompliant', args: [token, s] }); out.results[s] = 'COMPLIANT'; }
  catch (e) { out.results[s] = 'REVERT ' + (e.shortMessage || e.message).slice(0, 160); }
}
console.log(JSON.stringify(out, null, 1));
