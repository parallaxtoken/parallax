// Builds the wrapper registry from evidence and the RWA catalogue:
//   core tickers : data/discovery/e1 + e2 (addresses, selectors, provenance)
//   all others   : every BSC token the RWA list serves (type 1 Ondo, 2 xStocks, 3 bStocks), kept only when its
//                  issuer unit source answers on-chain and a direct PancakeSwap pool against USDT exists.
// Outputs packages/registry/src/wrappers.generated.json and contracts/script/wrappers.flat.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { createPublicClient, http, keccak256, parseAbi, toBytes, toFunctionSelector } from 'viem';
import { bsc } from 'viem/chains';

const J = (f) => JSON.parse(readFileSync(`data/discovery/${f}`, 'utf8'));
const c = createPublicClient({ chain: bsc, transport: http(process.env.BSC_RPC_URL || 'https://bsc-dataseed1.defibit.io'), batch: { multicall: true } });
const USDT = '0x55d398326f99059fF775485246999027B3197955';
const ORACLE = '0xF4Fd8a1B412633e10527454137A29Db7Aa35F15e';
const V3F = '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865';
const V2F = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';
const ZERO = '0x0000000000000000000000000000000000000000';
const abis = {
  f3: parseAbi(['function getPool(address,address,uint24) view returns (address)']),
  f2: parseAbi(['function getPair(address,address) view returns (address)']),
  erc: parseAbi(['function balanceOf(address) view returns (uint256)']),
  b: parseAbi(['function uiMultiplier() view returns (uint256)', 'function pauseManager() view returns (address)']),
  o: parseAbi(['function getSValue(address) view returns (uint128, bool)', 'function tokenPauseManager() view returns (address)']),
  x: parseAbi(['function isPaused() view returns (bool)', 'function getCurrentMultiplier() view returns (uint256,uint256,uint256)']),
};
const TYPE_ISSUER = { 1: 'ONDO', 2: 'XSTOCKS', 3: 'BSTOCKS' };
const SELECTOR = { BSTOCKS: toFunctionSelector('uiMultiplier()'), ONDO: toFunctionSelector('getSValue(address)'), XSTOCKS: toFunctionSelector('getCurrentMultiplier()') };
const PAUSE_SELECTOR = { BSTOCKS: toFunctionSelector('isTokenPaused(address)'), ONDO: toFunctionSelector('isTokenPaused(address)'), XSTOCKS: toFunctionSelector('isPaused()') };
const MIN_DEPTH_USDT = 100n * 10n ** 18n;
const KIND = { BSTOCKS: 'TOKEN_UI_MULTIPLIER', ONDO: 'ORACLE_SVALUE', XSTOCKS: 'BALANCE_IS_SHARES' };

const e1 = J('e1_wrapper_map.json');
const e2 = J('e2_unit_factors.json');
const e11 = J('e11_pools.json');
const e7 = J('e7_contract_receive.json');
const list = JSON.parse(readFileSync('data/discovery/raw/rwa_list_all.json', 'utf8')).data.filter((x) => x.chainId === '56' && TYPE_ISSUER[x.type]);
const coreTokens = new Set(e2.wrappers.map((w) => w.token.toLowerCase()));
const recv = Object.fromEntries(e7.rows.map((r) => [r.token.toLowerCase(), r.results]));
const corePools = Object.fromEntries(e11.wrappers.map((w) => [w.token.toLowerCase(), w.pools]));

async function probeDepth(token) {
  const calls = [];
  for (const fee of [100, 500, 2500, 10000]) {
    calls.push(c.readContract({ address: V3F, abi: abis.f3, functionName: 'getPool', args: [token, USDT, fee] }).catch(() => ZERO));
  }
  calls.push(c.readContract({ address: V2F, abi: abis.f2, functionName: 'getPair', args: [token, USDT] }).catch(() => ZERO));
  const found = (await Promise.all(calls)).filter((p) => p !== ZERO);
  const depths = await Promise.all(found.map((p) => c.readContract({ address: USDT, abi: abis.erc, functionName: 'balanceOf', args: [p] }).catch(() => 0n)));
  return depths.reduce((a, b) => (b > a ? b : a), 0n);
}

