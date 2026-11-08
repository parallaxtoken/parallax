import { createPublicClient, http, parseAbi, parseAbiItem, decodeEventLog, type PublicClient } from 'viem';
import { bsc } from 'viem/chains';
import type { FillEvidence } from './checks';
import { readUnit, wrapperByToken } from '@parallax/registry';

const bookAbi = parseAbi([
  'function orders(uint256) view returns (address owner, uint8 side, uint8 status, uint32 wrapperMask, uint64 deadline, bytes32 tickerId, uint128 amount, uint128 limit)',
  'function registry() view returns (address)',
  'function USDT() view returns (address)',
]);
const regAbi = parseAbi(['function isRouter(address) view returns (bool)', 'function known(address) view returns (bool)']);
const filled = parseAbiItem('event OrderFilled(uint256 indexed id, address indexed wrapper, uint256 tokenAmount, uint256 unitWad, uint256 shares, uint256 usdt, address router, address filler)');
const transfer = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)']);

export function client(rpc: string): PublicClient {
  return createPublicClient({ chain: bsc, transport: http(rpc) }) as PublicClient;
}

/** Collects the evidence for one fill by reading logs and eth_call at the fill block only. */
export async function gatherFill(c: PublicClient, book: `0x${string}`, orderId: bigint, fromBlock?: bigint, stateClient?: PublicClient): Promise<FillEvidence> {
  const sc = stateClient ?? c; // historical state reads (archive) may use a different endpoint than log reads
  const latest = await c.getBlockNumber();
  // Public log endpoints cap the range, so scan backwards in windows until the fill is found or the floor is reached.
  const WINDOW = 4999n;
  const floor = fromBlock ?? (latest > 200_000n ? latest - 200_000n : 0n);
  let logs: Awaited<ReturnType<typeof c.getLogs<typeof filled>>> = [];
  for (let hi = latest; hi > floor && logs.length === 0; hi -= WINDOW) {
    const lo = hi - WINDOW + 1n > floor ? hi - WINDOW + 1n : floor;
    logs = await c.getLogs({ address: book, event: filled, args: { id: orderId }, fromBlock: lo, toBlock: hi });
  }
  const first = logs[0];
  if (!first || first.args.wrapper === undefined) throw new Error(`no OrderFilled log for order ${orderId} in the scanned window`);
  const bn = first.blockNumber;
  const o = await c.readContract({ address: book, abi: bookAbi, functionName: 'orders', args: [orderId] });
  const registry = await c.readContract({ address: book, abi: bookAbi, functionName: 'registry' });
  const usdt = await c.readContract({ address: book, abi: bookAbi, functionName: 'USDT' });
  const wrapper = first.args.wrapper;
  const router = first.args.router!;
  const isRouter = await c.readContract({ address: registry, abi: regAbi, functionName: 'isRouter', args: [router] });
  const known = await c.readContract({ address: registry, abi: regAbi, functionName: 'known', args: [wrapper] });

  let unitAtBlock: bigint | null = null;
  const rec = wrapperByToken(wrapper);
  if (rec) {
    try {
      unitAtBlock = (await readUnit(sc, rec, bn)).unit;
    } catch {
      unitAtBlock = null; // pruned state on a non-archive node
    }
  }
  const receipt = await c.getTransactionReceipt({ hash: first.transactionHash });
  const toOwner: { token: `0x${string}`; value: bigint }[] = [];
  const toFiller: { token: `0x${string}`; value: bigint }[] = [];
  const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  for (const l of receipt.logs) {
    // bStocks also emit TransferWithUIAmount (same indexed shape); only the ERC-20 Transfer topic counts
    if (l.topics[0] !== TRANSFER_TOPIC) continue;
    try {
      const d = decodeEventLog({ abi: [transfer], data: l.data, topics: l.topics });
      if (d.eventName !== 'Transfer') continue;
      if (d.args.to.toLowerCase() === o[0].toLowerCase()) toOwner.push({ token: l.address, value: d.args.value });
      if (d.args.to.toLowerCase() === first.args.filler?.toLowerCase()) toFiller.push({ token: l.address, value: d.args.value });
    } catch {
      /* not an ERC-20 transfer */
    }
  }
  const balOpts = { blockNumber: bn } as const;
  const bookUsdt = await sc.readContract({ address: usdt, abi: erc20, functionName: 'balanceOf', args: [book], ...balOpts }).catch(() => -1n);
  const bookTok = await sc.readContract({ address: wrapper, abi: erc20, functionName: 'balanceOf', args: [book], ...balOpts }).catch(() => -1n);
  return {
    orderId,
    side: o[1] === 0 ? 'BUY' : 'SELL',
    owner: o[0],
    limit: o[7],
    amount: o[6],
    wrapper,
    wrapperAllowedByRegistry: known,
    routerAllowedByRegistry: isRouter,
    event: { tokenAmount: first.args.tokenAmount!, unitWad: first.args.unitWad!, shares: first.args.shares!, usdt: first.args.usdt!, router, filler: first.args.filler! },
    unitAtBlock,
    transfersToOwner: toOwner,
    transfersToFiller: toFiller,
    bookBalancesAfter: { usdt: bookUsdt < 0n ? 0n : bookUsdt, token: bookTok < 0n ? 0n : bookTok },
    fillEventCount: logs.length,
  };
}
