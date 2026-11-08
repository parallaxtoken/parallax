# Spike: Agentic Wallet (E10)

Goal: sign `ParallaxBook.placeBuy` through the Binance Agentic Wallet in Developer Mode, preview it, and run it on
mainnet with a small amount.

## What was set up

| Step | State | Evidence |
|---|---|---|
| Wallet Skills installed in the project | Done | `.agents/skills/binance-agentic-wallet` (installed from the Skills Hub), not committed |
| `baw` CLI 1.10.0 installed | Done | `baw --version` |
| Wallet connection status | `UNCONNECTED` before sign-in | `baw wallet status --json` |
| Parallax skill written | Done | `skills/parallax/SKILL.md` |
| Plan endpoint returns exact calls | Done | `POST /api/plan` |

## Mainnet run (done)

The owner signed in with the QR confirmation and enabled Developer Mode. Through `baw` only, in the order the skill
prescribes (`contract-call preview`, read the parsed result, then `execute`):

| Step | Result |
|---|---|
| Plan | `POST /api/plan`, standing buy of $0.20 of NVDA, 1% tolerance, owner = the Agentic Wallet address |
| Approve USDT to ParallaxBook | preview parsed as `Approve`, no risks; [0xdbc1aacbb517cae00028170504e6dcde708c7a6814ff6e642d2e4fe5a5816bc8](https://bscscan.com/tx/0xdbc1aacbb517cae00028170504e6dcde708c7a6814ff6e642d2e4fe5a5816bc8) |
| `placeBuy` | preview parsed as a contract interaction on ParallaxBook, simulation code `000000000`; [0xf4e2bdf75d643db18396e740eb2354b79cd73348f1f217f4c3c8e08c2c6d4b45](https://bscscan.com/tx/0xf4e2bdf75d643db18396e740eb2354b79cd73348f1f217f4c3c8e08c2c6d4b45) |
| Order | id 7, owned by the Agentic Wallet address `0x6914c90EA6F8760910971af6e2fCE8850659542A` |
| Fill | by the keeper, no further action by the owner; [0xca034f5a82ca44aca76508def94b30ca6827ccd4ac17d309d454ebc91b08c73d](https://bscscan.com/tx/0xca034f5a82ca44aca76508def94b30ca6827ccd4ac17d309d454ebc91b08c73d) |
| Verifier | every invariant PASS, `evidence/mainnet/verify_order_7.txt` |

## Findings

- `devMode.enabled` was false after sign-in; `contract-call preview` then returned `351801 Developer mode is not
  enabled`. The switch exists only in the app.
- The parsed `Approve` preview is readable and names the spender; the `placeBuy` preview shows only the selector
  (`action: 0xc407b0c7`) because the book ABI is not known to the parser. A published ABI hook would make the preview
  say "place standing buy".
- The skill's rule that an order id is not a completed swap held: `execute` returned `BROADCASTED` with an `orderId`
  and a `txHash`, and the order was confirmed on-chain afterwards.

## Second run: a cancel and an x402 payment

Both ran through `baw` only, previews first.

| Step | Result |
|---|---|
| `contract-call preview` and `execute`: `USDT.approve(ParallaxBook, $0.05)` | preview parsed as `Approve`, simulation code `000000000`; tx `0x093617b8b814a8d869573a5ec04987e04c398b43319ed58fd005aca7c52ce5dd` |
| `placeBuy` with a one-share floor, so it cannot fill | order 8; tx `0x7e8b9b50c2e3a7fda597b1edf3887cedfaa7c9f7f0848d60e588cadb3d034681` |
| `cancel(8)` | on-chain status 2; tx `0x32bd1fa6c02131300b9d08a13aa61bc475e97a4fa999cc9dcd2d9465952ce877` |
| `x402-payment preview` of the certificate 402 | option 1 USDT `permit2` READY_TO_SIGN with `needApproveFirst: true`; option 2 U `eip3009` ACTION_REQUIRED (no U balance) |
| `x402-payment sign --selectedIndex 1`, replayed with `PAYMENT-SIGNATURE` | Permit2 approve `0xad527fc2785b4fb847f6f94a5d8a239bef99ce9ecf67c13efc78597ba696a229`, settlement `0x4440411834a87b42a0631fb7354845bbb59b629f8e245e4be9ebd700db196081`, certificate returned with its sha256 |

Findings:

- The skill's x402 reference matched the CLI exactly. The 402 body worked as `--paymentRequirements` without edits.
- A `permit2` option needs an approve; `sign` dispatched it itself and the BSC gas was sponsored, so a wallet holding only USDT could pay.
- The merchant must compare the replayed `accepted` entry without relying on key order: the wallet re-serialises it. The certificate route now compares canonical JSON.
- The payment cost 0.01 USDT and no BNB.
