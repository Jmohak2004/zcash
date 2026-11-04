# Privacy and trust note

Required by the Privacy track and scored directly for **Private**. Z-Pay shields the
payment on-chain; it does not pretend the rest of the pipeline is invisible. The
honest exposures are named below.

## 1. What stays private?

- **On-chain:** sender, receiver, amount and memo are shielded (Sapling/Orchard).
  A chain or explorer observer can see that a shielded transaction exists and that
  it has shielded actions — not who paid whom, how much, or what for.
- **The buyer's spending key never leaves MetaMask.** The ChainSafe Snap holds it;
  it never reaches the checkout page, the backend, logs, or the network. The page
  receives only a *viewing* key and a seed fingerprint, and only after the buyer
  approves.

## 2. What does the app reveal, and to whom?

- **Invoice contents** (amount, description/memo, merchant shielded address, invoice
  UUID) are visible to, in order of the pipeline: **WhatsApp/Twilio** (the merchant's
  message transits them), the **OpenAI** extraction API (receives the merchant's raw
  message), our **backend** (stores the invoice in SQLite), and **anyone holding the
  checkout URL** — it is an unguessable UUID, but it is a bearer link.
- **The light-wallet server** (our gRPC-web proxy → a public testnet lightwalletd such
  as `testnet.zec.rocks`) sees the **buyer's IP address and sync/query pattern**. It
  cannot read shielded plaintext, but that network metadata is a real correlation
  surface.
- **The checkout page holds the buyer's viewing key in memory** for the duration of the
  payment session. While approved, that key reveals the account's transaction history
  to the page. It is kept in memory only and never persisted.
- **The merchant's watch-only observer** holds the merchant viewing key and can decrypt
  every receipt to the merchant address.
- **The `/merchant` dashboard** exposes invoices and transaction IDs to whoever holds
  the `MERCHANT_ADMIN_TOKEN`.

## 3. What do users have to trust?

- **The operator / merchant (us):** runs the backend that mints invoices and holds the
  invoice DB and the merchant viewing key, and serves the checkout page that handles
  the buyer's viewing key in memory.
- **OpenAI:** receives the merchant's natural-language message to extract amount + memo.
- **Twilio / WhatsApp:** carry the merchant's message and the reply.
- **The hosted lightwalletd + our gRPC-web proxy:** see the buyer's network metadata
  (IP, timing, query pattern).
- **MetaMask + the ChainSafe Zcash Snap:** to isolate the spending key and sign only
  what the buyer approves in the confirmation dialog. This is an **unaudited development
  fork**, not a production distribution.
- **No one** has to trust a buyer-submitted transaction hash: the server marks an
  invoice paid only when its own observer independently matches the memo, amount,
  shielded pool and confirmations.

## 4. What would you fix next? (known gaps, not yet solved)

- **Viewing key on the page.** Spending-key isolation is solid, but the buyer's UFVK is
  exposed to the checkout page during the session. Next: move note-scanning into the
  Snap or a dedicated worker so the page never holds the viewing key.
- **Network privacy.** The light-wallet server sees the buyer's IP and sync pattern.
  Next: route lightwalletd traffic through **Nym** (the network-privacy host partner)
  or Tor.
- **Invoice metadata.** Invoice details sit in plaintext with the operator, OpenAI and
  Twilio. Next: explore on-device/client-side extraction, encrypt invoices at rest, and
  make checkout URLs one-time / expiring.
- **Unaudited Snap.** Replace the development fork with an audited distribution and
  resolve the 10 moderate transitive npm audit findings in the signing path.
- **Orchard settlement.** The observer currently relies on a Sapling viewing key
  (zcashd `z_importviewingkey` does not take a UFVK). Next: an Orchard-capable scanner so
  a merchant using a unified/Orchard-only receiver settles without a Sapling fallback.

Self-custody alone is not a privacy design. These gaps are listed on purpose; naming
them costs nothing, hiding them would.
