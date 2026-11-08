// Mainnet dual outcome, part two: one deliberate refusal (the keeper declines, then a manual fill reverts
// with ShareFloor on-chain) and one cancel. Amounts are cents.
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { encodeFunctionData } from 'viem';
import { sharesFor, tokens, wadFromDecimal } from '@parallax/kernel';
import { PANCAKE, USDT as USDT_ADDR, directRoutes, readUnit, tickerIdOf, wrappersFor } from '@parallax/registry';
import { BOOK, acct, bookAbi, erc20, pub, send, wallet } from './lib';

const TICKER = 'NVDA';
const nvdab = wrappersFor(TICKER).find((w) => w.issuer === 'BSTOCKS')!;
const user = wallet(acct('USER'));
const other = wallet(acct('DEPLOYER'));

async function main() {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 24 * 3600);
  const pay = wadFromDecimal('0.05');
  const u = await readUnit(pub, nvdab);
  const route = (await directRoutes(pub, { tokenIn: USDT_ADDR, tokenOut: nvdab.token, amountIn: pay, recipient: BOOK, deadline }))[0];
  if (!route) throw new Error('no route');
  const quoted = sharesFor(tokens(route.amountOut), u.unit);
  const impossible = quoted * 2n; // no market can deliver double the shares for the same dollars

  await send(user, { address: USDT_ADDR, abi: erc20, functionName: 'approve', args: [BOOK, pay * 2n] }, 'approve USDT');
  const refusalPlaceTx = await send(user, { address: BOOK, abi: bookAbi, functionName: 'placeBuy', args: [tickerIdOf(TICKER), pay, impossible, deadline, 1] }, 'place impossible-floor buy');
  const id = (await pub.readContract({ address: BOOK, abi: bookAbi, functionName: 'nextId' })) - 1n;

  // Manual fill attempt: explicit gas limit so the transaction is mined and reverts on-chain (not just estimated).
  const data = encodeFunctionData({ abi: bookAbi, functionName: 'fill', args: [id, 0n, route.router, route.data] });
  let revertTx = '';
  try {
    const h = await other.sendTransaction({ to: BOOK, data, gas: 700_000n });
    const rc = await pub.waitForTransactionReceipt({ hash: h });
    revertTx = h;
    console.log('manual fill', rc.status, h);
  } catch (e) {
    console.error('manual fill send failed', e instanceof Error ? e.message.split('\n')[0] : e);
  }

  // Cancel: place and cancel a fresh order.
  const placeTx = await send(user, { address: BOOK, abi: bookAbi, functionName: 'placeBuy', args: [tickerIdOf(TICKER), pay, 1n, deadline, 4] }, 'place order to cancel');
  const cancelId = (await pub.readContract({ address: BOOK, abi: bookAbi, functionName: 'nextId' })) - 1n;
  const cancelTx = await send(user, { address: BOOK, abi: bookAbi, functionName: 'cancel', args: [cancelId] }, 'cancel');

  const rec = { refusalOrderId: id.toString(), refusalPlaceTx, manualFillRevertTx: revertTx, impossibleFloorWad: impossible.toString(), quotedSharesWad: quoted.toString(), cancelOrderId: cancelId.toString(), cancelPlaceTx: placeTx, cancelTx };
  writeFileSync('evidence/mainnet/refusal_and_cancel.json', JSON.stringify(rec, null, 2));
  console.log(JSON.stringify(rec, null, 2));
  void PANCAKE; void existsSync; void readFileSync;
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
