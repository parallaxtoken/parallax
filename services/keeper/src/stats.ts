import { REFUSAL_REASONS, type RefusalReason } from '@parallax/kernel';

/** Counters published at /api/agent/keeper: passes, longest gap, fills, refusals by reason, last error. */
export class Stats {
  passes = 0;
  fills = 0;
  longestGapMs = 0;
  lastPassAt: number | null = null;
  lastError: { at: string; message: string } | null = null;
  startedAt = Date.now();
  /** Delivery channel health. A channel that cannot be reached is a status, not a keeper error. */
  telegram: { state: 'off' | 'ok' | 'unreachable'; detail: string | null; since: string | null } = { state: 'off', detail: null, since: null };
  readonly refusals: Record<RefusalReason, number> = Object.fromEntries(REFUSAL_REASONS.map((r) => [r, 0])) as Record<RefusalReason, number>;
  /** Second-opinion reference counters: how often the two sources agreed, disagreed, or one was missing. */
  reference = { checks: 0, agree: 0, disagree: 0, single: 0, unavailable: 0 };
  earnedUsdt = 0n;
  gasSpentWei = 0n;

  pass(now = Date.now()): void {
    if (this.lastPassAt !== null) this.longestGapMs = Math.max(this.longestGapMs, now - this.lastPassAt);
    this.lastPassAt = now;
    this.passes++;
  }
  fill(): void {
    this.fills++;
  }
  refusal(r: RefusalReason): void {
    this.refusals[r]++;
  }
  error(message: string): void {
    this.lastError = { at: new Date().toISOString(), message: message.slice(0, 300) };
  }
  referenceCheck(k: 'agree' | 'disagree' | 'single' | 'unavailable'): void {
    this.reference.checks++;
    this.reference[k]++;
  }
  channel(state: 'off' | 'ok' | 'unreachable', detail: string | null = null): void {
    if (this.telegram.state !== state) this.telegram = { state, detail, since: new Date().toISOString() };
    else this.telegram.detail = detail;
  }
  snapshot() {
    return {
      startedAt: new Date(this.startedAt).toISOString(),
      passes: this.passes,
      fills: this.fills,
      longestGapSec: Math.round(this.longestGapMs / 1000),
      lastPassAt: this.lastPassAt ? new Date(this.lastPassAt).toISOString() : null,
      refusalsByReason: this.refusals,
      lastError: this.lastError,
      notifications: { telegram: this.telegram },
      reference: this.reference,
      selfFunding: { earnedUsdtWei: this.earnedUsdt.toString(), gasSpentWei: this.gasSpentWei.toString() },
    };
  }
}
