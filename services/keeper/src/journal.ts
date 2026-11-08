import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Keeper journal (6.9): intent is persisted before effect; an uncertain transaction is never resent. */
export type JournalStatus = 'INTENT' | 'SENT' | 'CONFIRMED' | 'REVERTED' | 'REFUSED' | 'WAIT' | 'SKIP';

export interface JournalEntry {
  t: string;
  orderId: string;
  status: JournalStatus;
  decision: string;
  reasons: string[];
  wrapper?: string;
  router?: string;
  venue?: string;
  calldataHash?: string;
  simSource?: 'TRANSACTION_API' | 'ETH_CALL';
  simResult?: 'PASS' | 'FAIL' | 'NOT_RUN';
  simError?: string;
  txHash?: string;
  gasUsed?: string;
  sharesWad?: string;
  latenciesMs?: Record<string, number>;
  /** Which source gave the independent reference, the two prices (WAD) and their gap, for every decision. */
  referenceSource?: string;
  referenceIndependentWad?: string;
  referenceIssuerWad?: string;
  referenceDisagreeBps?: number;
  /** Gas for the fill: what the Transaction API suggested, what the node simulated, and the limit sent (max x 1.25). */
  gasSuggested?: string;
  gasSimulated?: string;
  gasLimitUsed?: string;
  /** Which path carried the signed transaction. */
  broadcastVia?: 'TRANSACTION_API' | 'RPC';
}

export class Journal {
  private entries: JournalEntry[] = [];

  constructor(private readonly path: string, private readonly onAppend?: (e: JournalEntry) => void) {
    if (existsSync(path)) {
      this.entries = readFileSync(path, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as JournalEntry);
    } else {
      mkdirSync(dirname(path), { recursive: true });
    }
  }

  append(e: JournalEntry): void {
    this.entries.push(e);
    appendFileSync(this.path, `${JSON.stringify(e)}\n`);
    try { this.onAppend?.(e); } catch { /* a mirror failure never affects the journal */ }
  }

  all(): readonly JournalEntry[] {
    return this.entries;
  }

  /** Transactions that were broadcast but have no terminal entry yet: observe these, never resend. */
  unresolved(): JournalEntry[] {
    const last = new Map<string, JournalEntry>();
    for (const e of this.entries) if (e.txHash || e.status === 'INTENT') last.set(`${e.orderId}:${e.txHash ?? 'intent'}`, e);
    const sent = this.entries.filter((e) => e.status === 'SENT' && e.txHash);
    return sent.filter((s) => !this.entries.some((e) => e.txHash === s.txHash && (e.status === 'CONFIRMED' || e.status === 'REVERTED')));
  }

  /** Orders with an INTENT that never reached SENT (crash between the two): not retried blindly. */
  danglingIntents(): JournalEntry[] {
    return this.entries.filter(
      (i) => i.status === 'INTENT' && !this.entries.some((e) => e.orderId === i.orderId && e.t > i.t && (e.status === 'SENT' || e.status === 'CONFIRMED' || e.status === 'REVERTED' || e.status === 'REFUSED')),
    );
  }

  hasInFlight(orderId: string): boolean {
    return this.unresolved().some((e) => e.orderId === orderId) || this.danglingIntents().some((e) => e.orderId === orderId);
  }
}
