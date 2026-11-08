// E4 recorder: every INTERVAL seconds snapshot every wrapper: API token price/status/reference, the on-chain
// unit factor, and an on-chain $50 buy quote. Appends JSONL to data/discovery/e4_session_basis.jsonl.
import { readFileSync, appendFileSync } from 'node:fs';
import { createPublicClient, http, parseAbi } from 'viem';
import { bsc } from 'viem/chains';
import { dynamicV2, marketStatus } from './lib_binance.mjs';
import { quoteBuy, A } from './lib_pancake.mjs';
const INTERVAL = Number(process.env.INTERVAL_SEC || 60), USD = Number(process.env.QUOTE_USD || 50);
const OUT = 'data/discovery/e4_session_basis.jsonl';
const c = createPublicClient({ chain: bsc, transport: http(process.env.BSC_RPC_URL || 'https://bsc-dataseed1.defibit.io') });
const ORACLE = '0xF4Fd8a1B412633e10527454137A29Db7Aa35F15e';
const e2 = JSON.parse(readFileSync('data/discovery/e2_unit_factors.json', 'utf8'));
const bs = parseAbi(['function uiMultiplier() view returns (uint256)']);
const orc = parseAbi(['function getSValue(address) view returns (uint128, bool)']);
const xs = parseAbi(['function getCurrentMultiplier() view returns (uint256,uint256,uint256)']);
async function unitOf(w) {
  if (w.issuer === 'BSTOCKS') return { unit: await c.readContract({ address: w.token, abi: bs, functionName: 'uiMultiplier' }), paused: null };
  if (w.issuer === 'ONDO') { const [v, p] = await c.readContract({ address: ORACLE, abi: orc, functionName: 'getSValue', args: [w.token] }); return { unit: v, paused: p }; }
  const r = await c.readContract({ address: w.token, abi: xs, functionName: 'getCurrentMultiplier' }); return { unit: 10n ** 18n, multiplier: r[0], paused: null };
}
const settle = async (f) => { try { return { ok: await f() }; } catch (e) { return { err: (e.shortMessage || e.message || String(e)).slice(0, 160) }; } };
async function cycle() {
  const t = new Date().toISOString();
  const ms = await settle(() => marketStatus());
  const block = (await settle(() => c.getBlockNumber())).ok;
  const rows = [];
  const queue = [...e2.wrappers];
  await Promise.all(Array.from({ length: 5 }, async () => {
    for (let w; (w = queue.shift()); ) {
      const [d, u, q] = await Promise.all([settle(() => dynamicV2(w.token)), settle(() => unitOf(w)), settle(() => quoteBuy(A.USDT, w.token, USD))]);
      const ti = d.ok?.data?.tokenInfo, si = d.ok?.data?.stockInfo, st = d.ok?.data?.statusInfo;
      const best = q.ok?.filter((x) => x.tokensOut).sort((a, b) => (a.tokensOut < b.tokensOut ? 1 : -1))[0];
      rows.push({ ticker: w.ticker, issuer: w.issuer, token: w.token,
        apiPrice: ti?.price ?? null, apiMult: ti?.sharesMultiplier ?? null, stockPrice: si?.price ?? null, status: st?.reasonCode ?? null, openState: st?.openState ?? null, apiErr: d.err ?? (d.ok && d.ok.code !== '000000' ? d.ok.code : null),
        unit: u.ok?.unit?.toString() ?? null, unitPaused: u.ok?.paused ?? null, xMult: u.ok?.multiplier?.toString() ?? null, unitErr: u.err ?? null,
        quoteUsd: USD, tokensOut: best?.tokensOut?.toString() ?? null, venue: best?.venue ?? null, pool: best?.pool ?? null, quoteErr: q.err ?? null });
    }
  }));
  const rec = { t, block: block?.toString() ?? null, market: ms.ok?.data ? { marketStatus: ms.ok.data.marketStatus, openState: ms.ok.data.openState, nextOpen: ms.ok.data.nextOpen, nextClose: ms.ok.data.nextClose, off: ms.ok.data.offhours ?? null } : { err: ms.err ?? 'no data' }, rows };
  appendFileSync(OUT, JSON.stringify(rec) + '\n');
  console.log(t, 'block', rec.block, 'market', rec.market.marketStatus ?? rec.market.err, 'rows', rows.length, 'errs', rows.filter((r) => r.apiErr || r.unitErr || r.quoteErr).length);
}
for (;;) { const s = Date.now(); await cycle().catch((e) => console.log('cycle error', e.message)); await new Promise((r) => setTimeout(r, Math.max(1000, INTERVAL * 1000 - (Date.now() - s)))); }
