// A watch-only merchant node decrypts receipts. This service never signs or
// imports spending keys, and never trusts a buyer-provided transaction hash.
export function createVerifier(env, fetcher = fetch) {
  if (!env.ZCASH_RPC_URL) return null;
  async function rpc(method, params = []) {
    const response = await fetcher(env.ZCASH_RPC_URL, {
      method: 'POST', signal: AbortSignal.timeout(12000),
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`${env.ZCASH_RPC_USER}:${env.ZCASH_RPC_PASSWORD}`).toString('base64')}` },
      body: JSON.stringify({ jsonrpc: '1.0', id: 'zpay', method, params }),
    });
    if (!response.ok) throw new Error('Receipt observer unavailable');
    const body = await response.json();
    if (body.error) throw new Error('Receipt observer RPC failed');
    return body.result;
  }
  return async address => {
    const chain = await rpc('getblockchaininfo');
    if (chain.chain !== 'test' || chain.initial_block_download || chain.initialblockdownload) throw new Error('Observer must be synced to testnet');
    return rpc('z_listreceivedbyaddress', [address, 0]);
  };
}
export function matchReceipt(invoice, receipts, minimum = 3) {
  const memoHex = Buffer.from(invoice.payment_memo, 'utf8').toString('hex').padEnd(1024, '0');
  const match = receipts.find(item => ['sapling', 'orchard'].includes(item.pool) && item.memo?.toLowerCase() === memoHex && Number.isSafeInteger(item.amountZat) && item.amountZat >= invoice.amount_zatoshis && /^[a-f0-9]{64}$/i.test(item.txid));
  if (!match) return null;
  return { txid: match.txid.toLowerCase(), confirmations: match.confirmations, status: match.confirmations >= minimum ? 'paid' : 'confirming' };
}
export async function reconcile(store, verify, minimum = 3) {
  if (!verify) return;
  const groups = new Map();
  for (const invoice of store.all()) {
    const list = groups.get(invoice.merchant_z_address) || [];
    list.push(invoice); groups.set(invoice.merchant_z_address, list);
  }
  for (const [address, invoices] of groups) {
    const receipts = await verify(address);
    for (const invoice of invoices) {
      const receipt = matchReceipt(invoice, receipts, minimum);
      if (receipt) store.update({ ...invoice, ...receipt, verified_at: Date.now() });
      // Reorg: retain submission history, withdraw the paid claim.
      else if (['paid', 'confirming'].includes(invoice.status)) store.update({ ...invoice, status: 'submitted', confirmations: 0, verified_at: Date.now() });
    }
  }
}
