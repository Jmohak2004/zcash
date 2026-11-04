# Z-Pay — Stadium submission sheet

Paste-ready for the Free Society Hack (Zcash) **Privacy track**. Fill the `<<...>>`
slots (they need your hardware/accounts), then copy each field into the Stadium form.
Submissions close **Thu 5 Nov, 00:00 IST**. Use the email you registered with on Luma.

---

**Track:** Privacy (Zcash)

**Project title:** Z-Pay

**One-line pitch** *(Works is scored against this)*
> Z-Pay lets any merchant take a shielded Zcash payment from a WhatsApp message — no wallet app, no POS hardware — while the buyer pays from MetaMask and no spending key ever touches a server.

**Point person / Luma email:** `<<your-luma-email>>`

**Public repo:** https://github.com/Jmohak2004/zcash

**Public URL to try on testnet:** `<<optional>>`
> Z-Pay's buyer flow uses a *local development* Snap (origin-locked to `localhost:3000`),
> so there is no public judge-usable deployment. Per the track rules, a project whose
> Zcash works is shown "in the video or README, for example a link to the transaction in
> an explorer." See the demo video and the explorer link below.

**One testnet transaction ID** *(Stadium checks it exists + is shielded)*
> `<<64-hex txid from a real payment>>`
> Explorer: `<<https://testnet.zcashexplorer.app/transactions/...>>`
> Produce it with [docs/RUNBOOK.md](docs/RUNBOOK.md) §5 (MetaMask Flask + funded TAZ).

**Demo video (≤ 2 min):** `<<youtube/loom link>>`
> Shot list and narration in [docs/DEMO.md](docs/DEMO.md). Show steps 3–6 uncut.

**Privacy and trust note:** [docs/PRIVACY.md](docs/PRIVACY.md)
> Answers the four required questions: what stays private, what the app reveals and to
> whom, what users must trust, and what we would fix next.

**Next step (30 days):** [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md)

---

## Technologies used

- **Zcash:** shielded testnet payments (Sapling/Orchard), **ZIP-321** payment requests,
  **ZIP-317** fees, PCZT (partially-constructed Zcash transactions).
- **ChainSafe WebZjs** (pinned `a50df94`, patched) — in-browser wallet SDK compiled to
  **WASM** (Rust nightly + wasm-pack), running with cross-origin-isolated threads.
- **ChainSafe Zcash Snap** for **MetaMask Flask** — holds the spending key; signs the
  PCZT; origin-locked to the checkout and forced to testnet by our patch.
- **lightwalletd** (public testnet, e.g. `testnet.zec.rocks`) via a **Traefik** gRPC-web
  proxy.
- **Backend:** Node.js 22, Express, Twilio (WhatsApp + signature verification), OpenAI
  (invoice extraction), `node:sqlite` (durable invoices), `uuid`.
- **Frontend:** Next.js 16 (App Router, Turbopack), React 18, Tailwind CSS
  (neo-brutalist), TypeScript.
- **Settlement:** a watch-only zcashd observer (`z_listreceivedbyaddress`).
- **Tooling:** Node test runner, Playwright, Docker Compose.

## Design decisions (and why)

- **Build on the Snap, not a standalone wallet** — bring shielded Zcash to the EVM
  ecosystem users already have; the buyer never installs a Zcash wallet.
- **Spending key stays in the Snap** — the page/backend only ever get a viewing key, so
  a compromised server cannot move funds.
- **Server never trusts a submitted txid** — an independent observer matches the exact
  padded memo, amount, shielded pool and confirmations before marking `paid`; a buyer
  can't fake payment.
- **Memo carries `ZPAY:{invoice-uuid}`** — reconciles an on-chain shielded payment to an
  order without revealing the order to the chain.
- **Testnet-only, mainnet Snap rejected** — the checkout verifies `zpay_getNetwork`
  returns `test` + `zpay-v1` and refuses anything else; no real funds at risk.
- **Durable, ambiguity-safe payment state machine** — `open → preparing → broadcasting →
  submitted → confirming → paid`; after broadcast begins it never auto-unlocks, because a
  timeout is not proof the transaction failed (no accidental double-pay).
- **Nothing mocked in the real flow** — tests use mocks, but the demo path is a genuine
  shielded on-chain transaction (the rubric rewards Works, penalises mocked steps).
