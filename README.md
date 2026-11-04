# Z-Pay — shielded checkout, without a merchant app

> **Continuing this project (human or AI)? Start with [AGENTS.md](AGENTS.md)** — current
> status, open tasks, environment gotchas, and a codebase map in one place.

A WhatsApp-first point of sale for the Zcash Privacy Track. Merchants request a checkout in natural language. Buyers pay shielded **testnet ZEC through a ChainSafe Zcash Snap development build in MetaMask**. Spending keys never enter the checkout or backend.

The current implementation is testnet-only. The public mainnet Snap is intentionally rejected. A real funded-wallet payment must still be exercised with MetaMask; passing application tests is not proof of an on-chain transaction.

## What is built

- Express/Twilio webhook with signature verification, merchant allowlist, exact requested OpenAI extraction prompt, JSON validation and rate limiting.
- Durable SQLite invoices and Twilio replay deduplication.
- Neo-brutalist Next.js checkout with invoice loading, testnet labels, payment progress, duplicate-attempt protection and receipt polling.
- Actual ChainSafe `getViewingKey`, `getSeedFingerprint`, `signPczt` calls; WebZjs sync, PCZT creation, proof generation and lightwalletd submission.
- Pinned upstream patch preserving the invoice memo and returning a real transaction ID; testnet key derivation/signing and origin-restricted local Snap.
- Merchant dashboard at `/merchant`, protected by a server-configured token.
- Independent receipt observer: verifies amount, exact memo, shielded pool and confirmations through a configured watch-only testnet node. Buyer submissions alone never mark an invoice paid.
- Reproducible SDK/Snap preparation scripts and local gRPC-web proxy configuration.

```text
apps/
  backend/
    server.js                 Twilio, invoice and payment-state endpoints
    src/extract.js            OpenAI extraction and value validation
    src/store.js              SQLite persistence
    src/verifier.js           Independent shielded receipt reconciliation
    test/server.test.js       HTTP, persistence and settlement tests
  frontend/
    app/checkout/[id]/page.tsx
    app/merchant/page.tsx
    lib/zcash.ts              Real Snap + PCZT payment flow
    lib/sdk.ts                Client-only WASM loader
scripts/
  build-sdk.mjs               Fetch pinned upstream, patch, compile WASM
  prepare-snap.mjs            Prepare origin-restricted testnet Snap
  doctor.mjs                  Check prerequisites without printing secrets
patches/webzjs-checkout.patch
infra/                       Local testnet gRPC-web proxy
```

## Technologies used

- **Zcash:** shielded testnet payments (Sapling/Orchard), ZIP-321 payment requests, ZIP-317 fees, PCZT (partially-constructed Zcash transactions).
- **ChainSafe WebZjs** (pinned `a50df94`, patched) — in-browser wallet SDK compiled to WASM (Rust nightly + wasm-pack), run under cross-origin isolation.
- **ChainSafe Zcash Snap** for **MetaMask Flask** — holds the spending key, signs the PCZT, origin-locked and forced to testnet by the tracked patch.
- **lightwalletd** (public testnet, e.g. `testnet.zec.rocks`) behind a **Traefik** gRPC-web proxy.
- **Backend:** Node.js 22, Express, Twilio (WhatsApp + signature verification), Google Gemini via its OpenAI-compatible API (invoice extraction), `node:sqlite`, `uuid`.
- **Frontend:** Next.js 16 (App Router, Turbopack), React 18, Tailwind CSS (neo-brutalist), TypeScript.
- **Settlement:** watch-only zcashd observer (`z_listreceivedbyaddress`).
- **Tooling:** Node test runner, Playwright, Docker Compose.

## Design decisions

- **Build on the Snap, not a standalone wallet** — bring shielded Zcash to the EVM ecosystem users already have; the buyer installs no Zcash wallet.
- **Spending key stays in the Snap** — the page and backend only ever receive a viewing key, so a compromised server cannot move funds.
- **Server never trusts a submitted txid** — an independent observer matches the exact padded memo, amount, shielded pool and confirmations before marking `paid`.
- **Memo carries `ZPAY:{invoice-uuid}`** — reconciles a shielded on-chain payment to an order without revealing the order to the chain.
- **Testnet-only, mainnet Snap rejected** — the checkout verifies `zpay_getNetwork` returns `test` + `zpay-v1` and refuses anything else.
- **Ambiguity-safe payment state machine** — after broadcast begins it never auto-unlocks, because a timeout is not proof the transaction failed (no accidental double-pay).
- **Nothing mocked in the real flow** — tests use mocks, but the demo path is a genuine shielded on-chain transaction.

## Submission and demo docs

