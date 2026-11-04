# Z-Pay demo runbook

The single source of truth for bringing the stack up and taking one real shielded
testnet payment end to end. Written to make the live demo (and the demo video)
survive — every step here was verified on the demo machine. If a step's checkpoint
fails, stop and fix it before moving on.

Judging weights **Works** hardest: "a small project where everything works can
score full marks; a big one with a mocked step can't." Nothing in this flow is
mocked. The checkpoints below are how you prove that.

---

## 0. Prerequisites (once)

| Need | Why | Check |
| --- | --- | --- |
| **Node 22.13+** (`nvm use`) | Backend uses the `node:sqlite` builtin; Node 20 dies with `ERR_UNKNOWN_BUILTIN_MODULE` | `node -v` → v22.x |
| Docker running | Runs the local gRPC-web → lightwalletd proxy | `docker ps` |
| MetaMask **Flask** (desktop Chromium) | Local development Snaps only install in Flask, not stable MetaMask | Flask icon in toolbar |
| `apps/backend/.env` + `apps/frontend/.env.local` | Config; copy from the `.env.example` files | `npm run doctor` |
| Prebuilt SDK + Snap | `apps/frontend/public/sdk/build.json` and `.cache/snap/dist/bundle.js` exist | `npm run doctor` |

The SDK (`public/sdk/`) and Snap (`.cache/snap/`) are gitignored build outputs. They
are already built on the demo machine. On a **fresh clone** you must rebuild them —
that is the heavy, Rust-nightly path, so do NOT plan to do it for the first time
during the demo:

```sh
npm run sdk:build     # needs Rust nightly + wasm-pack + git; clones pinned WebZjs
npm run snap:prepare  # then: npm i --prefix .cache/snap && npm run build --prefix .cache/snap
```

Backend `.env` keys that matter for the demo:
- `OPENAI_API_KEY` — required; the merchant message is parsed by the LLM.
- `MERCHANT_Z_ADDRESS` — your **testnet** shielded (unified/sapling) receiving address.
- `MERCHANT_WHATSAPP_NUMBER` — the only sender allowed to create invoices, e.g. `whatsapp:+1555...`.
- `TWILIO_VALIDATE_SIGNATURE=false` — lets you create invoices by local curl without Twilio (dev only).
- `ZCASH_RPC_URL`/`USER`/`PASSWORD` — optional watch-only testnet node for the independent receipt observer.

---

## 1. ⚠️ Free port 3000 FIRST

The frontend **must** run on `http://localhost:3000`. It is not optional:
- the Snap manifest `allowedOrigins` is locked to `http://localhost:3000`;
- the gRPC-web proxy (`infra/routes.yaml`) only allows that origin.

If anything else holds 3000 (Grafana defaults to it, as it did on the demo
machine), Next silently moves to 3002 and the payment flow breaks with confusing
CORS / Snap-origin errors. Check and clear it:

```sh
lsof -nP -iTCP:3000 -sTCP:LISTEN     # must print nothing
# if it prints a process, stop that service (e.g. Grafana) before continuing
```

---

## 2. Start the three processes (in order)

```sh
nvm use                                   # Node 22

# a) gRPC-web proxy to public testnet lightwalletd (testnet.zec.rocks)
(cd infra && docker compose up -d)

# b) local development Snap server  (serves at http://localhost:8080)
npm start --prefix .cache/snap

# c) backend API (:3001) + Next frontend (:3000)
npm run dev
```

**Checkpoints** (all must pass before you touch the browser):

```sh
curl -s localhost:3001/health            # {"ok":true,"network":"test",...}
curl -s localhost:8080/snap.manifest.json | head -c 40   # JSON, not 404
curl -sI localhost:3000/checkout/demo | grep -i cross-origin-embedder   # require-corp
curl -s localhost:3000/sdk/build.json    # {"network":"test","adapter":"zpay-v1"}
```

If `/checkout/demo` is served by anything other than our app, go back to step 1.

---

## 3. Create a real invoice (the merchant side)

Either path produces an invoice and a `/checkout/{uuid}` URL.

