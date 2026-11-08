// Prints the exact calldata for the Agentic Wallet cancel proof: approve, placeBuy with an unreachable floor, cancel.
// Nothing is sent here; `baw contract-call preview` then `execute` carry each call.
import './lib';
import { encodeFunctionData, parseAbi, createPublicClient, http } from 'viem';
import { bsc } from 'viem/chains';
import { tickerIdOf } from '@parallax/registry';

const BOOK = (process.env.NEXT_PUBLIC_PARALLAXBOOK ?? process.env.NEXT_PUBLIC_TAREBOOK) as `0x${string}`;
const USDT = '0x55d398326f99059fF775485246999027B3197955' as const;
const chain = createPublicClient({ chain: bsc, transport: http(process.env.BSC_RPC_URL) });
const next = await chain.readContract({ address: BOOK, abi: parseAbi(['function nextId() view returns (uint256)']), functionName: 'nextId' });
const amount = 50_000_000_000_000_000n; // $0.05
const deadline = BigInt(Math.floor(Date.now() / 1000) + 5 * 24 * 3600);
const out = {
  expectedOrderId: next.toString(),
  approve: { to: USDT, data: encodeFunctionData({ abi: parseAbi(['function approve(address,uint256) returns (bool)']), functionName: 'approve', args: [BOOK, amount] }) },
  placeBuy: {
    to: BOOK,
    data: encodeFunctionData({
      abi: parseAbi(['function placeBuy(bytes32,uint128,uint128,uint64,uint32) returns (uint256)']), functionName: 'placeBuy',
      args: [tickerIdOf('NVDA'), amount, 1_000_000_000_000_000_000n, deadline, 7], // floor 1 share: unreachable for $0.05
    }),
  },
  cancel: { to: BOOK, data: encodeFunctionData({ abi: parseAbi(['function cancel(uint256)']), functionName: 'cancel', args: [next] }) },
};
console.log(JSON.stringify(out, null, 1));
