# DX_LOG (raw, timestamped, UTC)

Author: warlock-netizen. Raw working notes. `DX_REPORT.md` is written separately by the author from this log.

## 2026-10-09

- 23:22Z. First API attempt, public RWA list and market status endpoints from the author's home network (Port
  Harcourt, NG). Both calls hang until the client timeout (22s and 20s), zero bytes, no HTTP status.
  Not an HTTP geo-refusal: the TCP connection to `www.binance.com:443` never completes (curl `Connection timed out
  after 15002 milliseconds`). `web3.binance.com` fails the same way. `bnbchain.org` and BSC RPCs are reachable. The
  error is indistinguishable from an outage; nothing in the prohibited-regions page says that unlisted regions can
  also be unreachable at the network level.
- 23:40Z. Docs fetch from a hosted fetcher (US) of `https://web3.binance.com/en/dev-docs/llms.txt` fails with
  `ECONNRESET`. Same URL via curl with a browser UA returns `202` and an empty body (looks like a bot challenge).
  Fetching it with `fetch()` from inside a real browser tab on the docs origin returns `200` and 451,593 characters.
  The "doc index for agents" link on the hackathon page is therefore not usable by a plain HTTP agent.
- 23:44Z. VPN enabled (egress Bucharest, RO). First successful call: `market/status/ai` -> `200`,
  `code 000000`, 3.07s cold. Time from first attempt to first success: 22 minutes, all of it network diagnosis.
- 23:45Z. `stock/detail/list/ai` with no `type` returns 1,938 rows (363 KB). The skill file says `type=1` is "the only
  supported tokenized stock provider". On BSC the unfiltered list contains three provider types: 1 (Ondo), 2 (xStocks),
  3 (bStocks). `type=0,6,7,8,10` return `200` with an empty array, `type=4,5,9` return other rows (11 appears only in the unfiltered list). A documented
  filter that silently under-reports the catalog.
- 23:46Z. `type=2` is xStocks and `type=3` is bStocks. Established by joining the list with independently verified
  token addresses (CoinGecko platform data, BSC `symbol()` reads). Not documented in the skill file.
- 23:48Z. `multiplier` in the list equals the on-chain unit exactly for all bStocks and all Ondo names tested
  (30 of 30 rows joined, 20 compared). For xStocks the list says `"1"` while the dynamic endpoint says a value that
  differs from the token's own `getCurrentMultiplier()` (see `data/discovery/e3_reference_and_units.json`).
- 23:50Z. `rwa/dynamic/ai` (v2) for a bStock: `stockInfo.price` is `null`, `statusInfo.marketStatus` is `null`.
  For an Ondo name the same fields are populated. Same endpoint, same response shape, populated per issuer.
- 23:52Z. `kline/ai` 1h, limit 300: `200`, 300 candles for bStocks and Ondo names, 5 to 256 for xStocks
  (shallow history on the thin pools). Candle index 0 is open time, 6 is close time, as documented.
- 23:55Z. Keyed host `https://web3.binance.com/build/api/v1/dex/market/rwa/platforms` with no key returns
  `401 {"msg":"API Key is required","code":40101}`. Bare `/api/v1/...` returns `301` to `/build` as documented.
  Keyless public `bapi` endpoints cover list, meta, status, dynamic, kline. Quote, swap, simulate and wallet are
  keyed. No keyless way to ask the aggregator for contract calldata.
- 23:58Z. Docs (`trading-api/introduction`): Ondo names are "always routed via 3-vendor RFQ" (`executionMode=RFQ`),
  bStocks are "LiquidMesh (SWAP) + PcsXRfq (RFQ)", xStocks are "regular AMM liquidity pools". RFQ means an
  EIP-712 signature from the owner. A contract cannot be the signer of an RFQ order, so the Trading API cannot
  deliver unattended Ondo fills; the AMM and LiquidMesh routes are the only candidates (E6/E11, needs a key).

## 2026-10-10

Times below are approximate to the minute, reconstructed from file timestamps and the recorder log.

- 00:00Z. Latency, 15 samples per endpoint from the VPN egress (RO): market status p50 217 ms, p95 879 ms; dynamic
  p50 222 ms, p95 858 ms; list (`type=3`) p50 288 ms, p95 557 ms. All `200/000000`.
