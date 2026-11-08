// E1: build the BSC wrapper map for target tickers from CoinGecko platform data, then verify every
// address on-chain (symbol/name/decimals/supply/bytecode). Binance RWA list is added by e1_rwa_list.mjs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createPublicClient, http, parseAbi } from 'viem';
import { bsc } from 'viem/chains';
const client = createPublicClient({ chain: bsc, transport: http(process.env.BSC_RPC_URL || 'https://bsc-dataseed1.defibit.io') });
const erc20 = parseAbi(['function name() view returns (string)','function symbol() view returns (string)','function decimals() view returns (uint8)','function totalSupply() view returns (uint256)']);
const list = JSON.parse(readFileSync('data/discovery/raw/cg_list.json', 'utf8'));
// ticker -> display; matching is by symbol (T+b|on|x) AND an issuer keyword in the CoinGecko name
const TICKERS = { NVDA: /nvidia/i, TSLA: /tesla/i, AAPL: /apple/i, SPY: /(spdr s&p 500|s&p 500 etf|\bspy\b)/i, QQQ: /(invesco qqq|qqq)/i, MSFT: /microsoft/i, AMZN: /amazon/i, GOOGL: /(alphabet|google)/i, META: /meta platforms|meta\b/i, COIN: /coinbase/i };
const issuerOf = (n) => /bstocks?/i.test(n) ? 'BSTOCKS' : /ondo/i.test(n) ? 'ONDO' : /xstock/i.test(n) ? 'XSTOCKS' : null;
const map = {};
for (const c of list) {
  const addr = c.platforms?.['binance-smart-chain']; if (!addr) continue;
  const issuer = issuerOf(c.name); if (!issuer) continue;
  for (const [t, re] of Object.entries(TICKERS)) if (new RegExp('^'+t+'(b|on|x)$','i').test(c.symbol)) (map[t] ??= []).push({ issuer, coingeckoId: c.id, cgName: c.name, cgSymbol: c.symbol, token: addr });
}
const result = { generatedAt: new Date().toISOString(), source: 'CoinGecko /coins/list?include_platform=true (platform binance-smart-chain), verified on BSC via eth_call', tickers: {} };
for (const [t, rows] of Object.entries(map)) {
  result.tickers[t] = [];
  for (const r of rows) {
    const o = { ...r };
    try {
      o.codeBytes = ((await client.getCode({ address: r.token }))?.length ?? 2) / 2 - 1;
      for (const f of ['name', 'symbol', 'decimals', 'totalSupply']) { const v = await client.readContract({ address: r.token, abi: erc20, functionName: f }); o['chain_' + f] = typeof v === 'bigint' ? v.toString() : v; }
      o.provenance = [`https://bscscan.com/token/${r.token}`, `https://www.coingecko.com/en/coins/${r.coingeckoId}`];
    } catch (e) { o.error = e.shortMessage || e.message; }
    result.tickers[t].push(o);
  }
}
mkdirSync('data/discovery', { recursive: true });
writeFileSync('data/discovery/e1_wrapper_map.json', JSON.stringify(result, null, 2));
for (const [t, rows] of Object.entries(result.tickers)) { console.log(t); for (const r of rows) console.log('  ', r.issuer.padEnd(8), r.chain_symbol?.padEnd(9), r.token, r.chain_decimals, r.error ?? ''); }
