// Autonomy proof, step 1 (7.6): the owner wallet places two buys and one sell, then stays untouched.
// The wrapper mask is bStocks only so the sell approval is known up front. Amounts are small by design.
import { writeFileSync, mkdirSync } from 'node:fs';
import { sharesFor, tokens, wadFromDecimal } from '@parallax/kernel';
import { directRoutes, readUnit, tickerIdOf, wrappersFor, USDT as USDT_ADDR } from '@parallax/registry';
import { BOOK, acct, bookAbi, erc20, pub, send, wallet } from './lib';

const TICKER = 'NVDA';
const nvdab = wrappersFor(TICKER).find((w) => w.issuer === 'BSTOCKS')!;
const user = acct('USER');
const w = wallet(user);

async function quoteShares(usd: string): Promise<bigint> {
  const u = await readUnit(pub, nvdab);
  const r = (await directRoutes(pub, { tokenIn: USDT_ADDR, tokenOut: nvdab.token, amountIn: wadFromDecimal(usd), recipient: nvdab.token, deadline: BigInt(Math.floor(Date.now() / 1000) + 300) }))[0];
  if (!r) throw new Error('no route to quote');
  return sharesFor(tokens(r.amountOut), u.unit);
}

async function main() {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 24 * 3600);
  const mask = 1; // bStocks
  const pay = wadFromDecimal('0.20');
  const q = await quoteShares('0.20');
  const minShares = (q * 99n) / 100n; // 1% under the live quote

  const bal0 = await pub.getTransactionCount({ address: user.address });
  console.log('owner nonce before', bal0);

  // approvals: USDT for the buys, NVDAB for the sell
  await send(w, { address: USDT_ADDR, abi: erc20, functionName: 'approve', args: [BOOK, wadFromDecimal('0.40')] }, 'approve USDT');
  await send(w, { address: nvdab.token, abi: erc20, functionName: 'approve', args: [BOOK, 10n ** 18n] }, 'approve NVDAB');

  const ids: string[] = [];
  const tx: Record<string, string> = {};
  for (const name of ['buy-1', 'buy-2'] as const) {
    const h = await send(w, { address: BOOK, abi: bookAbi, functionName: 'placeBuy', args: [tickerIdOf(TICKER), pay, minShares, deadline, mask] }, `place ${name}`);
    tx[name] = h;
  }
  const sellShares = minShares / 2n;
  const sellHash = await send(w, { address: BOOK, abi: bookAbi, functionName: 'placeSell', args: [tickerIdOf(TICKER), sellShares, wadFromDecimal('1'), deadline, mask] }, 'place sell');
  tx['sell-1'] = sellHash;

  const next = await pub.readContract({ address: BOOK, abi: bookAbi, functionName: 'nextId' });
  const nonceAfter = await pub.getTransactionCount({ address: user.address });
  mkdirSync('data/autonomy', { recursive: true });
  const rec = { placedAt: new Date().toISOString(), ticker: TICKER, wrapper: nvdab.symbol, orders: tx, nextId: next.toString(), ownerNonceAfterPlacing: nonceAfter, minSharesWad: minShares.toString() };
  writeFileSync('data/autonomy/placement.json', JSON.stringify(rec, null, 2));
  console.log(JSON.stringify(rec, null, 2));
  ids.push(next.toString());
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
