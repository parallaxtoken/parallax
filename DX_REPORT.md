# Developer Experience Report

**Project:** Parallax Protocol (`parallax-protocol`). **Lead Maintainer:** warlock-netizen.

Everything below comes from calls I made myself. The raw, timestamped notes are in [`docs/DX_LOG.md`](docs/DX_LOG.md), the data is in [`data/discovery`](data/discovery), and the scripts that produced it are in [`scripts/discovery`](scripts/discovery). If a claim here isn't backed by one of those, I haven't made it.

## Three things that changed what I built

1. **The unit lives in a different place for each issuer, and the API doesn't tell you.** bStocks keep it on the token (`uiMultiplier`, ERC-8056). Ondo keeps it in a separate `SyntheticSharesOracle` (`getSValue`). xStocks rebase the balance and can take a fee through the multiplier. The public API hands back a "multiplier" for all three without saying which mechanism is behind it, and for xStocks it didn't match the token.
2. **The docs and the service disagree about who is supported.** The skill file says one provider is supported. The catalogue serves three provider types on BSC. The trading docs say Ondo is always RFQ, yet a keyed `quote` with a contract as taker came back with plain SWAP calldata for Ondo.
3. **You can't count on a reference price for every wrapper.** bStocks have no equity reference in the public per-token response. The Ondo "reference" is the same feed multiplied by the unit. xStocks prices are pool prints that sat up to twenty percent away from the equity.

## 1. Onboarding

- **First successful call took 22 minutes, and all of it was working out the network.** From my home connection in Nigeria the RWA endpoints just hung until the client timeout, zero bytes, no HTTP status. The TCP connection to the API host never completes, so it looks like an outage rather than a geo-block. The prohibited-regions page lists countries that get refused. It doesn't mention that other regions may simply never connect. A VPN fixed it.
- **The docs index meant for agents can't be fetched by an agent.** `llms.txt` and `llms-full.txt` answer `202` with an empty body to plain HTTP, and `ECONNRESET` to a hosted fetcher, because of a bot challenge. A real browser context gets through. I saved both under `docs/vendor/` with `scripts/vendor_docs.mjs`.
- **Keyed access needs a round trip through the portal**, and the key's capability domains are fixed when you create it. My first key had no B402 permission and the call returned `40104 No permission: B402`. Nothing in the key list hinted at it. Once I made a key with B402 enabled, `supported` answered straight away.
- **Wallet Skills** installed fine through `npx skills add`. On Windows one target failed with `EBUSY: unlink` on a symlinked directory while the others went through. The `baw` CLI came from npm (`@binance/agentic-wallet`).
- **Sign-in is easy to miss.** The Agentic Wallet confirmation has to happen inside five minutes while the CLI is already waiting. If the code has expired when you scan it, the app just sits on "confirm in your Agent" and nothing tells you the code is dead.
- **Hosting.** Vercel's default region is a US one the API refuses, so every route that calls it needs `preferredRegion = ['sin1','hkg1']`. Vercel also refused to deploy a Next.js version with a published advisory.

## 2. Documentation issues