**A — real WhatsApp (best for the video):** from `MERCHANT_WHATSAPP_NUMBER`, message
the Twilio sandbox number: `Create a checkout for 0.5 ZEC for Website Design`. The
bot replies with the checkout link.

**B — local, no Twilio** (`TWILIO_VALIDATE_SIGNATURE=false`):

```sh
curl -s localhost:3001/webhook/twilio \
  -d "From=$MERCHANT_WHATSAPP_NUMBER" \
  -d "MessageSid=SMdemo$(date +%s)" \
  -d "Body=Create a checkout for 0.5 ZEC for Website Design"
# -> TwiML containing http://localhost:3000/checkout/<uuid>
```

Open that URL. **Checkpoint:** the invoice shows amount `0.5 ZEC`, memo
`Website Design`, your merchant shielded address, and `TESTNET ONLY`.

---

## 4. Fund the buyer wallet (do this before the demo, not during)

The buyer's shielded funds live in the Snap, derived from the Flask seed.

1. Install the Snap: on the checkout page click **Pay** once to trigger
   `wallet_requestSnaps` for `local:http://localhost:8080`, approve in Flask.
2. Get the buyer's testnet address from the Snap and send it **TAZ** from a faucet
   (any mentor can top you up). Wait for at least 1 confirmation.
3. **Note the block height around when you funded** — you will need it as the
   wallet birthday to keep sync short.

---

## 5. Take the payment (the money shot)

On `/checkout/{uuid}`:

1. **Wallet birthday block**: enter a height just *before* you funded. ⚠️ Leaving it
   at `0` scans the whole chain and can take many minutes — the number one way a
   live demo stalls. A recent height syncs in ~a minute or two.
2. Click **Pay Privately with MetaMask**. The flow, in order:
   - Flask asks to approve read-only access → the page gets the **viewing key +
     seed fingerprint** only (spending key never leaves the Snap).
   - "Scanning shielded notes…" (sync).
   - "Creating your shielded transaction…" — the patched Rust builds a ZIP-321
     PCZT with the invoice memo and enforces a shielded recipient.
   - Flask shows **"Z-Pay TESTNET — Sign PCZT"** with recipient + amount → approve.
   - "Generating the zero-knowledge proof…" then "Broadcasting…".
   - The page shows **`Transaction submitted: <txid>`**.
3. Copy the `txid`. Open it on a testnet explorer
   (e.g. `https://testnet.zcashexplorer.app`) — confirm it is a **shielded** tx.
   This is the transaction ID you submit to Stadium for the verification badge.

**Checkpoint:** a 64-hex txid, visible on an explorer, with shielded actions.

---

## 6. Independent settlement (optional but strong)

If you configured a watch-only testnet node (`ZCASH_RPC_URL`…), the server observer
polls every 20s and marks the invoice `paid` only after it independently sees the
exact memo, an amount ≥ the invoice, a shielded pool, and `MIN_CONFIRMATIONS`
confirmations. The checkout status flips to `PAID` on its own — a buyer-submitted
txid alone never does this. Showing that reconciliation on the `/merchant` dashboard
(token in `MERCHANT_ADMIN_TOKEN`) is a clean way to demonstrate trust-minimisation.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Backend exits, `ERR_UNKNOWN_BUILTIN_MODULE` | Node < 22 | `nvm use` |
| Checkout served by Grafana / wrong app | Port 3000 taken, Next moved to 3002 | Step 1 |
| "WebZjs requires cross-origin isolation" | COOP/COEP missing (not our app, or behind a proxy that strips headers) | Open our app directly on `localhost:3000` |
| "The testnet SDK has not been built" | `public/sdk/build.json` missing | `npm run sdk:build` |
| Snap won't connect / origin rejected | Frontend not on `localhost:3000`, or Snap built for a different origin | Step 1; re-run `npm run snap:prepare` with `CHECKOUT_ORIGIN` |
| Sync never finishes | Birthday block `0` (full scan) | Enter a recent height (step 5) |
| "This checkout requires the Z-Pay testnet development Snap" | `NEXT_PUBLIC_ZCASH_SNAP_ID` not `local:` | Check `.env.local` |
