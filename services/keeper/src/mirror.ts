import type { JournalEntry } from './journal';

/**
 * Best-effort mirror of keeper decisions into Supabase `keeper_actions`. The local journal stays the source of truth
 * (intent before effect); this only makes the same rows queryable. Failures are counted, never thrown.
 * `detail` is an optional jsonb column: when the table predates it, rows are retried without it.
 */
export class SupabaseMirror {
  sent = 0;
  failed = 0;
  private detailColumn = true;
  private readonly lastWait = new Map<string, string>();

  constructor(private readonly url: string, private readonly key: string) {}

  /** Repeated identical waits are not mirrored, so the table stays a readable history. */
  push(e: JournalEntry): void {
    if (e.status === 'WAIT' || e.status === 'SKIP' || e.status === 'REFUSED') {
      const k = `${e.status}:${e.reasons.join(',')}`;
      if (this.lastWait.get(e.orderId) === k) return;
      this.lastWait.set(e.orderId, k);
    }
    void this.insert(e).catch(() => { this.failed++; });
  }

  private row(e: JournalEntry, withDetail: boolean): Record<string, unknown> {
    const r: Record<string, unknown> = {
      t: e.t, order_id: e.orderId, status: e.status, decision: e.decision, reasons: e.reasons,
      wrapper: e.wrapper ?? null, router: e.router ?? null, venue: e.venue ?? null, calldata_hash: e.calldataHash ?? null,
      sim_source: e.simSource ?? null, sim_result: e.simResult ?? null, sim_error: e.simError ?? null, tx_hash: e.txHash ?? null,
      gas_used: e.gasUsed ?? null, shares_wad: e.sharesWad ?? null, latencies_ms: e.latenciesMs ?? null,
    };
    if (withDetail) {
      r.detail = {
        gasSuggested: e.gasSuggested ?? null, gasSimulated: e.gasSimulated ?? null, gasLimitUsed: e.gasLimitUsed ?? null, broadcastVia: e.broadcastVia ?? null,
        referenceSource: e.referenceSource ?? null, referenceIssuerWad: e.referenceIssuerWad ?? null, referenceIndependentWad: e.referenceIndependentWad ?? null,
        referenceDisagreeBps: e.referenceDisagreeBps ?? null,
      };
    }
    return r;
  }

  private async insert(e: JournalEntry): Promise<void> {
    const post = (withDetail: boolean) => fetch(`${this.url}/rest/v1/keeper_actions`, {
      method: 'POST',
      headers: { apikey: this.key, authorization: `Bearer ${this.key}`, 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify(this.row(e, withDetail)),
      signal: AbortSignal.timeout(8000),
    });
    let res = await post(this.detailColumn);
    if (!res.ok && this.detailColumn && /detail/i.test(await res.text().catch(() => ''))) {
      this.detailColumn = false;
      res = await post(false);
    }
    if (res.ok) this.sent++;
    else this.failed++;
  }
}