- [SUBMISSION.md](SUBMISSION.md) — paste-ready Stadium fields (pitch, txid slot, links).
- [docs/RUNBOOK.md](docs/RUNBOOK.md) — exact boot order, checkpoints, troubleshooting.
- [docs/DEMO.md](docs/DEMO.md) — ≤2-min demo-video shot list.
- [docs/PRIVACY.md](docs/PRIVACY.md) — privacy and trust note (the four required answers).
- [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md) — the 30 days after.

## 1. Application setup

Node **22.13+**, npm, Rust, wasm-pack, and a WASM-capable Clang are required. Docker is optional for the provided proxy. Use a desktop Chromium browser with MetaMask Flask for the local development Snap.

```sh
nvm use
npm ci
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
npm run dev
```

Open http://localhost:3000. `/checkout/demo` is a clearly marked, non-paying UI preview. Fill in the backend environment locally for the real WhatsApp flow. Never paste credentials into the frontend environment or source code.

| Backend configuration | Purpose |
| --- | --- |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` | Server-side invoice extraction. Works with any OpenAI-compatible provider; the demo uses Google Gemini (`OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/`, `OPENAI_MODEL=gemini-flash-lite-latest`) |
| `MERCHANT_Z_ADDRESS` | Actual shielded **testnet** recipient |
| `MERCHANT_WHATSAPP_NUMBER` | Allowed sender, including `whatsapp:` prefix |
| `TWILIO_AUTH_TOKEN` | Signature verification |
| `TWILIO_WEBHOOK_URL` | Exact externally visible Twilio webhook URL |
| `CHECKOUT_BASE_URL` | Frontend origin used in checkout links |
| `DATABASE_PATH` | SQLite path; defaults to `./data/zpay.sqlite` in backend cwd |
| `MERCHANT_ADMIN_TOKEN` | High-entropy dashboard access token |
| `ZCASH_RPC_URL/USER/PASSWORD` | Optional independent watch-only receipt observer |
| `MIN_CONFIRMATIONS` | Settlement threshold, defaults to 3 |

Point the Twilio WhatsApp number/sandbox at `POST https://YOUR_API/webhook/twilio`. Expose backend port 3001 with an HTTPS tunnel for local testing and set `TWILIO_WEBHOOK_URL` to that exact URL. Set `CHECKOUT_BASE_URL` to the buyer-accessible frontend origin. The default local Snap only allows `http://localhost:3000`; see origin configuration below before sharing hosted checkout links.

`TWILIO_VALIDATE_SIGNATURE=false` permits local curl testing only outside production. No outbound Twilio API call is needed; replies use TwiML. Extraction has an 8-second timeout. The memo description is limited to 470 UTF-8 bytes to reserve space for the unique invoice marker.

## 2. Build the ChainSafe testnet SDK

Upstream commit: `a50df944c32243cb8da9f86e7d52cb65ac926439`.

```sh
rustup toolchain install nightly-2025-01-07 --component rust-src --target wasm32-unknown-unknown --profile minimal
cargo +stable install wasm-pack --locked
# macOS: install LLVM because Apple's Clang lacks the wasm32 target.
brew install llvm
export CC_wasm32_unknown_unknown=/opt/homebrew/opt/llvm/bin/clang
export AR_wasm32_unknown_unknown=/opt/homebrew/opt/llvm/bin/llvm-ar
npm run sdk:build
```

On Linux use your WASM-enabled LLVM/Clang paths. The script clones into `.cache/WebZjs`, verifies the commit, applies the tracked patch, builds wallet and keys WASM, and copies browser assets into `apps/frontend/public/sdk`. It uses upstream's `no-bundler` workers and initializes the thread pool once. `next.config.ts` supplies the required COOP/COEP headers. Generated binaries and downloaded source are ignored by Git; rebuild them before deployment.

`WEBZJS_SOURCE` and `WASM_PACK` can point at an existing pinned source checkout and tool binary. The SDK registry names in the initial brief do not resolve on npm; source builds replace a nonexistent dependency.

## 3. Build and serve the local testnet Snap

```sh
npm run snap:prepare
npm install --prefix .cache/snap
npm run build --prefix .cache/snap
npm start --prefix .cache/snap
```

Keep the Snap server on port 8080. The checkout requests `local:http://localhost:8080`, then calls the patched `zpay_getNetwork` RPC to verify `test` + `zpay-v1`. It will reject the published mainnet Snap. The package remains based on ChainSafe `@chainsafe/webzjs-zcash-snap`; this is a development fork, not an audited production distribution.

For another checkout origin, run `CHECKOUT_ORIGIN=https://your-checkout.example npm run snap:prepare`, rebuild, and reinstall the local Snap permissions. This does not modify permissions of the publicly published Snap. Local development Snap distribution requires a compatible MetaMask environment; a production Snap listing is a separate upstream/distribution step.

## 4. Start the testnet lightwalletd proxy

```sh
docker compose -f infra/compose.yaml up -d
```

