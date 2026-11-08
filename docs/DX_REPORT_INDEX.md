# DX report index

An index of `docs/DX_LOG.md` entries per required heading, to help the author write `DX_REPORT.md` in their own
words. It contains no draft prose.

| Heading | Where in the log |
|---|---|
| Onboarding | Network-level block from the home network (first entries, 2026-10-09 23:22Z to 23:44Z); docs index behind a bot challenge; key and portal steps; sign-in QR |
| Documentation issues | Skill file documents one provider type; Trading API says Ondo RFQ only; quote parameter table omits the 5 USD minimum; Ondo oracle address only on the issuer's own page; xStocks fee mechanism undocumented on the dividend page |
| API pitfalls | HTTP 200 with failure codes; `type` filter under-reports; xStocks multiplier differs between list, dynamic and token; `stockInfo.price` null for bStocks; asset status says TRADING while market status says closed; contract-taker simulation of a swap alone fails by design |
| AI stack feedback | Agentic Wallet install on Windows (`EBUSY`), Developer Mode requirement, `contract-call preview` then `execute`, the "orderId is not a completed swap" rule |
| Tokenized-stock specifics | Unit mechanism per issuer, liquidity asymmetry, broken quotes by session, corporate-action events (oracle log scan), ERC-8056 `TransferWithUIAmount` decoding trap |
| Redesign suggestions | Publish unit source per token in the list response; return the equity reference for every provider; expose route kind in the token list; document minimums |
| Requested capabilities | Unit-change webhook or event feed, per-token pause state in the list, keyless quotes for read-only agents, B402 self-serve onboarding |
