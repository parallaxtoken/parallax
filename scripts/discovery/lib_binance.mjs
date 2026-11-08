// Public (keyless) Binance Web3 RWA endpoints used for discovery. Every call is timed and logged.
const ROOT = 'https://www.binance.com/bapi/defi';
const H = { 'Accept-Encoding': 'identity', 'User-Agent': 'binance-web3/1.1 (Skill)' };
export async function bapi(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const t0 = Date.now();
  const r = await fetch(`${ROOT}${path}${qs ? '?' + qs : ''}`, { headers: H });
  const text = await r.text(); let j; try { j = JSON.parse(text); } catch { j = { code: 'NON_JSON', raw: text.slice(0, 200) }; }
  return { http: r.status, ms: Date.now() - t0, code: j.code, success: j.success, data: j.data, message: j.message };
}
export const dynamicV2 = (token) => bapi('/v2/public/wallet-direct/buw/wallet/market/token/rwa/dynamic/ai', { chainId: '56', contractAddress: token });
export const assetStatus = (token) => bapi('/v1/public/wallet-direct/buw/wallet/market/token/rwa/asset/market/status/ai', { chainId: '56', contractAddress: token });
export const marketStatus = () => bapi('/v1/public/wallet-direct/buw/wallet/market/token/rwa/market/status/ai');
export const meta = (token) => bapi('/v1/public/wallet-direct/buw/wallet/market/token/rwa/meta/ai', { chainId: '56', contractAddress: token });
export const kline = (token, interval, limit = 300, extra = {}) => bapi('/v1/public/wallet-direct/buw/wallet/dex/market/token/kline/ai', { chainId: '56', contractAddress: token, interval, limit, ...extra });