This exposes `http://localhost:9067`, forwarding gRPC-web to the upstream example testnet service. It only allows the local checkout origin. Set `NEXT_PUBLIC_LIGHTWALLETD_URL` to this URL. For hosting, use HTTPS, update the proxy allowlist and point it at a verified available testnet lightwalletd service. Endpoint availability is not guaranteed by this repo.

The buyer needs confirmed shielded testnet notes in the account derived by this testnet Snap. Enter a wallet birthday block **at or before** the first receipt of funds. Zero scans full history and may take a long time. The checkout does not create or fund wallets and never requests a seed phrase.

## 5. Independent settlement

Configure a synced **testnet watch-only** zcashd observer that can decrypt payments to the merchant address. Keep spending keys in the Snap. The observer reads `getblockchaininfo` and `z_listreceivedbyaddress(address, 0)`; it never sends funds.

Important compatibility detail: zcashd's documented `z_importviewingkey` supports Sapling viewing keys, not Unified viewing keys. For this observer, use a merchant Sapling testnet address with a corresponding imported Sapling viewing key. Do not assume the Snap's UFVK can be pasted into this RPC. A merchant using an Orchard-only receiver needs a compatible viewing-key scanner adapter. The checkout can create Orchard payments, but this observer must actually recognize the chosen merchant receiver before settlement works.

Every payment memo contains the merchant description plus `ZPAY:{invoice UUID}`. The observer matches the exact padded memo bytes, amount in zatoshis and shielded pool. It polls every 20 seconds. It updates confirming/paid status, and withdraws paid status if a later successful scan loses the receipt after a reorg. Node outages preserve the last verified state; the invoice includes `verified_at` so that state can be assessed for freshness.

With no observer configured, the UI explicitly reports that independent confirmation is unavailable. It does not invent a paid state.

## Payment state and recovery

`open → preparing → broadcasting → submitted → confirming → paid`

The server reserves a payment attempt before creating the PCZT. A signing/proving failure releases preparation. Before the network call, it durably records `broadcasting`. An uncertain response stays locked: a timeout is not evidence that the transaction failed. The observer can reconcile the receipt even if the browser never recorded a transaction ID. An unfinished pre-broadcast preparation can be cancelled from its owning browser tab. There is no automatic re-payment after an ambiguous broadcast.

Invoices expire after 24 hours for new attempts. Already-active attempts and receipts remain observable. SQLite is intended for one backend process on a durable disk; use a transactional shared database and job queue before horizontal scaling. The dashboard and observer currently inspect the newest 1,000 invoices. Existing broadcasts may remain unresolved until operator investigation if the observer is unavailable.

## Validate and present

```sh
npm test
npm run typecheck
npm run build
npm run doctor
```

Tests cover Twilio verification, errors, invoice retrieval, concurrent retry deduplication, value/memo checks, restart persistence, duplicate-payment state transitions, receipt matching and reorg handling. They use mocks rather than moving funds.

For a judge-facing demonstration:

1. Send “Create a checkout for 0.5 ZEC for Website Design” to the WhatsApp agent.
2. Open the returned invoice and show the amount, recipient, description and **testnet** label.
3. Connect the ChainSafe testnet Snap; explain that only viewing material enters the browser and spending keys remain in MetaMask.
4. Approve signing; show sync, PCZT/proof/broadcast progress and the returned transaction ID.
5. Wait for the independent merchant receipt confirmation and show the invoice marked paid in `/merchant`.

This demo outline follows the original brief, not an unprovided official judging rubric. Never present `/checkout/demo`, mocked tests or an unconfirmed hash as a live payment.

## Privacy and remaining operational prerequisites

On-chain shielding is not end-to-end invoice secrecy. WhatsApp, the extraction service, this backend, and anyone possessing the checkout URL can see invoice details. Treat invoice URLs and the merchant viewing key as sensitive. The buyer's viewing key is held in memory only; it reveals account history to the checkout while approved. No analytics are installed. The development Snap inherits upstream signing UI behavior and needs a security review before production use.

Required for a live run: configured OpenAI/Twilio environment, compiled SDK, running development Snap, testnet gRPC-web connectivity, a funded testnet account, configured merchant receiver, and a compatible receipt observer. Neither a seed phrase nor payment authorization can be supplied by this repository.

The published Snap dependency currently has 10 moderate transitive npm audit findings. Do not force incompatible dependency overrides into the signing code merely to silence the audit.

Primary references: [ChainSafe WebZjs](https://github.com/ChainSafe/WebZjs), [Snap RPC implementation](https://github.com/ChainSafe/WebZjs/blob/main/packages/snap/src/index.tsx), [receipt RPC](https://zcash.github.io/rpc/z_listreceivedbyaddress.html), [viewing-key import limitations](https://zcash.github.io/rpc/z_importviewingkey.html).
