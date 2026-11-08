# EVIDENCE

Organization: Parallax Protocol. Maintainer: warlock-netizen. Updated after every deployment and transaction. Amounts are small by design.

## Deployment (BSC mainnet, chain 56)

| Item | Value |
|---|---|
| WrapperRegistry | [0xdDf50D8e6C4283eAD3A28878AF2bb604c1F6B2ea](https://bscscan.com/address/0xdDf50D8e6C4283eAD3A28878AF2bb604c1F6B2ea#code) |
| ParallaxBook | [0xa440a217B64c01659A1c911b795371C3C2e1A13e](https://bscscan.com/address/0xa440a217B64c01659A1c911b795371C3C2e1A13e#code) |
| Deployer | 0xAc543626f964bc06883C0b58911DA308A122fa49 |
| Deploy script | `contracts/script/Deploy.s.sol`, log `evidence/mainnet/deploy_log.txt`, broadcast `contracts/broadcast/Deploy.s.sol/56/run-latest.json` |
| Registry creation tx | [0xd9d10573...](https://bscscan.com/tx/0xd9d105734078a7470224a03d5108a41542dabafad44551fdefdf54442a5fbcd5) |
| ParallaxBook creation tx | [0xf4153bb3...](https://bscscan.com/tx/0xf4153bb36435d9c9484284ed2013241727a3e00db257f2297761380620ad3967) |
| Wrappers registered | 75 across 51 tickers, 2 routers allowlisted (PancakeSwap v3 SmartRouter, v2 router) |
| Total deploy cost | about 0.00049 BNB (79 transactions, 0 failed) |
| Verification | BscScan (Etherscan v2 API): passed for both. Sourcify: attempted |

## Autonomy run (BSC mainnet)

| Step | Transaction |
|---|---|
| place buy-1 | [0xb9e3732002440184dd6e1e3dce9a698a8c6bae87a1e3df6e95a3761a4cc7fe9d](https://bscscan.com/tx/0xb9e3732002440184dd6e1e3dce9a698a8c6bae87a1e3df6e95a3761a4cc7fe9d) |
| place buy-2 | [0x609f1ea8ed86d9c0a0aeb839cdb755c6130933645fdeb1efc145390e84cd85d0](https://bscscan.com/tx/0x609f1ea8ed86d9c0a0aeb839cdb755c6130933645fdeb1efc145390e84cd85d0) |
| place sell-1 | [0x93400783b582541ab38e02c1e3d59dbe740be5442fefa946ee7f0de9a870f26e](https://bscscan.com/tx/0x93400783b582541ab38e02c1e3d59dbe740be5442fefa946ee7f0de9a870f26e) |
| fill, order 0 (CLOSED_WEEKEND) | [0x25201e459dff174275b60c9c14d91af1029915d8952f4481e5a8752f67a25e5f](https://bscscan.com/tx/0x25201e459dff174275b60c9c14d91af1029915d8952f4481e5a8752f67a25e5f) |
| fill, order 1 (CLOSED_WEEKEND) | [0x0cce0c2d122133e43ca7e760c08d233449bbc514a480c309ff1f516089384cf7](https://bscscan.com/tx/0x0cce0c2d122133e43ca7e760c08d233449bbc514a480c309ff1f516089384cf7) |
| fill, order 2 (CLOSED_WEEKEND) | [0xff0e3df3178c9d2ba38fbd3e78958e182dd70d87a470174a57a01feaaa15e073](https://bscscan.com/tx/0xff0e3df3178c9d2ba38fbd3e78958e182dd70d87a470174a57a01feaaa15e073) |
| deliberate refusal (manual fill reverted, ShareFloor), order 3 | [0x85047053106d890df200de6eba5f82e1064941d8228543234b29287f8b0483a9](https://bscscan.com/tx/0x85047053106d890df200de6eba5f82e1064941d8228543234b29287f8b0483a9) |
| place order to cancel | [0x771ed708c35ac3ec687c36cf5d6895f88a0df3cab96984ecf00b82b5938838f0](https://bscscan.com/tx/0x771ed708c35ac3ec687c36cf5d6895f88a0df3cab96984ecf00b82b5938838f0) |
| cancel, order 4 | [0x54e1ddb7e97cc38e8016524e8dcbf70bc5402787fee41cacf495da1da4cdf4c0](https://bscscan.com/tx/0x54e1ddb7e97cc38e8016524e8dcbf70bc5402787fee41cacf495da1da4cdf4c0) |

Verifier output per order: `evidence/mainnet/verify_order_0.txt`, `_1`, `_2`. Owner nonce at the fill blocks equals the nonce after placing: `data/autonomy/summary.json`.

## Agent Studio

| Item | Value |
|---|---|
| ERC-8004 agent id | 370049 |
| Registration tx | [0xbb53249d22b9979389b2694955f2c0aebcca93876672ba60bf9fb84eee7ea9b8](https://bscscan.com/tx/0xbb53249d22b9979389b2694955f2c0aebcca93876672ba60bf9fb84eee7ea9b8) |
| ERC-8183 job id | 56961 (SUBMITTED) |
| Job manifest hash | `0x2ded7e54931a907cd88aba40b2f3ee17aa32c4b8be477f632b14c680ec593460` |
| Allowlist of the aggregator router | [0xc04e7c28...](https://bscscan.com/tx/0xc04e7c280a6766f8114d420c061bc391fec8bbfb76cf86039e5ce777a36c56c3) |

## Web journey (headless Chromium, deployed app)

`apps/web/e2e/journey.spec.ts` connected the owner test wallet, bought through the web app, placed a standing buy that
the keeper filled through the aggregator route (order 5, verifier output `evidence/mainnet/verify_order_5.txt`),
placed a standing sell with an unreachable floor and cancelled it from the Orders page, then read holdings in shares.

## Paid certificate (x402 / B402)

Settlement transaction: [0xf0e44c2ea0bacd7d473292a8ad8d1fd85a544b539442b427ab59e5df7c792020](https://bscscan.com/tx/0xf0e44c2ea0bacd7d473292a8ad8d1fd85a544b539442b427ab59e5df7c792020). Record: `evidence/mainnet/paid_certificate.json`. Payer and pay-to are the owner test wallet (onboarding address).

## Agentic Wallet

Approve [0xdbc1aacbb517cae00028170504e6dcde708c7a6814ff6e642d2e4fe5a5816bc8](https://bscscan.com/tx/0xdbc1aacbb517cae00028170504e6dcde708c7a6814ff6e642d2e4fe5a5816bc8), placeBuy [0xf4e2bdf75d643db18396e740eb2354b79cd73348f1f217f4c3c8e08c2c6d4b45](https://bscscan.com/tx/0xf4e2bdf75d643db18396e740eb2354b79cd73348f1f217f4c3c8e08c2c6d4b45), keeper fill [0xca034f5a82ca44aca76508def94b30ca6827ccd4ac17d309d454ebc91b08c73d](https://bscscan.com/tx/0xca034f5a82ca44aca76508def94b30ca6827ccd4ac17d309d454ebc91b08c73d). Record: `evidence/mainnet/agentic_wallet.json`.

## Hosted keeper

Live status of the Render service, captured once: `data/keeper/hosted_status.json`. Service config: `render.yaml`. Keepalive: `.github/workflows/keepalive.yml`. Supabase tables from `services/keeper/schema.sql`: `keeper_actions`, `orders_cache`, `quotes`, `sessions`.

## Second round

| What | Evidence |
|---|---|
| Independent reference snapshot, ten core tickers | `data/reference/snapshot.json`: nine agree (largest gap 61 bps), one could not be confirmed (timeout, would fail closed) |
| `REFERENCE_DISAGREE` and fail-closed behaviour | `packages/kernel/test/kernel.test.ts`, `packages/independent/test/reference.test.ts`, `services/keeper/test/keeper.test.ts` (engine level: disagree and unavailable) |
| Keeper reference counters | `refusalsByReason.REFERENCE_DISAGREE` and `reference` in `/api/agent/keeper`; journal rows carry the source, both prices and the gap |
| Agentic Wallet pays a certificate | [0x4440411834a87b42a0631fb7354845bbb59b629f8e245e4be9ebd700db196081](https://bscscan.com/tx/0x4440411834a87b42a0631fb7354845bbb59b629f8e245e4be9ebd700db196081), Permit2 approve [0xad527fc2785b4fb847f6f94a5d8a239bef99ce9ecf67c13efc78597ba696a229](https://bscscan.com/tx/0xad527fc2785b4fb847f6f94a5d8a239bef99ce9ecf67c13efc78597ba696a229); record `evidence/mainnet/agentic_payment.json` |
| Agentic Wallet places and cancels an order (order 8) | approve [0x093617b8...](https://bscscan.com/tx/0x093617b8b814a8d869573a5ec04987e04c398b43319ed58fd005aca7c52ce5dd), placeBuy [0x7e8b9b50...](https://bscscan.com/tx/0x7e8b9b50c2e3a7fda597b1edf3887cedfaa7c9f7f0848d60e588cadb3d034681), cancel [0x32bd1fa6...](https://bscscan.com/tx/0x32bd1fa6c02131300b9d08a13aa61bc475e97a4fa999cc9dcd2d9465952ce877); record `evidence/mainnet/agentic_cancel.json` |
| Five more API endpoints answered | `data/discovery/e13_api_depth.json` (gas-limit, transaction-detail-by-txhash, top-liquidity, portfolio latest-pnl, broadcast of a contract call) |
| Broadcast accepted a contract call | [0x46cab928241fdac1d671084a6077f669688e0f4db10c22f770430f4b2b2f8169](https://bscscan.com/tx/0x46cab928241fdac1d671084a6077f669688e0f4db10c22f770430f4b2b2f8169), mined success |
| ERC-8004 record points at the Render agent card | [0xa35ebc3fe3bea5669ac6b5d40cec918f2b2dd6e88c9a3837b8caa5b9261bbe3a](https://bscscan.com/tx/0xa35ebc3fe3bea5669ac6b5d40cec918f2b2dd6e88c9a3837b8caa5b9261bbe3a); `docs/AGENT_STUDIO.md` |
| Live counters | `data/live/summary.json`, `/api/live` |
| Proposed orders (not placed) | `docs/PROPOSED_ORDERS.md` |