async function unitReadable(issuer, token) {
  try {
    if (issuer === 'BSTOCKS') {
      const m = await c.readContract({ address: token, abi: abis.b, functionName: 'uiMultiplier' });
      await c.readContract({ address: token, abi: abis.b, functionName: 'pauseManager' });
      return m > 0n;
    }
    if (issuer === 'ONDO') {
      const [s] = await c.readContract({ address: ORACLE, abi: abis.o, functionName: 'getSValue', args: [token] });
      await c.readContract({ address: token, abi: abis.o, functionName: 'tokenPauseManager' });
      return s > 0n;
    }
    await c.readContract({ address: token, abi: abis.x, functionName: 'isPaused' });
    await c.readContract({ address: token, abi: abis.x, functionName: 'getCurrentMultiplier' });
    return true;
  } catch {
    return false;
  }
}

const out = { generatedAt: new Date().toISOString(), chainId: 56, usdt: USDT, ondoOracle: ORACLE, wrappers: [] };

for (const w of e2.wrappers) {
  const meta = Object.values(e1.tickers).flat().find((x) => x.token.toLowerCase() === w.token.toLowerCase());
  const direct = (corePools[w.token.toLowerCase()] ?? []).filter((p) => ['pancakeswap-v3-bsc', 'pancakeswap_v2'].includes(p.dex)).sort((a, b) => b.reserveUsd - a.reserveUsd)[0] ?? null;
  const r = recv[w.token.toLowerCase()];
  out.wrappers.push({
    ticker: w.ticker, tickerId: keccak256(toBytes(w.ticker)), issuer: w.issuer, symbol: w.symbol, token: w.token, decimals: 18, core: true,
    unit: { kind: KIND[w.issuer], source: w.unit.source, selector: w.unit.selector, decimals: 18 },
    pause: { source: w.pause.source, selector: w.pause.selector, perToken: w.issuer === 'ONDO' },
    deepestDirectPool: direct ? { dex: direct.dex, pool: direct.pool, reserveUsd: direct.reserveUsd } : null,
    contractReceive: typeof r === 'object' ? (Object.values(r).every((v) => v === 'OK') ? 'OK' : 'REFUSED') : 'UNKNOWN',
    provenance: meta?.provenance ?? [], coingeckoId: meta?.coingeckoId ?? null,
  });
}

let kept = 0;
const queue = list.filter((x) => !coreTokens.has(x.contractAddress.toLowerCase()));
await Promise.all(Array.from({ length: 6 }, async () => {
  for (let x = queue.shift(); x; x = queue.shift()) {
    const token = x.contractAddress;
    const issuer = TYPE_ISSUER[x.type];
    const depth = await probeDepth(token);
    if (depth < MIN_DEPTH_USDT) continue;
    if (!(await unitReadable(issuer, token))) continue;
    kept++;
    out.wrappers.push({
      ticker: x.ticker.toUpperCase(), tickerId: keccak256(toBytes(x.ticker.toUpperCase())), issuer, symbol: x.symbol, token, decimals: 18, core: false,
      unit: { kind: KIND[issuer], source: issuer === 'ONDO' ? ORACLE : token, selector: SELECTOR[issuer], decimals: 18 },
      pause: { source: token, selector: PAUSE_SELECTOR[issuer], perToken: true },
      deepestDirectPool: { dex: 'pancakeswap', pool: ZERO, reserveUsd: Number(depth / 10n ** 14n) / 1e4 },
      contractReceive: 'UNKNOWN',
      provenance: [`https://bscscan.com/token/${token}`, 'https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai'],
      coingeckoId: null,
    });
  }
}));

const coreOrder = new Map(e2.wrappers.map((w, i) => [w.token.toLowerCase(), i]));
out.wrappers.sort((a, b) => {
  const ia = coreOrder.get(a.token.toLowerCase());
  const ib = coreOrder.get(b.token.toLowerCase());
  if (ia !== undefined && ib !== undefined) return ia - ib;
  if (ia !== undefined) return -1;
  if (ib !== undefined) return 1;
  return a.ticker.localeCompare(b.ticker) || a.issuer.localeCompare(b.issuer) || a.symbol.localeCompare(b.symbol);
});

writeFileSync('packages/registry/src/wrappers.generated.json', JSON.stringify(out, null, 2));
writeFileSync('contracts/script/wrappers.flat.json', JSON.stringify({
  ondoOracle: out.ondoOracle,
  tokens: out.wrappers.map((w) => w.token),
  tickerIds: out.wrappers.map((w) => w.tickerId),
  issuers: out.wrappers.map((w) => w.issuer),
  contractReceive: out.wrappers.map((w) => w.contractReceive),
}, null, 2));
console.log('core', out.wrappers.filter((w) => w.core).length, 'extended', kept, 'tickers', new Set(out.wrappers.map((w) => w.ticker)).size);
