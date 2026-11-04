# Demo video shot list (≤ 2 minutes)

Judges watch only the first 2 minutes and score **Works** against your one-line
pitch. The rule: show *every* step for real, no cuts that hide a mocked step. Rehearse
with the [RUNBOOK](./RUNBOOK.md) so the wallet is already funded and synced before
you record.

**Pitch to say in the first 5 seconds:** "Z-Pay lets any merchant take a shielded
Zcash payment from a WhatsApp message — no wallet app, no POS hardware. The buyer
pays from MetaMask; the merchant's spending keys never exist on our servers."

| # | Time | On screen | Say (narration) |
| --- | --- | --- | --- |
| 1 | 0:00–0:20 | WhatsApp: send *"Create a checkout for 0.5 ZEC for Website Design"*; bot replies with a link | "The merchant just texts what they want. An LLM parses amount and memo; we mint an invoice and reply with a checkout link. That's the whole merchant UX." |
| 2 | 0:20–0:35 | Open the link → checkout shows 0.5 ZEC, memo, merchant shielded address, TESTNET | "The buyer opens it on any device. Amount, what it's for, and the shielded address the funds go to." |
| 3 | 0:35–0:55 | Click Pay → Flask approves **read-only** access | "We ask MetaMask for a *viewing* key only. The spending key stays inside the ChainSafe Zcash Snap — our page and backend never see it." |
| 4 | 0:55–1:15 | "Scanning…", "Creating shielded transaction…" | "WebZjs syncs the shielded notes in the browser and builds a ZIP-321 transaction that carries the invoice memo, to a shielded recipient only." |
| 5 | 1:15–1:35 | Flask **"Z-Pay TESTNET — Sign PCZT"** dialog: recipient + amount → approve; proof + broadcast; txid appears | "The buyer signs in MetaMask. We generate the zero-knowledge proof and broadcast to testnet lightwalletd. Here's the transaction ID." |
| 6 | 1:35–1:50 | Paste the txid into a testnet explorer → shielded tx | "Real, on-chain, shielded. Amounts and sender stay private; this is the txid Stadium verifies." |
| 7 | 1:50–2:00 | `/merchant` dashboard flips the invoice to **PAID** | "An independent watch-only observer matches the memo and confirmations and marks it paid. A buyer can't fake payment — the server decides for itself." |

**If you can only show one thing, show steps 3–6 uncut** — that single take is the
proof that the shielded payment works.

## What proves each judged dimension
- **Works** — steps 1→7 in one unbroken flow; the explorer-verified txid.
- **Private** — step 3 (viewing-key-only) and step 6 (shielded on-chain). Mirror this
  in the written privacy & trust note.
- **Useful / will keep going** — the pitch: merchants onboard with zero install, from a
  channel (WhatsApp) they already use.
