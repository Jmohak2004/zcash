# Z-Pay — shielded checkout, without a merchant app

> **Continuing this project (human or AI)? Start with [AGENTS.md](AGENTS.md)** — current
> status, open tasks, environment gotchas, and a codebase map in one place.

**Z-Pay makes shielded Zcash payments as easy as WhatsApp and MetaMask — no Zcash wallet required, no custodian, no compromise on privacy.**

A merchant sends one message. A buyer pays with their existing MetaMask. The spending key never leaves the browser. The memo is encoded on-chain via ZIP-321. This is what shielded Zcash adoption at scale looks like.

---

## Why this matters for Zcash

Zcash has the strongest on-chain privacy of any major network. Yet merchant and buyer adoption lags because the tooling asks too much: install a new wallet, acquire a separate address, understand ZEC vs TAZ, navigate unfamiliar UX. Z-Pay removes every one of those barriers:

| Barrier today | Z-Pay removes it |
|---|---|
| Buyer needs a Zcash wallet | MetaMask Flask + a Snap install is enough |
| Merchant needs a POS app | One WhatsApp message creates an invoice |
| Payment lacks structured metadata | ZIP-321 memo carries the invoice UUID on-chain |
| Anyone can claim "paid" by submitting a txid | Independent observer verifies on-chain, never trusts the buyer |
| Spending keys enter the page | They stay inside the Snap — the page only sees a viewing key |

### This project is designed for upstreaming

Z-Pay is not a closed product — it is a reference implementation and a set of upstream contributions waiting to happen:

