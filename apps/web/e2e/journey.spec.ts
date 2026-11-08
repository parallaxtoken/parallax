// End-to-end journey on the deployed app with a real connected wallet (the owner test wallet) in headless Chromium.
// The page sees a standard injected EIP-1193 provider; signing is bridged to the owner key in this Node process, so
// the transactions are real mainnet transactions of cents. Run: BASE_URL=... npx playwright test journey.spec.ts
import { expect, test, type Page } from '@playwright/test';
import { createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function env(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const text = readFileSync(join(__dirname, '..', '..', '..', '.env.local'), 'utf8');
  const m = new RegExp(`^${name}=(.*)$`, 'm').exec(text);
  return (m?.[1] ?? '').split(/\s+#/)[0]!.trim();
}

const RPC = 'https://bsc-dataseed1.defibit.io';
const account = privateKeyToAccount(env('USER_PRIVATE_KEY') as Hex);
const wallet = createWalletClient({ account, chain: bsc, transport: http(RPC) });

async function installWallet(page: Page) {
  await page.exposeFunction('__parallaxRequest', async (req: { method: string; params?: unknown[] }) => {
    switch (req.method) {
      case 'eth_requestAccounts':
      case 'eth_accounts':
        return [account.address];
      case 'eth_chainId':
        return '0x38';
      case 'net_version':
        return '56';
      case 'wallet_switchEthereumChain':
      case 'wallet_addEthereumChain':
        return null;
      case 'eth_sendTransaction': {
        const t = (req.params?.[0] ?? {}) as { to: Hex; data?: Hex; value?: Hex; gas?: Hex };
        return wallet.sendTransaction({ to: t.to, data: t.data, value: t.value ? BigInt(t.value) : undefined, gas: t.gas ? BigInt(t.gas) : undefined });
      }
      default: {
        const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: req.method, params: req.params ?? [] }) });
        const j = (await r.json()) as { result?: unknown; error?: { message: string } };
        if (j.error) throw new Error(j.error.message);
        return j.result;
      }
    }
  });
  await page.addInitScript(() => {
    const listeners: Record<string, ((...a: unknown[]) => void)[]> = {};
    const provider = {
      isMetaMask: true,
      request: (a: { method: string; params?: unknown[] }) => (window as unknown as { __parallaxRequest: (x: unknown) => Promise<unknown> }).__parallaxRequest(a),
      on: (e: string, f: (...a: unknown[]) => void) => { (listeners[e] ??= []).push(f); },
      removeListener: (e: string, f: (...a: unknown[]) => void) => { listeners[e] = (listeners[e] ?? []).filter((x) => x !== f); },
    };
    Object.defineProperty(window, 'ethereum', { value: provider, configurable: true });
    const info = { uuid: 'parallax-test-wallet', name: 'MetaMask', icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=', rdns: 'io.metamask' };
    const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider }) }));
    window.addEventListener('eip6963:requestProvider', announce);
    announce();
  });
}

async function connect(page: Page) {
  await page.getByRole('button', { name: /connect wallet/i }).first().click();
  const option = page.locator('[data-testid="rk-wallet-option-io.metamask"]');
  await option.waitFor({ state: 'attached', timeout: 20_000 });
  await page.waitForTimeout(500); // the option list re-renders once while providers are announced
  await option.dispatchEvent('click');
  await expect(page.getByRole('button', { name: /disconnect wallet/i })).toBeVisible({ timeout: 30_000 });
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);

test('verify page and agent endpoints work end to end without a wallet', async ({ page }) => {
  await page.goto('/verify');
  await page.getByLabel('Order id').fill('0');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText('Share floor').first()).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('li', { hasText: 'PASS' }).first()).toBeVisible();

  const keeper = await page.request.get('/api/agent/keeper');
  expect((await keeper.json()).available).toBe(true);
  const mcp = await page.request.post('/api/mcp', { data: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
  expect((await mcp.json()).result.tools.length).toBeGreaterThan(3);
  const card = await page.request.get('/.well-known/agent-card.json');
  expect(card.status()).toBe(200);
  expect((await card.json()).name).toBe('Parallax');
});

test('navbar keeps the active page highlighted', async ({ page }) => {
  for (const [label, href] of [['Shelf', '/app'], ['Orders', '/app/orders'], ['Agent', '/app/agent'], ['Proof', '/proof'], ['Verify', '/verify']] as const) {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await nav.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(nav.locator('a[aria-current="page"]')).toHaveText(label);
  }
});

test('connected wallet: buy now, standing buy filled by the keeper, standing sell refused then cancelled, holdings', async ({ page }) => {
  await installWallet(page);
  await page.goto('/app/t/NVDA');
  await connect(page);

  // 1. Buy now: plan, simulate, sign approve and swap
  await page.getByLabel('Spend (USDT)').fill('0.10');
  await page.getByRole('button', { name: 'Plan it' }).click();
  await expect(page.getByText(/gives you the most shares/i)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Floor you sign/i)).toBeVisible();
  await page.getByRole('button', { name: /Simulate, then sign/i }).click();
  await expect(page.getByText('confirmed')).toHaveCount(2, { timeout: 150_000 });

  // 2. Standing buy: signed once; the keeper fills it unattended
  await page.getByRole('tab', { name: 'Standing buy' }).click();
  await page.getByLabel('Spend (USDT)').fill('0.05');
  await page.getByRole('button', { name: 'Plan it' }).click();
  await expect(page.getByText(/gives you the most shares/i)).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /Simulate, then sign/i }).click();
  await expect(page.getByText('confirmed')).toHaveCount(2, { timeout: 150_000 });

  // 3. Orders page: the order appears and the keeper fills it
  await page.goto('/app/orders');
  await expect(page.getByText(/Buy NVDA/).first()).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => page.getByText('filled', { exact: true }).count(), { timeout: 180_000, intervals: [5_000] }).toBeGreaterThan(0);

  // 4. Standing sell with an unreachable floor stays open, then is cancelled from the UI
  await page.goto('/app/t/NVDA');
  await page.getByRole('tab', { name: 'Standing sell' }).click();
  await page.getByLabel('Shares to sell').fill('0.0001');
  await page.getByLabel(/Lowest price per share/).fill('99999');
  await page.getByRole('button', { name: 'Plan it' }).click();
  await expect(page.getByText(/Place standing sell/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /Simulate, then sign/i }).click();
  await expect(page.getByText('confirmed')).toHaveCount(2, { timeout: 150_000 });
  await page.goto('/app/orders');
  const open = page.locator('li', { hasText: 'Sell NVDA' }).filter({ hasText: 'watching' }).first();
  await expect(open).toBeVisible({ timeout: 60_000 });
  await open.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText(/cancelled\./)).toBeVisible({ timeout: 150_000 });

  // 5. Holdings in shares
  await page.goto('/app/holdings');
  await expect(page.getByText(/You own/)).toBeVisible({ timeout: 90_000 });
});
