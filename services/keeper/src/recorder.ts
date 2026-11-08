import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PublicClient } from 'viem';
import type { PublicRwaClient } from '@parallax/binance';
import { WRAPPERS, USDT, readUnit } from '@parallax/registry';
import { directRoutes } from '@parallax/registry';
import { wadFromDecimal } from '@parallax/kernel';

export interface RecorderOptions {
  chain: PublicClient;
  rwa: PublicRwaClient;
  journalPath: string;
  supabaseUrl?: string;
  supabaseKey?: string;
  quoteUsd?: number;
}

/** Snapshots every wrapper each cycle: API price and reference, on-chain unit, and a direct-pool quote. */
export class Recorder {
  private cycles = 0;
  private last: string | null = null;
  private errors = 0;

  constructor(private readonly o: RecorderOptions) {
    mkdirSync(dirname(o.journalPath), { recursive: true });
  }

  snapshot() {
    return { cycles: this.cycles, lastCycleAt: this.last, errors: this.errors };
  }

  async cycle(): Promise<void> {
    const t = new Date().toISOString();
    const usd = this.o.quoteUsd ?? 50;
    const market = await this.o.rwa.marketStatus();
    const block = await this.o.chain.getBlockNumber();
    const rows: Record<string, unknown>[] = [];
    const queue = [...WRAPPERS];
    await Promise.all(
      Array.from({ length: 5 }, async () => {
        for (let w = queue.shift(); w; w = queue.shift()) {
          const [d, u, r] = await Promise.allSettled([
            this.o.rwa.dynamic(w.token),
            readUnit(this.o.chain, w, block),
            directRoutes(this.o.chain, { tokenIn: USDT, tokenOut: w.token, amountIn: wadFromDecimal(String(usd)), recipient: w.token, deadline: BigInt(Math.floor(Date.now() / 1000) + 300) }),
          ]);
          const dyn = d.status === 'fulfilled' && d.value.ok ? d.value.data : null;
          const best = r.status === 'fulfilled' ? r.value[0] : undefined;
          if (d.status === 'rejected' || u.status === 'rejected') this.errors++;
          rows.push({
            t, block: block.toString(), ticker: w.ticker, issuer: w.issuer, token: w.token,
            session: market.ok ? market.data.marketStatus : null,
            api_price: dyn?.tokenPrice ?? null, api_multiplier: dyn?.sharesMultiplier ?? null, stock_price: dyn?.stockPrice ?? null,
            unit: u.status === 'fulfilled' ? u.value.unit.toString() : null,
            quote_usd: usd, tokens_out: best?.amountOut.toString() ?? null, venue: best?.venue ?? null,
          });
        }
      }),
    );
    appendFileSync(this.o.journalPath, `${JSON.stringify({ t, block: block.toString(), market: market.ok ? market.data : null, rows })}\n`);
    if (this.o.supabaseUrl && this.o.supabaseKey) {
      const res = await fetch(`${this.o.supabaseUrl}/rest/v1/quotes`, {
        method: 'POST',
        headers: { apikey: this.o.supabaseKey, authorization: `Bearer ${this.o.supabaseKey}`, 'content-type': 'application/json', prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(rows),
      });
      if (!res.ok) this.errors++;
    }
    this.cycles++;
    this.last = t;
  }
}
