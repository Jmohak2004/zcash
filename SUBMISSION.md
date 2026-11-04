# Z-Pay — Stadium submission sheet

Paste-ready for the Free Society Hack (Zcash) **Privacy track**. Fill the `<<...>>`
slots (they need a real payment / your accounts), then copy each field into the Stadium
form. Submissions close **Thu 5 Nov, 00:00 IST**. Use the email you registered with on Luma.

---

**Track:** Privacy (Zcash)

**Project title:** Z-Pay

**One-line pitch** *(Works is scored against this)*
> Z-Pay lets any merchant take a shielded Zcash payment from a WhatsApp message — no wallet app, no POS hardware — while the buyer pays from MetaMask and no spending key ever touches a server.

**Point person / Luma email:** `<<your-luma-email>>`

**Public repo:** https://github.com/Jmohak2004/zcash

**Technologies used (comma-separated):**
> Zcash (Sapling/Orchard, ZIP-321, ZIP-317, PCZT), ChainSafe WebZjs (Rust→WASM), ChainSafe Zcash Snap, MetaMask Flask, lightwalletd (testnet.zec.rocks), Traefik gRPC-web proxy, Node.js, Express, Twilio WhatsApp, Google Gemini (OpenAI-compatible API), node:sqlite, Next.js, React, Tailwind CSS, TypeScript, Docker, Playwright

**Public URL to try on testnet:** `<<optional>>`
> The buyer flow uses a *local development* Snap (origin-locked to `localhost:3000`), so
> there is no public judge-usable deployment. Per the rules, a project whose Zcash works is
> shown in the video or README with an explorer link. See the video and txid below.

**One testnet transaction ID** *(Stadium checks it exists + is shielded)*
> `<<64-hex txid from a real payment — the checkout's "Transaction submitted: ..." line>>`
> Explorer: `<<https://testnet.zcashexplorer.app/transactions/...>>`
> Produce it with docs/RUNBOOK.md §5 (MetaMask Flask + funded TAZ).

**Viewing key (optional — paste it; it helps the Private score):**
> `<<uviewtest1... — the unified full viewing key of the wallet that RECEIVED the payment>>`
> Self-pay demo: it's what the Snap's `getViewingKey` returns. Separate merchant wallet:
> export the UFVK there. Use a demo wallet only; it reveals that wallet's whole history.

**Wallet birth height (optional):**
> `<<the block height of your txid, from the explorer (e.g. 3100000)>>`

**Demo video (≤ 2 min):** `<<youtube/loom link>>`
> Shot list and narration in docs/DEMO.md. Show steps 3–6 uncut.

---

## Privacy and trust note (scored for *Private*)

What stays private?
On-chain, sender, receiver, amount and memo are all shielded (Sapling/Orchard); an explorer sees only that a shielded transaction exists. The buyer's spending key never leaves MetaMask — the checkout page and our backend only ever receive a viewing key, never a spending key.

