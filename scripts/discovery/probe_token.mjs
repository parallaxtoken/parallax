import { call, getCode, getStorage, decodeString } from './rpc.mjs';
const a = process.argv[2];
const sel = { name: '0x06fdde03', symbol: '0x95d89b41', decimals: '0x313ce567', totalSupply: '0x18160ddd' };
const IMPL = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const out = { address: a };
const code = await getCode(a); out.codeBytes = (code.length - 2) / 2;
for (const [k, s] of Object.entries(sel)) { try { const r = await call(a, s); out[k] = k.startsWith('n') || k === 'symbol' ? decodeString(r) : BigInt(r).toString(); } catch (e) { out[k] = 'ERR ' + e.message; } }
out.eip1967Impl = '0x' + (await getStorage(a, IMPL)).slice(26);
console.log(JSON.stringify(out, null, 1));
