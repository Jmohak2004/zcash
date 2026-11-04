# Next step — the 30 days after

Z-Pay works end to end on testnet today. The next month is about closing the privacy
gaps we named and making it something a real merchant could actually run.

## The ~10-hour Ecosystem-Prize milestone (pick one)

**Preferred: keep the buyer's viewing key off the page.** Move shielded-note scanning
out of the checkout page and into the Snap / a dedicated worker, so the page never
holds the UFVK — only the Snap ever sees key material. This is the single biggest
privacy improvement and is self-contained. Deliverable: a public testnet payment where
the browser devtools show no viewing key in page scope.

**Alternative: a public hosted testnet demo.** HTTPS checkout + a hardened gRPC-web
proxy + a documented Snap-distribution path, so a judge or merchant can try it from a
URL instead of a local build. Deliverable: a live link that takes a real testnet
payment.

## The rest of the 30 days

1. **Network privacy** — route lightwalletd traffic through Nym or Tor so the
   light-wallet server no longer sees the buyer's IP and sync pattern.
2. **Orchard settlement** — add an Orchard-capable viewing-key scanner to the observer so
   a unified/Orchard-only merchant receiver settles without a Sapling fallback.
3. **Invoice-metadata hardening** — one-time/expiring checkout URLs, invoices encrypted
   at rest, and a look at on-device extraction to cut OpenAI/Twilio out of the plaintext
   path.
4. **Snap hardening** — track an audited Snap distribution and clear the moderate npm
   audit findings in the signing path.
5. **Multi-merchant** — per-merchant config and a transactional shared datastore + job
   queue in place of single-process SQLite, so more than one merchant can run on it.

## Where it goes

A merchant taking shielded ZEC should be as easy as sharing a payment link — no wallet
app to install, no POS hardware, keys never on a server. The testnet build already
proves the payment path; the month after is about making the privacy end-to-end and
the operation something a shop or freelancer can run unattended.
