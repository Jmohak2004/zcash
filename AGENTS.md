# AGENTS.md — read this first

Handoff context for any AI agent or developer continuing **Z-Pay**. This is the single
source of truth for *where things are* and *what to do next*. Read this, then the file
it points you to for your task. Do not re-derive the architecture — it is already built
and documented.

> Z-Pay is a **headless shielded point-of-sale** for the Zcash Privacy Track (Free
> Society Hack 2026). A merchant requests a checkout over WhatsApp; a buyer pays shielded
> **testnet** ZEC through the ChainSafe Zcash Snap in MetaMask. Spending keys never reach
> the page or server. **Testnet only; the mainnet Snap is deliberately rejected.**

## Status at a glance

| Area | State |
| --- | --- |
| Backend (Express/Twilio/Gemini/SQLite) | ✅ Done, 7/7 tests pass (Node 22) |
| Twilio WhatsApp webhook + Gemini extraction, wired & verified live | ✅ signed request → 200; Gemini parses in ~1.2s (set up via ngrok) |
| Frontend (Next.js checkout + `/merchant`) | ✅ Done, typecheck clean |
| Snap patch (ZIP-321 memo, shielded-recipient, real txid, testnet lock) | ✅ Done |
| Independent receipt observer | ✅ Done (optional watch-only node) |
| Full stack boots + verified end to end (minus browser signing) | ✅ Verified this session |
| Submission docs (README tech/design, privacy note, next steps, submission sheet) | ✅ Done |
| **Real testnet txid** | ⬜ Needs a human + MetaMask Flask + TAZ |
| **Demo video (≤2 min)** | ⬜ Needs a human to record |
| **Fill `<<...>>` slots in SUBMISSION.md + submit on Stadium** | ⬜ Human |

The code is essentially complete. What remains is **human-in-the-loop** (produce a real
transaction, record a video, submit) plus optional polish. An LLM cannot do the on-chain
or video steps; it *can* do the tweaks listed below.

## Doc map — go straight to the one you need

| You want to… | Read |
| --- | --- |
| Run the stack / reproduce the demo | [docs/RUNBOOK.md](docs/RUNBOOK.md) |
| Record the demo video | [docs/DEMO.md](docs/DEMO.md) |
| Understand/edit the privacy story | [docs/PRIVACY.md](docs/PRIVACY.md) |
| See the 30-day plan | [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md) |
| Submit on Stadium | [SUBMISSION.md](SUBMISSION.md) |
| Full architecture, build steps, state machine | [README.md](README.md) |

## Open tasks (the "small changes and tweaks")

Each item says **file → change → how to verify**. Ordered by value.

1. **Insert the real transaction ID.** After a human runs a payment ([RUNBOOK](docs/RUNBOOK.md) §5),
   put the 64-hex txid and explorer link into [SUBMISSION.md](SUBMISSION.md) (the
   `<<...>>` slots). Verify: the txid opens on `testnet.zcashexplorer.app` as a shielded tx.
2. **Fill the remaining `<<...>>` slots** in [SUBMISSION.md](SUBMISSION.md): Luma email,
   video URL, optional public URL. Verify: no `<<` left in the file.
3. **Set `MERCHANT_Z_ADDRESS`** in `apps/backend/.env` (testnet shielded `utest1…`/`ztestsapling1…`).
   The webhook throws "Merchant address missing" ([server.js](apps/backend/server.js) L45) until this is set, so
   invoice creation fails without it. LLM extraction (Gemini) and Twilio are already configured
   in `.env` (gitignored). Verify: a signed webhook request ([RUNBOOK](docs/RUNBOOK.md) §3) returns a
   `/checkout/<uuid>` link. `MERCHANT_WHATSAPP_NUMBER` is the sender allowlist (whatsapp:+…).
4. **(Optional) Enable the observer** for live settlement: set `ZCASH_RPC_URL/USER/PASSWORD`
   to a synced watch-only testnet node that can decrypt the merchant address, import a
   **Sapling** viewing key (see README §5 for the Orchard caveat). Verify: `/health` →
   `verification_enabled:true`, and a paid invoice flips to `PAID` on `/merchant`.
5. **(Optional) Polish the pitch/branding copy** in `apps/frontend/app/checkout/[id]/page.tsx`
   and the one-line pitch in [SUBMISSION.md](SUBMISSION.md). Verify: `npm run typecheck`.

For deeper, post-hackathon work see [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md) (e.g. keep the
viewing key off the page, Nym network privacy, Orchard observer).