| Where | What I ran into |
|---|---|
| `binance-tokenized-securities-info` skill, API 1 | Says `type=1` is the only supported provider and to omit it for "all". The unfiltered list returns three provider types on BSC. `type=2` is xStocks and `type=3` is bStocks, which I only worked out by joining the list with on-chain symbols. Types 0, 6, 7, 8 and 10 return an empty array. |
| `trading-api/introduction` | Says Ondo is "always routed via 3-vendor RFQ". With the book contract as taker I got LiquidMesh with `executionMode: SWAP` at every size from $10 to $1,000. |
| `/quote` parameter table | Doesn't mention the Ondo minimum order. Under five dollars you get `40375 Minimum order amount is 5 USD`. |
| xStocks dividend page | Explains the rebasing multiplier but not the management fee that also moves it, and gives no function names. |
| Chainlink Ondo feed page | Names `SyntheticSharesOracle` and sValue but gives neither the BSC address nor the function signature. The address is on the issuer's own addresses page. |
| `tokenInfo.volume24h` | Documented as misleading (it's US equity volume). It is, and the warning helps, but the field shouldn't carry that name in the first place. |
| `referencePrice` | Documented as `tokenPrice / sharesMultiplier`. That's a definition, not a measurement. The docs should say plainly that the reference is derived. |

## 3. API pitfalls

- **HTTP 200 on failure.** Errors arrive as `200` with a failure `code` in the body (`40001`, `40374`, `40375`). If you only look at the status code you swallow all of them. My client turns a 200 with a non-success code into a typed degraded state.
- **`stockInfo.price` is `null` for all ten bStocks** in the dynamic response. Separately, at the weekend close the asset status said `TRADING` while the market status said `closed`. Two endpoints, same moment, different answers.
- **Three different xStocks multipliers.** The list endpoint says `"1"`, the dynamic endpoint returns another value, and the token's own `getCurrentMultiplier()` returns a third. Five of ten differed by up to 13 bps in my snapshot.
- **A contract-taker swap can't be simulated on its own.** The built `swap` has `from` set to the contract, which holds no USDT, so `pre-transaction/simulate` fails with `BEP20: transfer amount exceeds balance`. What you want to simulate is the contract's own `fill` call. I couldn't find that written anywhere.
- **The approve target.** For the aggregator, `approveTarget` is a router with no verified source on the explorer. I allowlisted it behind an exact approval and the on-chain share floor, and wrote the decision down in `DECISIONS.md`.
- **Log scanning.** `eth_getLogs` on the public dataseed endpoint returns `limit exceeded` for any range. One public endpoint took 4,999-block windows and got me through a 30-day scan (692 windows).
- **B402 settles in a different token.** `supported` reports United Stables, not USDT. A merchant who assumes USDT builds the wrong requirements, and a payer with only USDT has to swap first.
- **Latency** from the VPN exit, 15 samples each: market status p50 217 ms and p95 879 ms, dynamic p50 222 ms and p95 858 ms, list p50 288 ms and p95 557 ms.

## 4. AI stack feedback

- The Agentic Wallet skill is clear about confirmation, Developer Mode, and the rule that an order id isn't a completed swap. The contract-call route (`preview`, then `execute`) is exactly what a share-denominated order needs, and it's documented well. The one step an agent can't do alone is the sign-in, and the Developer Mode switch, which only exists in the app. I'd like the CLI to say so up front when `devMode` is off.
- The BNB Agent Studio SDK got me through ERC-8004 registration and ERC-8183 jobs in very little code. A few things worth knowing before you start: mainnet ERC-8183 pays in "United Stables", the dispute window is seven days, zero-price jobs are allowed, and ERC-8004 registration on mainnet was gas-sponsored.
- Feeding `llms-full.txt` to a coding agent worked well once the challenge was passed. It's a good primer.

## 5. Tokenized-stock specifics

- **Liquidity is lopsided.** Median deepest pool: bStocks about 739 thousand dollars, Ondo about 6.5 thousand, xStocks about 390 dollars (`data/discovery/summary.json`). Seven of ten Ondo tokens and all ten xStocks tokens have no pool above ten thousand dollars.
- **Off-hours behaviour.** The hourly Ondo vs bStocks spread per share had a median of 13.6 bps across weekend hours and about 7.5 bps in the other sessions. Direct-pool quotes more than five percent from the equity reference were common for Ondo and xStocks and absent for bStocks.
- **Differences in practice.** bStocks quote tightly and carry a unit you can read. Ondo needs the oracle read and has a five dollar minimum, and its corporate actions are scheduled pauses with an oracle log. xStocks have a usable token and an unusable market on BNB Chain.
- **A decoding trap.** bStocks emit `TransferWithUIAmount` with the same indexed shape as `Transfer`, so a decoder that matches on shape double counts. My own verifier did exactly that on real mainnet data. It now filters on the `Transfer` topic.
- **Corporate actions are visible on-chain.** A 30-day scan of the Ondo oracle turned up scheduled and applied corporate-action events and 106 value updates.

## 6. What I'd change

1. Return the unit source (address and selector) and its mechanism next to `multiplier`, per token.
2. Serve the same reference field for every provider, or say plainly that there isn't one.
3. Make the provider type a named value in the list response instead of an integer.
4. Put route kinds and minimums in the quote parameter table, and return the minimum as data inside the error payload.
5. Say whether a body error is worth retrying.
6. Document a way to simulate the contract-taker case, for example "simulate the caller's transaction, not the swap".

## 7. What I'd ask for

- A feed of unit changes and pauses for tokenized equities, either a webhook or a log filter.
- Per-token pause state and the next scheduled corporate action in the list response.
- Keyless, rate-limited read-only quotes for agents doing discovery work.
- Self-serve B402 onboarding, and an endpoint that tells you which domains a key holds.
- An Agentic Wallet sign-in that doesn't expire in five minutes, or at least says when it has.

## 8. Second round: the endpoints I had not used

These came from wiring five more endpoints into the product. Raw notes are in the second-round section of `docs/DX_LOG.md`.

- **A missing `value` looks like a bad request, and my keeper hid it.** `simulate` and `gas-limit` need `evmTx.value`. I left it out, got `40001 Parameter error`, and the keeper fell back to `eth_call` without complaint, so every fill I recorded says `ETH_CALL`. I only saw it when I added `gas-limit`. The error should name the field, and my fallback should have been loud.
- **Timestamp errors are a VPN problem too.** Both gas endpoints returned `401` with `Timestamp outside recv_window`. The message includes the server time, which is helpful, but a client that signs, waits three seconds on a VPN and then sends is outside the window. I retry with a fresh timestamp.
- **Revert data arrives as a string inside a string.** A reverting `gas-limit` call returns `40435` with `{"code":3,"message":"execution reverted: 0x30cd7471"}` as the `msg`. Usable, but it is JSON inside JSON.
- **Parameter names change between modules.** Balances take `address`, portfolio takes `walletAddress`, top-liquidity takes `tokenContractAddress`. Each failure was a `40001` that named the field, which is good, but a table of the names per endpoint would have saved a round of guessing.
- **Top-liquidity has no dollar figure for these tokens.** It lists pools and venues, and `liquidityUsd` is null for many of them, for example every NVDAon pool. I show pool counts and venue names and say so.
- **Portfolio PnL is per token.** The average buy price is per token, so a cost basis per share needs the unit, which the portfolio API does not have. Zeros come back for tokens the wallet never held, with `isPnlSupported: true`.
- **Broadcast works for contract calls.** The docs show a swap. A locally signed `approve(…, 0)` went through and mined. That made it safe to let the keeper relay fills through it, with the RPC as the fallback.
- **x402 from an agent wallet was smooth.** The skill's reference and the CLI agreed, the 402 body went in unedited, and a USDT-only wallet could pay because the Permit2 approve was sponsored. The one thing I had to get right was comparing the replayed `accepted` entry without depending on key order.
- **B402 reports more payment options than the docs suggest.** `supported` lists `permit2-exact` for USDT, USDC and WLFI next to the United Stables `eip3009` kind, so a merchant can take USDT. The 402 body now offers both.
- **The Studio CLI has a name trap.** `npm view bag` is an unrelated package. The right call is `npx -p @bnbagent/studio-cli bag`. After that `bag erc8004 show` and `update-endpoint` were direct, apart from the audit line printing a null transaction hash.

### What I would add to section 6

7. Name the required fields in `40001` for `evmTx` (`value`).
8. Return a dollar figure in every `top-liquidity` pool, or say when it is not available.
9. Put the parameter names for every module in one table.
10. Put a contract-call example next to the swap example for `broadcast-transaction`.

## Reproduce

```bash
pnpm install
pnpm discover                                  # E1 to E12 data and DISCOVERY.md
npx tsx scripts/discovery/e6_keyed.ts          # keyed legs, needs BINANCE_WEB3_API_KEY and SECRET
npx tsx scripts/discovery/b402_supported.ts
```
