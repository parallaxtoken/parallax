# PROGRESS

Organization: Parallax Protocol. Lead Maintainer: warlock-netizen.

## Session 2, 2026-10-10

### Done
- Phase 2 mechanism: kernel (property tests), registry (75 wrappers, 51 tickers from evidence plus catalogue), typed
  Binance client with degraded states, `WrapperRegistry` and `ParallaxBook` (buy and sell), fork break suite and
  invariant suite, offline verifier CLI.
- Contracts deployed and verified on BSC mainnet (`EVIDENCE.md`).
- Phase 3 agent: keeper with intent-before-effect journal, typed refusals, recorder, Telegram notifier, status
  endpoint; ERC-8004 identity; ERC-8183 certificate job at price zero; x402 certificate endpoint.
- Mainnet autonomy run: two buys and one sell filled by the keeper while the owner wallet was untouched and New
  York was closed; a deliberate refusal reverted on-chain with `ShareFloor`; one cancel. Verifier PASS on each fill.
- Phase 4 product: landing, shelf, ticker with weighing chart and trade panel, standing orders with ledger diary,
  holdings in shares, keeper page, proof, verify; MCP server and A2A card; market-clock night edition.
- Phase 4b additions: sell orders, typed refusals, Telegram, claims ledger, autonomy proof.
- Phase 5 proof: discovery, counterfactual with random control, calibration, break suite, manifest, claims check.
- Phase 6 QA: Playwright matrix over nine viewports and eight pages against the deployment; axe; no horizontal scroll.
- Web deployed (Vercel, Singapore region).

### Open, and why
- Paid certificates settle through B402, but the pay-to address from onboarding is the owner wallet, not the keeper.
- ERC-8183 job settlement: seven day dispute window; state is Submitted.
- Keeper hosting: runs on Render (Singapore, free plan) with a self-ping and a scheduled keepalive workflow; the web app reads its live status.
- Supabase tables: apply `services/keeper/schema.sql` in the project SQL editor so the recorder can write.
- Demo video: https://youtu.be/mghSQgCVnVo?si=dZ-BasdhM_vbtvNX

### Blockers
None that stop the build. The items above need an account action by the owner.

### Second round
- Independent equity reference with `REFERENCE_DISAGREE`, fail closed (packages/independent, kernel, keeper, planner, ticker page).
- Agentic Wallet: a certificate paid over x402 and an order placed and cancelled through baw.
- Agent Studio: `bag` scaffold, ERC-8004 #370049 linked, A2A endpoint on the Render agent card.
- API depth: gas-limit, transaction-detail, top-liquidity, address portfolio, broadcast.
- Whole-universe catalogue on the Shelf; live counters on the landing page and README.
- Open: the Supabase `detail` column migration; the owner approves which proposed orders to place; the repository About text.