## Environment gotchas (non-obvious — read before running anything)

- **Node 22.13+ is mandatory.** The backend uses the `node:sqlite` builtin; Node 20 dies
  with `ERR_UNKNOWN_BUILTIN_MODULE`. Use `nvm use` (`.nvmrc` = 22). This machine also has
  Node 20 as default, so always `nvm use` in a fresh shell.
- **Port 3000 must be free and the frontend must be on it.** The Snap origin-lock and the
  gRPC-web proxy CORS both hardcode `http://localhost:3000`. If something else holds 3000
  (Grafana did, on this machine), Next silently moves to another port and the payment flow
  breaks. Check: `lsof -nP -iTCP:3000 -sTCP:LISTEN`.
- **The SDK and Snap are prebuilt on THIS machine but gitignored.** `apps/frontend/public/sdk/`
  (57 MB WASM) and `.cache/snap/` are build outputs, excluded from git on purpose (too large,
  reproducible). A **fresh clone must rebuild them** — the heavy path: `npm run sdk:build`
  (Rust nightly + wasm-pack + LLVM, see README §2) then `npm run snap:prepare` + build (§3).
  Do not plan to do this for the first time during a live demo.
- **Background services may already be running** from the setup session: API `:3001`,
  Snap `:8080`, web (on 3002 if 3000 was taken), docker proxy `:9067`. Reuse or restart as
  needed; `docker compose -f infra/compose.yaml ps` shows the proxy.
- **Secrets live only in gitignored `.env` / `.env.local`.** Never commit them. Never put
  credentials in the frontend env or any `NEXT_PUBLIC_` var.

## Codebase map

```
apps/backend/
  server.js            Express app: /webhook/twilio, /api/session/*, /api/merchant, /health
  src/extract.js       LLM invoice extraction (Gemini via OpenAI-compatible API) + validation
  src/store.js         SQLite persistence (node:sqlite)
  src/verifier.js      Independent watch-only receipt reconciliation
  test/server.test.js  7 tests (HTTP, persistence, state machine, settlement)
apps/frontend/
  app/checkout/[id]/page.tsx   Buyer checkout UI (neo-brutalist)
  app/merchant/page.tsx        Token-gated invoice dashboard
  lib/zcash.ts                 Snap connect + PCZT create/sign/prove/broadcast flow
  lib/sdk.ts                   Client-only WASM SDK loader (needs cross-origin isolation)
  next.config.ts               COOP/COEP headers + /api rewrite to backend
scripts/      build-sdk.mjs (WASM), prepare-snap.mjs (origin-locked Snap), doctor.mjs
patches/      webzjs-checkout.patch (pinned WebZjs a50df94)
infra/        compose.yaml + routes.yaml (Traefik gRPC-web proxy to testnet.zec.rocks)
```

## Commands

```sh
nvm use                                   # Node 22 — do this first, every shell
npm ci                                    # install (root workspaces)
npm test                                  # backend tests (7/7)
npm run typecheck                         # frontend tsc
npm run doctor                            # check env + build artifacts (prints no secrets)
(cd infra && docker compose up -d)        # lightwalletd proxy :9067
npm start --prefix .cache/snap            # Snap server :8080  (must be prebuilt)
npm run dev                               # backend :3001 + frontend :3000
```

## Rules for whoever continues

- **Testnet only.** Never add mainnet code paths; the mainnet Snap must stay rejected.
- **Never mock the real payment path.** The rubric scores *Works* hardest and penalises
  mocked steps. Tests may mock; the demo must be a genuine shielded on-chain transaction.
- **Keep spending keys in the Snap.** The page/backend handle a viewing key at most.
- **Don't commit** `.env*`, `node_modules/`, `.next/`, `.cache/`, `public/sdk/`, `data/`,
  `*.sqlite*` (all gitignored). Don't commit the 57 MB WASM.
- **Attribution:** end commits with the `Co-Authored-By` line the harness configures;
  end PR descriptions with the generated-with line.

## Judging context (optimise for this)

Free Society Hack 2026, **Privacy track**, submissions close **Thu 5 Nov 00:00 IST**.
Required submission items (all satisfied by this repo's docs except the human steps):
repo+README with technologies & design decisions, one real **shielded testnet txid**
(Stadium checks it exists + is shielded), a public URL *or* video proving Zcash works, a
privacy & trust note, and a next-step. **Works** is the gate and tie-breaker: "a small
project where everything works can score full marks; a big one with a mocked step can't."
Second tie-break is the **Bonus** count. So: prove the real flow, keep it honest, ship.
