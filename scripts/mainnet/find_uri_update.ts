// Finds the registry log (and so the transaction) that updated the agent URI of the keeper identity recently.
import './lib';
import { createPublicClient, http, pad, toHex } from 'viem';
import { bsc } from 'viem/chains';

const REG = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const;
const id = BigInt(process.env.KEEPER_AGENT_ID ?? '370049');
const c = createPublicClient({ chain: bsc, transport: http(process.env.BSC_LOGS_RPC_URL ?? process.env.BSC_RPC_URL) });
const head = await c.getBlockNumber();
const topicId = pad(toHex(id), { size: 32 });
const found: { tx: string; block: string; topic0: string }[] = [];
for (let from = head - 3000n; from <= head; from += 1000n) {
  const logs = await c.getLogs({ address: REG, fromBlock: from, toBlock: from + 999n > head ? head : from + 999n }).catch(() => []);
  for (const l of logs) if (l.topics[1]?.toLowerCase() === topicId.toLowerCase()) found.push({ tx: l.transactionHash, block: l.blockNumber.toString(), topic0: l.topics[0]! });
}
console.log(JSON.stringify(found, null, 1));
