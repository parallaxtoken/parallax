// Resolve proxy (EIP-1967 impl/beacon) and download verified source from Sourcify. usage: node fetch_source.mjs <addr> <outdir>
import { createPublicClient, http, parseAbi } from 'viem';
import { bsc } from 'viem/chains';
import { mkdirSync, writeFileSync } from 'node:fs';
const c = createPublicClient({ chain: bsc, transport: http(process.env.BSC_RPC_URL || 'https://bsc-dataseed1.defibit.io') });
const [addr, out] = process.argv.slice(2);
const IMPL = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc', BEACON = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50';
const slot = async (a, s) => { const v = await c.getStorageAt({ address: a, slot: s }); return v && BigInt(v) ? '0x' + v.slice(26) : null; };
let impl = await slot(addr, IMPL), beacon = null;
if (!impl) { beacon = await slot(addr, BEACON); if (beacon) impl = await c.readContract({ address: beacon, abi: parseAbi(['function implementation() view returns (address)']), functionName: 'implementation' }); }
if (!impl) { const code = await c.getCode({ address: addr }); const m = /363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3/i.exec(code); if (m) impl = '0x' + m[1]; }
console.log(JSON.stringify({ addr, impl, beacon }));
for (const a of [addr, impl].filter(Boolean)) {
  const r = await fetch(`https://sourcify.dev/server/v2/contract/56/${a}?fields=all`);
  if (!r.ok) { console.log(a, 'sourcify', r.status); continue; }
  const j = await r.json(); const d = `${out}/${a}`; mkdirSync(d, { recursive: true });
  writeFileSync(`${d}/abi.json`, JSON.stringify(j.abi, null, 1));
  for (const [p, s] of Object.entries(j.sources ?? {})) { if (p.includes('node_modules') || p.includes('openzeppelin') || p.startsWith('lib/')) continue; const f = `${d}/${p.replace(/[\/]/g, '__')}`; writeFileSync(f, s.content); }
  console.log(a, 'match', j.match, 'fns', (j.abi ?? []).filter(x => x.type === 'function').map(x => x.name).join(','));
}
