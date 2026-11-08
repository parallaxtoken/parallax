#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { client, gatherFill } from './gather';
import { verifyFill, verifyQuote, type CheckResult, type QuoteSnapshot } from './checks';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function print(title: string, results: CheckResult[]): boolean {
  console.log(title);
  for (const r of results) console.log(`  ${r.status.padEnd(14)} ${r.id.padEnd(4)} ${r.name.padEnd(24)} ${r.detail}`);
  return results.every((r) => r.status === 'PASS' || r.status === 'NOT_APPLICABLE');
}

async function main(): Promise<number> {
  const quote = arg('quote');
  if (quote) {
    const snap = JSON.parse(readFileSync(quote, 'utf8')) as QuoteSnapshot | QuoteSnapshot[];
    const all = (Array.isArray(snap) ? snap : [snap]).flatMap((s) => verifyQuote(s));
    return print(`quote snapshot ${quote}`, all) ? 0 : 1;
  }
  const order = arg('order');
  const book = arg('book') ?? process.env.NEXT_PUBLIC_PARALLAXBOOK ?? process.env.NEXT_PUBLIC_TAREBOOK;
  const clean = (v?: string) => v?.split(/\s+#/)[0]?.trim() || undefined;
  const rpc = arg('rpc') ?? clean(process.env.BSC_LOGS_RPC_URL) ?? 'https://bsc.rpc.blxrbdn.com';
  if (!order || !book) {
    console.error('usage: parallax verify --order <id> --book <address> [--rpc <logs url>] [--state-rpc <archive url>] [--from-block <n>]\n       parallax verify --quote <snapshot.json>');
    return 2;
  }
  const fb = arg('from-block') ?? clean(process.env.NEXT_PUBLIC_PARALLAXBOOK_BLOCK ?? process.env.NEXT_PUBLIC_TAREBOOK_BLOCK);
  const stateRpc = arg('state-rpc') ?? clean(process.env.BSC_ARCHIVE_RPC_URL);
  const ev = await gatherFill(client(rpc), book as `0x${string}`, BigInt(order), fb ? BigInt(fb) : undefined, stateRpc ? client(stateRpc) : undefined);
  return print(`order ${order} on ${book}`, verifyFill(ev)) ? 0 : 1;
}

main().then((c) => process.exit(c), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