- 00:01Z. Recorder started (30 wrappers every 60s). Market status progressed `postmarket` -> `paused` -> `closed`
  across 23:58Z to 00:00Z; asset status for bStocks keeps saying `TRADING` while the market-level endpoint says
  `closed`. The two disagree during the weekend close.
- 00:02Z. On-chain, bStock token is an immutable beacon proxy; implementation `SecuritiesToken` implements
  ERC-8056 scaled UI amount with a scheduled multiplier (`uiMultiplier`, `newUIMultiplier`, `effectiveAt`).
  The "1:1 backed" launch wording and the skill's "Key Concept: Token is not Share" are consistent only once the
  multiplier is read. Raw `balanceOf` does not change on a dividend.
- 00:03Z. Ondo GM token carries no unit at all. The unit lives in a separate oracle
  (`SyntheticSharesOracle.getSValue(asset) -> (sValue, paused)`), whose BSC address is published on
  `docs.ondo.finance/addresses`, not in the Chainlink page that explains sValue. The Chainlink page names the
  oracle but gives neither address nor function signature.
- 00:03Z. xStocks tokens (BackedAutoFeeToken) are rebasing: `balanceOf` is shares x multiplier. They also carry a
  management fee that lowers the multiplier per period (`feePerPeriod`, `periodLength`). The xStocks docs page for
  dividends does not mention the fee mechanism or the function names.
- 00:04Z. xStocks exist on BSC for 10 of 10 target tickers and the list endpoint serves them as `type=2`, yet the
  tokenized-securities skill file documents only Ondo (and the skill description says Ondo only). The Trading API
  introduction does name xStock. Their pools are tiny: the median deepest pool across the 10 is in the hundreds of
  dollars (`data/discovery/summary.json`, `liquidity`).
- 00:04Z. `eth_getLogs` over a wide range on `bsc-dataseed1.defibit.io`: `-32005 limit exceeded`. Public archive RPCs
  require tokens. Event history for E8 needs windowed scans or a keyed explorer API.

## 2026-10-10 (build session)

- 03:20Z. Headless Chromium (Playwright) passes the docs-site bot challenge that plain HTTP does not: `llms.txt`
  and `llms-full.txt` saved to `docs/vendor/` by `scripts/vendor_docs.mjs`. Plain `curl`: `202` and an empty body.
- 03:21Z. The Agentic Wallet skill installs with `npx skills add ...`. On Windows one agent target fails with
  `EBUSY: unlink` on a symlinked skills directory; the install for the others completes. `baw` CLI 1.10.0 via npm.
- 03:48Z. Keyed Trading API with the book contract as `userWalletAddress`: `quote` returns `LiquidMesh` with
  `executionMode: SWAP` for bStocks and for Ondo names, although `trading-api/introduction` says Ondo is "always"
  RFQ. xStocks return error `40374 Insufficient liquidity for a quote` at every size from $10 to $1000.
- 03:49Z. Ondo quote below five dollars: `40375 Minimum order amount is 5 USD.` Not in the quote parameter table.
- 03:50Z. `swap` builds calldata whose `from` is the book. `pre-transaction/simulate` of that calldata alone
  fails with `BEP20: transfer amount exceeds balance`: a contract taker holds no USDT by design, so the swap
  cannot be simulated in isolation. Simulating the book's own `fill` call is the correct unit.
- 03:50Z. The router in `approveTarget` has no verified source on the explorer (`getsourcecode` returns empty).
- 03:55Z. `eth_getLogs` on `bsc-dataseed1.defibit.io`: `limit exceeded` for any range. `bsc.rpc.blxrbdn.com`
  allows ranges up to 4,999 blocks and served a 30 day scan (692 windows) without errors.
- 04:10Z. B402 `supported` with the project key: `403 {"code":40104,"msg":"No permission: B402"}`. The key needs
  the B402 Payments permission and portal onboarding before the endpoint answers.
- 04:12Z. bStocks emit `TransferWithUIAmount` alongside `Transfer` with the same indexed shape. A decoder that
  matches on shape double-counts transfers; the verifier now filters on the `Transfer` topic. Found by running the
  verifier on a real mainnet fill, not by tests.
