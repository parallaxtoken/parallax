// E2: read the per-issuer unit source for every wrapper in the E1 map, at one block, and normalise to
// "shares per token unit" (WAD). Writes data/discovery/e2_unit_factors.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { createPublicClient, http, parseAbi, toFunctionSelector } from 'viem';
import { bsc } from 'viem/chains';
const c = createPublicClient({ chain: bsc, transport: http(process.env.BSC_RPC_URL || 'https://bsc-dataseed1.defibit.io') });
const ORACLE = '0xF4Fd8a1B412633e10527454137A29Db7Aa35F15e';
const map = JSON.parse(readFileSync('data/discovery/e1_wrapper_map.json', 'utf8'));
const block = await c.getBlockNumber();
const bs = parseAbi(['function uiMultiplier() view returns (uint256)','function newUIMultiplier() view returns (uint256)','function effectiveAt() view returns (uint256)','function pauseManager() view returns (address)','function compliance() view returns (address)']);
const on = parseAbi(['function tokenPauseManager() view returns (address)','function compliance() view returns (address)']);
const orc = parseAbi(['function getSValue(address asset) view returns (uint128 sValue, bool paused)','function assetData(address) view returns (uint128 sValue, uint128 pendingSValue, uint256 lastUpdate, uint256 pauseStartTime, uint16 allowedDriftBps, uint48 driftCooldown)']);
const pm = parseAbi(['function isTokenPaused(address) view returns (bool)']);
const xs = parseAbi(['function getCurrentMultiplier() view returns (uint256 currentMultiplier, uint256 periodsPassed, uint256 currentMultiplierNonce)','function isPaused() view returns (bool)','function feePerPeriod() view returns (uint256)','function periodLength() view returns (uint256)','function sanctionsList() view returns (address)']);
const rd = (address, abi, functionName, args = []) => c.readContract({ address, abi, functionName, args, blockNumber: block });
const out = { block: block.toString(), oracle: ORACLE, wrappers: [] };
for (const [ticker, rows] of Object.entries(map.tickers)) for (const w of rows) {
  const r = { ticker, issuer: w.issuer, symbol: w.chain_symbol, token: w.token };
  try {
    if (w.issuer === 'BSTOCKS') {
      const m = await rd(w.token, bs, 'uiMultiplier'); const pmA = await rd(w.token, bs, 'pauseManager');
      r.unit = { kind: 'TOKEN_UI_MULTIPLIER', source: w.token, selector: toFunctionSelector('uiMultiplier()'), value: m.toString(), decimals: 18 };
      r.pending = { newUIMultiplier: (await rd(w.token, bs, 'newUIMultiplier')).toString(), effectiveAt: (await rd(w.token, bs, 'effectiveAt')).toString() };
      r.pause = { source: pmA, selector: toFunctionSelector('isTokenPaused(address)'), paused: await rd(pmA, pm, 'isTokenPaused', [w.token]) };
      r.sharesPerToken = m.toString();
    } else if (w.issuer === 'ONDO') {
      const [s, paused] = await rd(ORACLE, orc, 'getSValue', [w.token]); const pmA = await rd(w.token, on, 'tokenPauseManager');
      r.unit = { kind: 'ORACLE_SVALUE', source: ORACLE, selector: toFunctionSelector('getSValue(address)'), value: s.toString(), decimals: 18 };
      r.pause = { source: ORACLE, selector: toFunctionSelector('getSValue(address)'), paused, tokenPauseManager: pmA, tokenPaused: await rd(pmA, pm, 'isTokenPaused', [w.token]) };
      const ad = await rd(ORACLE, orc, 'assetData', [w.token]);
      r.oracleAsset = { pendingSValue: ad[1].toString(), lastUpdate: ad[2].toString(), pauseStartTime: ad[3].toString(), allowedDriftBps: ad[4], driftCooldown: Number(ad[5]) };
      r.sharesPerToken = s.toString();
    } else {
      const [m, periods, nonce] = await rd(w.token, xs, 'getCurrentMultiplier');
      r.unit = { kind: 'TOKEN_REBASE_BALANCE', source: w.token, selector: toFunctionSelector('getCurrentMultiplier()'), value: m.toString(), decimals: 18, note: 'balanceOf is already in share units; multiplier is informational for T3/T4 history' };
      r.pause = { source: w.token, selector: toFunctionSelector('isPaused()'), paused: await rd(w.token, xs, 'isPaused') };
      r.fee = { feePerPeriod: (await rd(w.token, xs, 'feePerPeriod')).toString(), periodLength: (await rd(w.token, xs, 'periodLength')).toString(), periodsPassed: periods.toString(), nonce: nonce.toString() };
      r.sharesPerToken = (10n ** 18n).toString();
    }
  } catch (e) { r.error = e.shortMessage || e.message; }
  out.wrappers.push(r);
}
writeFileSync('data/discovery/e2_unit_factors.json', JSON.stringify(out, null, 2));
for (const r of out.wrappers) console.log(r.ticker.padEnd(6), r.issuer.padEnd(8), (r.symbol ?? '').padEnd(8), r.sharesPerToken ? (Number(BigInt(r.sharesPerToken)) / 1e18).toFixed(9) : '-', r.pause ? 'paused=' + r.pause.paused : '', r.error ?? '');
