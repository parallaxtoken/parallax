// Prints one ParallaxBook order: owner and status (0 open, 1 filled, 2 cancelled).
import './lib';
import { createPublicClient, http, parseAbi } from 'viem';
import { bsc } from 'viem/chains';

const id = BigInt(process.argv[2] ?? '0');
const c = createPublicClient({ chain: bsc, transport: http(process.env.BSC_RPC_URL) });
const abi = parseAbi([
  'function nextId() view returns (uint256)',
  'function orders(uint256) view returns (address owner,uint8 side,uint8 status,uint32 wrapperMask,uint64 deadline,bytes32 tickerId,uint128 amount,uint128 limit)',
]);
const book = (process.env.NEXT_PUBLIC_PARALLAXBOOK ?? process.env.NEXT_PUBLIC_TAREBOOK) as `0x${string}`;
const [next, o] = await Promise.all([c.readContract({ address: book, abi, functionName: 'nextId' }), c.readContract({ address: book, abi, functionName: 'orders', args: [id] })]);
console.log(JSON.stringify({ nextId: next.toString(), id: id.toString(), owner: o[0], side: o[1], status: o[2], amount: o[6].toString(), limit: o[7].toString() }));
