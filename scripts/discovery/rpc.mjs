// Minimal JSON-RPC helper for BSC reads. No dependencies.
export const RPC = process.env.BSC_RPC_URL || 'https://bsc-dataseed1.defibit.io';
let id = 0;
export async function rpc(method, params = [], url = RPC) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}
export const call = (to, data, block = 'latest') => rpc('eth_call', [{ to, data }, block]);
export const getCode = (a) => rpc('eth_getCode', [a, 'latest']);
export const getStorage = (a, slot) => rpc('eth_getStorageAt', [a, slot, 'latest']);
export const hexToBig = (h) => BigInt(h);
export function decodeString(hex) {
  const b = Buffer.from(hex.slice(2), 'hex');
  if (b.length === 32) return b.toString('utf8').replace(/\0+$/, '');
  const len = Number(BigInt('0x' + b.subarray(32, 64).toString('hex')));
  return b.subarray(64, 64 + len).toString('utf8');
}