1. **WebZjs patch (`patches/webzjs-checkout.patch`)** — adds `pczt_send` returning a real txid, ZIP-321 `Payment::new` with memo bytes, shielded-recipient enforcement, `zpay_getNetwork` RPC, and testnet lock. This patch is minimal, well-scoped and ready to be proposed as a PR to [ChainSafe/WebZjs](https://github.com/ChainSafe/WebZjs).

2. **gRPC-web proxy config (`infra/`)** — a production-ready Envoy config for self-hosted lightwalletd access with CORS, HTTP/2, and TLS. Any Zcash web app can copy this.

3. **ZIP-321 checkout pattern** — the payment-request URI format, PCZT signing flow, and memo-based invoice reconciliation documented here can be adopted by any merchant SDK.

4. **Developer onboarding scripts** — `npm run sdk:build`, `npm run snap:prepare`, and `npm run doctor` reduce a multi-hour Rust/WASM setup to three commands. These scripts belong in the upstream ChainSafe developer docs.

### The onboarding problem Z-Pay solves

The hardest part of building on Zcash today is not the cryptography — it is making the first working payment. This repo does that work for you:

- Rust toolchain, wasm-pack, and LLVM? Handled by `sdk:build`.
- Snap origin configuration? Handled by `snap:prepare`.
- gRPC-web proxy for the browser? Handled by `infra/compose.yaml`.
- LLM invoice extraction with a real provider? Handled by the OpenAI-compatible Gemini integration.
- State machine to prevent double-pays? In `server.js`.
- Cross-origin isolation for WASM threads? In `next.config.ts`.

A developer who has never touched Zcash can clone this repo, run four commands, and produce a real shielded on-chain transaction. That is the benchmark for Zcash developer experience that the ecosystem needs.

---

## What is built

- WhatsApp→invoice pipeline: Twilio webhook with signature verification, Gemini LLM extraction, merchant allowlist, replay deduplication, durable SQLite invoices.
- Neo-brutalist Next.js checkout: invoice loading, testnet labels, payment progress, duplicate-attempt protection, receipt polling.
- Full ChainSafe Snap integration: `getViewingKey`, `getSeedFingerprint`, `signPczt`; WebZjs sync, PCZT creation, zero-knowledge proof generation, lightwalletd broadcast.
- Pinned upstream patch: ZIP-321 memo, real txid from `pczt_send`, shielded-recipient enforcement, `zpay_getNetwork` RPC, testnet-only origin lock.
- Merchant dashboard at `/merchant`, token-gated.
- `/wallet` page: derives and displays the buyer's real `utest1…` unified testnet address from the Snap (needed to fund from a faucet and to use as `MERCHANT_Z_ADDRESS`).
- Independent receipt observer: verifies amount, exact memo, shielded pool and confirmation count through a watch-only testnet node. Buyer submissions alone never mark an invoice paid.
- Reproducible SDK/Snap build scripts and Envoy gRPC-web proxy.

```
apps/
  backend/
    server.js                 Twilio, invoice and payment-state endpoints
    src/extract.js            Gemini extraction and value validation
    src/store.js              SQLite persistence (node:sqlite)
    src/verifier.js           Independent shielded receipt reconciliation
    test/server.test.js       7 HTTP, persistence and settlement tests
  frontend/
    app/checkout/[id]/page.tsx  Buyer checkout (neo-brutalist)
    app/wallet/page.tsx         Derives + displays real testnet address from Snap
    app/merchant/page.tsx       Invoice dashboard
    lib/zcash.ts                Real Snap + PCZT payment flow
    lib/sdk.ts                  Client-only WASM loader (cross-origin isolation)
scripts/
  build-sdk.mjs               Fetch pinned upstream, apply patch, compile WASM
  prepare-snap.mjs            Origin-restricted testnet Snap
  doctor.mjs                  Prerequisite checker (no secrets printed)
patches/webzjs-checkout.patch  Upstream-ready WebZjs changes
infra/
  compose.yaml                Envoy gRPC-web proxy (Docker)
  envoy.yaml                  HTTP/2 + TLS + CORS config for testnet.zec.rocks
```

## Technologies used

- **Zcash:** shielded testnet payments (Sapling/Orchard), ZIP-321 payment requests, ZIP-317 fees, PCZT (partially-constructed Zcash transactions), unified addresses (`utest1…`).
- **ChainSafe WebZjs** (pinned `a50df94`, patched) — in-browser wallet SDK compiled from Rust to WASM (Rust nightly + wasm-pack), run under cross-origin isolation.
- **ChainSafe Zcash Snap** for **MetaMask Flask** — holds the spending key, signs the PCZT, origin-locked and forced to testnet by the tracked patch.
- **lightwalletd** (public testnet `testnet.zec.rocks`) behind an **Envoy** gRPC-web proxy.
- **Backend:** Node.js 22, Express 5, Twilio (WhatsApp + signature verification), Google Gemini via OpenAI-compatible API (`gemini-flash-lite-latest`), `node:sqlite`, `uuid`.
- **Frontend:** Next.js 16 (App Router, Turbopack), React 18, Tailwind CSS (neo-brutalist), TypeScript.
- **Settlement:** watch-only zcashd observer (`z_listreceivedbyaddress`).
- **Tooling:** Node test runner, Playwright, Docker Compose, Envoy.

## Design decisions

- **Build on the Snap, not a standalone wallet** — bring shielded Zcash to the billions of wallets already in the EVM ecosystem; the buyer installs nothing new beyond MetaMask Flask.
- **Spending key stays in the Snap** — the page and backend only ever receive a viewing key; a compromised server cannot move funds.
- **Server never trusts a submitted txid** — an independent observer matches the exact padded memo, amount, shielded pool and confirmations before marking `paid`.
- **Memo carries `ZPAY:{invoice-uuid}`** — reconciles a shielded on-chain payment to an order without revealing the order contents to the chain.
- **Testnet-only, mainnet Snap rejected** — the checkout verifies `zpay_getNetwork` returns `test` + `zpay-v1` and refuses anything else; no accidental mainnet spend possible.
- **Ambiguity-safe payment state machine** — after broadcast begins the state never auto-resets, because a timeout is not proof the transaction failed (prevents accidental double-pays).
- **Nothing mocked in the real flow** — tests use mocks, but the demo path is a genuine shielded on-chain transaction with a verifiable txid.
- **Birthday-aware address derivation** — the `/wallet` page fetches the live chain tip before calling `create_account_ufvk`, avoiding `GetTreeState(0)` failures on new chains.

## Submission and demo docs

- [SUBMISSION.md](SUBMISSION.md) — Stadium fields (pitch, txid slot, links).
- [docs/RUNBOOK.md](docs/RUNBOOK.md) — exact boot order, checkpoints, troubleshooting.
- [docs/DEMO.md](docs/DEMO.md) — ≤2-min demo-video shot list.
- [docs/PRIVACY.md](docs/PRIVACY.md) — privacy and trust note.
- [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md) — the 30 days after the hackathon.

---

## 1. Application setup

Node **22.13+**, npm, Rust, wasm-pack, and a WASM-capable Clang are required. Docker runs the gRPC-web proxy. Use a desktop Chromium browser with **MetaMask Flask** for the local development Snap.

```sh
nvm use
npm ci
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
npm run dev
```

Open http://localhost:3000. `/checkout/demo` is a UI preview with no real payment. The `/wallet` page derives your real shielded testnet address from the Snap — use it to fund from a faucet and as `MERCHANT_Z_ADDRESS`.

| Backend env var | Purpose |
|---|---|
| `OPENAI_API_KEY` + `OPENAI_MODEL` + `OPENAI_BASE_URL` | Invoice extraction. Any OpenAI-compatible provider. Demo uses Gemini: `OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/`, `OPENAI_MODEL=gemini-flash-lite-latest` |
| `MERCHANT_Z_ADDRESS` | Your real shielded **testnet** receive address (`utest1…` from `/wallet`) |
| `MERCHANT_WHATSAPP_NUMBER` | Allowed sender, with `whatsapp:` prefix |
| `TWILIO_AUTH_TOKEN` | Webhook signature verification |
| `TWILIO_WEBHOOK_URL` | Exact public URL in Twilio console |
| `CHECKOUT_BASE_URL` | Frontend origin in invoice links |
| `DATABASE_PATH` | SQLite path (default `./data/zpay.sqlite`) |
| `MERCHANT_ADMIN_TOKEN` | Dashboard token |
| `ZCASH_RPC_URL/USER/PASSWORD` | Optional watch-only receipt observer |
| `MIN_CONFIRMATIONS` | Settlement threshold (default 3) |

## 2. Build the ChainSafe testnet SDK

Upstream commit: `a50df944c32243cb8da9f86e7d52cb65ac926439`.

```sh
rustup toolchain install nightly-2025-01-07 --component rust-src --target wasm32-unknown-unknown --profile minimal
cargo +stable install wasm-pack --locked
# macOS: Apple Clang lacks the wasm32 target — use LLVM.
brew install llvm
export CC_wasm32_unknown_unknown=/opt/homebrew/opt/llvm/bin/clang
export AR_wasm32_unknown_unknown=/opt/homebrew/opt/llvm/bin/llvm-ar
npm run sdk:build
```

The script clones into `.cache/WebZjs`, verifies the commit, applies `patches/webzjs-checkout.patch`, builds wallet and keys WASM, and copies browser assets into `apps/frontend/public/sdk`. Generated binaries are gitignored — rebuild before deployment on a new machine.

## 3. Build and serve the local testnet Snap

```sh
npm run snap:prepare
npm install --prefix .cache/snap
npm run build --prefix .cache/snap
npm start --prefix .cache/snap
```

Keep the Snap server on port 8080. The checkout requests `local:http://localhost:8080` and calls the patched `zpay_getNetwork` RPC to verify `test` + `zpay-v1`. It rejects the published mainnet Snap. For a different checkout origin: `CHECKOUT_ORIGIN=https://your-checkout.example npm run snap:prepare`.

## 4. Start the testnet gRPC-web proxy

```sh
docker compose -f infra/compose.yaml up -d
```

Runs Envoy on `http://localhost:9067`, forwarding gRPC-web to `testnet.zec.rocks:443` with proper HTTP/2 upstream and CORS for `localhost:3000`. Set `NEXT_PUBLIC_LIGHTWALLETD_URL=http://localhost:9067` in `.env.local`. For hosting, update the Envoy CORS origin and point at a verified lightwalletd endpoint.

## 5. Get your testnet address and fund your wallet

Open **http://localhost:3000/wallet** in the browser with MetaMask Flask. Click "Show my Zcash testnet address" and approve both Flask popups (Snap install + viewing key reveal). Copy your `utest1…` address.

Fund it from a testnet faucet:
- [fauzec.com](https://fauzec.com/) — 1 TAZ / 24h
- [faucet.testnet.valargroup.dev](https://faucet.testnet.valargroup.dev/) — 0.125 TAZ / day

Note the block height when you fund — use it as the wallet birthday on the checkout page to keep sync fast (seconds instead of minutes).

## 6. Independent settlement

Configure a synced testnet watch-only zcashd node. The observer reads `z_listreceivedbyaddress` and matches exact memo bytes, amount in zatoshis, shielded pool, and confirmation count. It never sends funds.

**Compatibility note:** `z_importviewingkey` supports Sapling viewing keys, not Unified viewing keys. Use a Sapling merchant address for the observer. An Orchard-only receiver needs a compatible UFVK scanner.

## Payment state machine

`open → preparing → broadcasting → submitted → confirming → paid`

The server reserves a payment attempt before creating the PCZT. Before the network call it durably records `broadcasting`. An uncertain response stays locked — a timeout is not evidence the transaction failed. The observer reconciles even if the browser never recorded a txid. No automatic re-payment after an ambiguous broadcast.

## Validate

```sh
npm test         # 7/7 backend tests (Node 22 required)
npm run typecheck
npm run build
npm run doctor
```

## Contributing and upstreaming

The changes in `patches/webzjs-checkout.patch` are intentionally minimal and upstream-compatible. If you are a ChainSafe or Zcash Foundation contributor, the patch is ready to be proposed as a PR to [WebZjs](https://github.com/ChainSafe/WebZjs). The build scripts and Envoy config are reusable by any Zcash web project. Issues and PRs are welcome.

Primary references: [ChainSafe WebZjs](https://github.com/ChainSafe/WebZjs), [ZIP-321](https://zips.z.cash/zip-0321), [ZIP-317](https://zips.z.cash/zip-0317), [lightwalletd gRPC](https://github.com/zcash/lightwalletd), [Snap RPC](https://github.com/ChainSafe/WebZjs/blob/main/packages/snap/src/index.tsx).