What does the app reveal, and to whom?
- Invoice contents (amount, description/memo, merchant address, invoice UUID) are seen by: WhatsApp/Twilio (the merchant's message transits them), the Gemini extraction API (receives the raw message), our backend (stores the invoice in SQLite), and anyone holding the checkout URL (an unguessable UUID, but a bearer link).
- The light-wallet server (our gRPC-web proxy to a public testnet lightwalletd) sees the buyer's IP address and sync/query pattern — real network metadata, though never shielded plaintext.
- The checkout page holds the buyer's viewing key in memory during the payment session; while approved it can read that account's history. In memory only, never persisted.
- The optional watch-only merchant observer holds the merchant viewing key and sees every receipt to that address.

What do users have to trust?
- Us, the operator: the backend that mints invoices and holds the invoice DB and merchant viewing key, and the checkout page that handles the buyer's viewing key in memory.
- Google Gemini: receives the merchant's message for extraction.
- Twilio/WhatsApp: carry the message and the reply.
- The hosted lightwalletd and our proxy: see the buyer's network metadata.
- MetaMask and the ChainSafe Zcash Snap (an unaudited development fork): to isolate the spending key and sign only what the buyer approves.
No one has to trust a buyer-submitted transaction hash: the server marks an invoice paid only when its own observer independently matches the exact memo, amount, shielded pool and confirmations.

What would you fix next?
- Keep the viewing key off the page: move note-scanning into the Snap or a worker so the page never holds the UFVK.
- Network privacy: route lightwalletd traffic through Nym or Tor so the light-wallet server no longer sees the buyer's IP.
- Invoice metadata: one-time/expiring checkout URLs, invoices encrypted at rest, and on-device extraction to cut Gemini and Twilio out of the plaintext path.
- Replace the unaudited development Snap with an audited distribution.

## Next 30-day milestone

Keep the buyer's viewing key off the checkout page: move shielded-note scanning out of the browser page and into the Snap / a dedicated worker, so the page never holds the unified viewing key — only the Snap ever touches key material. Deliverable: a public testnet payment where browser devtools show no viewing key in page scope. (~10 hours; the single biggest privacy improvement, and self-contained.)

## Links to anything already started (optional)

```
https://github.com/Jmohak2004/zcash
https://github.com/Jmohak2004/zcash/blob/main/patches/webzjs-checkout.patch  (WebZjs: ZIP-321 memo passthrough + real txid return — candidate upstream contribution)
```

## Feedback for the Zcash teams (optional, not scored)

WebZjs: the wallet's `pczt_create` takes no memo argument and there's no documented way to attach a ZIP-321 memo — we patched `Payment::without_memo` into `Payment::new` to carry an invoice memo. `pczt_send` returns `()` instead of the txid, so there's no way to get the broadcast transaction ID without patching it to return `txid.to_string()`. The Snap's `signPczt` param is misspelled `pcztHexTring`, which cost time. Building the SDK is heavy: Rust nightly + wasm-pack + a wasm32 LLVM/Clang (Apple's Clang lacks the wasm32 target, undocumented) + `-Z build-std`; a prebuilt browser bundle would help. `zcashd`'s `z_importviewingkey` only accepts Sapling viewing keys, not unified (UFVK), so a watch-only observer can't scan an Orchard-only receiver — the docs don't flag this.

## Event feedback (required before finalizing)

Four quick ratings — fill these in yourself on the form.

---

## Technologies used (detail)

- **Zcash:** shielded testnet payments (Sapling/Orchard), ZIP-321 payment requests, ZIP-317 fees, PCZT.
- **ChainSafe WebZjs** (pinned `a50df94`, patched) — in-browser wallet SDK compiled to WASM, cross-origin-isolated threads.
- **ChainSafe Zcash Snap** for **MetaMask Flask** — holds the spending key, signs the PCZT, origin-locked and testnet-forced by the tracked patch.
- **lightwalletd** (public testnet) behind a **Traefik** gRPC-web proxy.
- **Backend:** Node.js 22, Express, Twilio (WhatsApp + signature verification), **Google Gemini via its OpenAI-compatible API** (invoice extraction), `node:sqlite`, `uuid`.
- **Frontend:** Next.js 16 (App Router, Turbopack), React 18, Tailwind CSS, TypeScript.
- **Settlement:** watch-only zcashd observer (`z_listreceivedbyaddress`).
- **Tooling:** Node test runner, Playwright, Docker Compose.

## Design decisions (and why)

- **Build on the Snap, not a standalone wallet** — bring shielded Zcash to the EVM ecosystem users already have; the buyer installs no Zcash wallet.
- **Spending key stays in the Snap** — the page/backend only ever get a viewing key, so a compromised server cannot move funds.
- **Server never trusts a submitted txid** — an independent observer matches the exact padded memo, amount, shielded pool and confirmations before marking `paid`.
- **Memo carries `ZPAY:{invoice-uuid}`** — reconciles a shielded on-chain payment to an order without revealing the order to the chain.
- **Testnet-only, mainnet Snap rejected** — the checkout verifies `zpay_getNetwork` returns `test` + `zpay-v1` and refuses anything else.
- **Ambiguity-safe payment state machine** — after broadcast begins it never auto-unlocks, because a timeout is not proof the transaction failed (no accidental double-pay).
- **Nothing mocked in the real flow** — tests use mocks, but the demo path is a genuine shielded on-chain transaction.
