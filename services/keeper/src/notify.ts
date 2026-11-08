import type { RefusalReason } from '@parallax/kernel';

export interface Notifier {
  fill(owner: string, orderId: string, txHash: string, sharesWad: string): Promise<void>;
  refusal(owner: string, orderId: string, reasons: RefusalReason[]): Promise<void>;
  expired(owner: string, orderId: string): Promise<void>;
}

export const NoopNotifier: Notifier = { fill: async () => {}, refusal: async () => {}, expired: async () => {} };

export const REASON_WORDS: Record<RefusalReason, string> = {
  PREMIUM_ABOVE_LIMIT: 'the price was above your limit',
  UNIT_PAUSED: 'the issuer paused the token for a corporate action',
  NO_CONTRACT_ROUTE: 'no wrapper had a route a contract can fill',
  BROKEN_QUOTE: 'a quote was far from the real price and was not treated as a deal',
  SIM_FAILED: 'the pre-flight simulation failed, so nothing was sent',
  API_DEGRADED: 'a data source was unreachable, so no order was evaluated',
  REFERENCE_DISAGREE: 'two independent price references disagreed, so nothing was filled',
};

const wad = (s: string): string => {
  const v = BigInt(s);
  return `${v / 10n ** 18n}.${(v % 10n ** 18n).toString().padStart(18, '0').slice(0, 4)}`;
};

/** Telegram notifications (6.10). It never trades from chat; /cancel replies with a link the wallet signs. */
export class TelegramNotifier implements Notifier {
  private readonly links = new Map<string, number>(); // owner address (lowercase) -> chat id
  private readonly sentRefusals = new Set<string>();
  private offset = 0;

  constructor(
    private readonly token: string,
    private readonly webOrigin: string,
    private readonly listOrders: (owner: string) => Promise<{ id: string; side: string; status: string }[]>,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async api(method: string, body: Record<string, unknown>): Promise<unknown> {
    const r = await this.fetchImpl(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    return r.json();
  }

  private async tell(owner: string, text: string): Promise<void> {
    const chat = this.links.get(owner.toLowerCase());
    if (chat === undefined) return;
    await this.api('sendMessage', { chat_id: chat, text, disable_web_page_preview: true });
  }

  async fill(owner: string, orderId: string, txHash: string, sharesWad: string): Promise<void> {
    await this.tell(owner, `Order ${orderId} filled. You received ${wad(sharesWad)} shares.\nhttps://bscscan.com/tx/${txHash}`);
  }

  async refusal(owner: string, orderId: string, reasons: RefusalReason[]): Promise<void> {
    const key = `${orderId}:${reasons.join(',')}`;
    if (this.sentRefusals.has(key)) return;
    this.sentRefusals.add(key);
    await this.tell(owner, `Order ${orderId} not filled: ${reasons.map((r) => REASON_WORDS[r]).join('; ')}. It is still being watched.`);
  }

  async expired(owner: string, orderId: string): Promise<void> {
    await this.tell(owner, `Order ${orderId} expired without a fill.`);
  }

  /** Long-poll one batch of commands. Commands: /link <address>, /orders, /cancel <id>. */
  async pollOnce(): Promise<void> {
    const res = (await this.api('getUpdates', { offset: this.offset, timeout: 0 })) as { result?: { update_id: number; message?: { chat: { id: number }; text?: string } }[] };
    for (const u of res.result ?? []) {
      this.offset = u.update_id + 1;
      const chat = u.message?.chat.id;
      const text = (u.message?.text ?? '').trim();
      if (chat === undefined || !text.startsWith('/')) continue;
      const [cmd, arg] = text.split(/\s+/);
      if (cmd === '/link' && arg && /^0x[0-9a-fA-F]{40}$/.test(arg)) {
        this.links.set(arg.toLowerCase(), chat);
        await this.api('sendMessage', { chat_id: chat, text: `Linked ${arg}. I will tell you about fills, refusals and expiries. I never trade from chat.` });
      } else if (cmd === '/orders') {
        const owner = [...this.links.entries()].find(([, c]) => c === chat)?.[0];
        if (!owner) { await this.api('sendMessage', { chat_id: chat, text: 'Link a wallet first: /link 0xYourAddress' }); continue; }
        const list = await this.listOrders(owner);
        await this.api('sendMessage', { chat_id: chat, text: list.length ? list.map((o) => `#${o.id} ${o.side} ${o.status}`).join('\n') : 'No orders.' });
      } else if (cmd === '/cancel' && arg && /^\d+$/.test(arg)) {
        await this.api('sendMessage', { chat_id: chat, text: `Open this link to cancel order ${arg} in your wallet (this bot cannot sign):\n${this.webOrigin}/app/orders?cancel=${arg}` });
      }
    }
  }
}