- 04:20Z. BNB Agent Studio SDK: the ERC-8183 payment token on mainnet is "United Stables" (not USDT), the dispute
  window is 604,800 seconds, and zero-price jobs are supported (`setBudget(0)`, `fund(0)` skips the approve).
  ERC-8004 registration on mainnet is gas-sponsored (receipt `effectiveGasPrice` 0).
- 04:30Z. Vercel `sin1` reaches the public RWA endpoints; the default US region is refused by policy, so every
  route that calls the data API pins `preferredRegion = ['sin1', 'hkg1']`.
- 04:40Z. Vercel refuses to deploy a Next.js version with a published advisory (`15.1.3`); 15.5.x deploys.
- 06:40Z. A standing buy placed from the web app was filled by the keeper through the aggregator route
  (`AGGREGATOR_LiquidMesh`, order 5): the first mainnet fill with the book as taker through the Trading API.
- 06:41Z. App Router: a route folder named `.well-known` returned 404 on the deployment; the agent card now lives
  under `/api/agent-card` with a rewrite from the well-known path.
- 06:45Z. Server render of the wallet SDK threw `indexedDB is not defined` and, on one route, turned into a 500.
  Connectors are now created on the client only.

## Second round (2026-10-10, evening)

- 20:10Z. `GET pre-transaction/gas-price` and `POST gas-limit` answered `401` with `code 40103 Timestamp outside
  recv_window` and a `serverTime` in the message. Over the VPN a round trip is 3 to 6 seconds, so a request signed
  before it left can be outside the window by the time it lands. The client now retries with a fresh timestamp.
- 20:12Z. `simulate` and `gas-limit` both returned `40001 Parameter error` for `evmTx: { from, to, data }`. The
  field that was missing was `value`. The keeper's simulation had therefore never used the Transaction API: it fell
  back to `eth_call` and the journal said so, which is the only reason it was noticed.
- 20:13Z. A reverting call to `gas-limit` comes back as `code 40435` with the revert data as a JSON string inside
  `msg` (`execution reverted: 0x30cd7471`). A successful call returns `{ gasLimit, energyRequired, ... }` with the
  Tron fields null.
- 20:15Z. `portfolio/token/latest-pnl` takes `walletAddress`, not `address` as the balance endpoints do. It returns
  an average buy price per token and zeros (with `isPnlSupported: true`) for a token the wallet never held.
- 20:16Z. `market/token/top-liquidity` returns pools and protocols for NVDAB, but `liquidityUsd` is null for many
  pools (all of NVDAon) and `protocolName` is null for some.
- 20:18Z. `transaction-detail-by-txhash` returned the keeper fill with `txStatus: success`, gas used and fee; the
  data array is empty until the index catches up, so "not indexed yet" is a state, not an error.
- 20:20Z. Yahoo Finance chart answered `429` after a handful of calls from one IP; the Nasdaq quote endpoint kept
  answering. From the Render host the Yahoo path worked (65 reference checks, all answered).
- 20:40Z. `baw x402-payment preview` accepted the 402 body as it was. A `permit2` option reports
  `needApproveFirst: true`; `sign` sent the approve itself and BSC gas was sponsored.
- 20:44Z. The replayed `accepted` entry came back with a different key order than the merchant wrote, so a string
  comparison failed in testing. Comparing canonical JSON fixed it.
- 20:50Z. `npm view bag` is an unrelated package. The Agent Studio binary is `bag` inside `@bnbagent/studio-cli`, so
  `npx bag` runs the wrong thing; `npx -p @bnbagent/studio-cli bag` is correct.
- 21:13Z. `bag erc8004 update-endpoint` logs an audit line with `status: submitted` and `tx_hash: null`; the hash is
  recoverable from the registry log, and `bag erc8004 resolve` showed the new A2A endpoint within a block.
- 21:18Z. `broadcast-transaction` accepted a locally signed contract call (USDT approve of zero) and returned a
  `txHash` and an `orderId`; the docs show only a swap example.
- 21:30Z. A repo rule `reference/` in `.gitignore` also matched `packages/reference`, so a new package was silently
  left out of a commit and the Render build would have failed. The rule is anchored now (`/reference/`).

