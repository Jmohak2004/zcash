import { fromHex, loadSdk, toHex } from './sdk';
export type Invoice = {
  session_id: string; amount: number; amount_zatoshis?: number; memo: string; payment_memo?: string;
  merchant_z_address: string; network?: string; status?: string; txid?: string;
  confirmations?: number; verification_enabled?: boolean; expires_at?: number;
};
type Provider = { isMetaMask?: boolean; providers?: Provider[]; request(args: { method: string; params?: unknown }): Promise<unknown> };
declare global { interface Window { ethereum?: Provider } }
export const SNAP_ID = process.env.NEXT_PUBLIC_ZCASH_SNAP_ID || 'local:http://localhost:8080';
async function invoke(provider: Provider, method: string, params?: unknown) {
  return provider.request({ method: 'wallet_invokeSnap', params: { snapId: SNAP_ID, request: { method, ...(params ? { params } : {}) } } });
}
export async function connectSnap() {
  if (!SNAP_ID.startsWith('local:')) throw new Error('This checkout requires the Z-Pay testnet development Snap.');
  const injected = window.ethereum;
  const provider = injected?.providers?.find(p => p.isMetaMask) || injected;
  if (!provider?.isMetaMask) throw new Error('Use a desktop browser with MetaMask Flask and the local testnet Snap.');
  await provider.request({ method: 'wallet_requestSnaps', params: { [SNAP_ID]: {} } });
  const result = await invoke(provider, 'zpay_getNetwork') as { network?: string; adapter?: string };
  if (result?.network !== 'test' || result.adapter !== 'zpay-v1') throw new Error('The connected Snap is not the Z-Pay testnet build.');
  return provider;
}
export function paymentRequest(invoice: Invoice) {
  const units = invoice.amount_zatoshis ?? Math.round(invoice.amount * 1e8);
  if (!Number.isSafeInteger(units) || units <= 0 || units > 2100000000000000) throw new Error('Invalid invoice amount.');
  const memoBytes = new TextEncoder().encode(invoice.payment_memo || invoice.memo);
  if (!memoBytes.length || memoBytes.length > 512) throw new Error('Memo must contain 1–512 UTF-8 bytes.');
  const amount = (units / 1e8).toFixed(8).replace(/\.?0+$/, '');
  const memo = btoa(String.fromCharCode(...memoBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { amountZatoshis: BigInt(units), memoBytes, uri: `zcash:${invoice.merchant_z_address}?amount=${amount}&memo=${memo}` };
}
async function transition(id: string, action: string, body: object = {}) {
  const response = await fetch(`/api/session/${id}/attempt${action ? `/${action}` : ''}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not update payment attempt.');
  return data;
}
export async function payWithZcash(invoice: Invoice, provider: Provider, birthday: number, progress: (message: string) => void): Promise<string> {
  if (invoice.network !== 'test') throw new Error('Only testnet invoices are supported.');
  if (!Number.isSafeInteger(birthday) || birthday < 0 || birthday > 0xffffffff) throw new Error('Enter a valid wallet birthday block.');
  const endpoint = process.env.NEXT_PUBLIC_LIGHTWALLETD_URL;
  if (!endpoint) throw new Error('Set a testnet gRPC-web lightwalletd endpoint before paying.');
  const request = paymentRequest(invoice);
  const sdk = await loadSdk();
  // Keys are held by the ChainSafe Snap. Only viewing material enters this page.
  progress('Approve read-only access to your testnet account in MetaMask…');
  const viewingKey = await invoke(provider, 'getViewingKey');
  const fingerprint = await invoke(provider, 'getSeedFingerprint');
  if (typeof viewingKey !== 'string' || typeof fingerprint !== 'string') throw new Error('Invalid account response from Snap.');
  const wallet = new sdk.WebWallet('test', endpoint, 1, 3);
  const account = await wallet.create_account_ufvk('Z-Pay testnet', viewingKey, sdk.SeedFingerprint.from_bytes(fromHex(fingerprint)), 0, birthday);
  progress('Scanning shielded notes. First sync may take several minutes…');
  await wallet.sync();
  const { token } = await transition(invoice.session_id, '');

  // Durable before side effects. Lost responses do not make it safe to re-pay.
  let broadcasting = false;
  try {
    sessionStorage.setItem(`zpay:attempt:${invoice.session_id}`, token);
    progress('Creating your shielded transaction and invoice memo…');
    // The pinned Rust patch passes memoBytes through ZIP-321 Payment::new.
    // The Rust proposer decodes the address, enforces network/receiver rules,
    // selects notes, and applies ZIP-317 fees. Never use EVM eth_sendTransaction.
    const pczt = await wallet.pczt_create(account, invoice.merchant_z_address, request.amountZatoshis, request.memoBytes);
    progress('Review and approve this testnet payment in MetaMask…');
    const signedHex = await invoke(provider, 'signPczt', {
      pcztHexTring: toHex(pczt.serialize()), // Upstream API spelling is intentional.
      signDetails: { recipient: invoice.merchant_z_address, amount: `${invoice.amount} TESTNET ZEC` },
    });
    if (typeof signedHex !== 'string') throw new Error('Signing was cancelled or returned invalid data.');
    progress('Generating the zero-knowledge proof…');
    await new Promise(resolve => setTimeout(resolve, 0));
    const proved = await wallet.pczt_prove(sdk.Pczt.from_bytes(fromHex(signedHex)));
    // Mark ambiguous before sending; neither an HTTP timeout nor a lost tab
    // proves that the transaction was not accepted by lightwalletd.
    broadcasting = true;
    await transition(invoice.session_id, 'broadcast', { token });
    progress('Broadcasting to the testnet lightwalletd proxy…');
    const txid = await wallet.pczt_send(proved);
    if (!/^[0-9a-f]{64}$/i.test(txid)) throw new Error('Broadcast returned an invalid transaction ID.');
    // Preserve only the receipt; never persist viewing or spending keys here.
    try { localStorage.setItem(`zpay:receipt:${invoice.session_id}`, JSON.stringify({ txid })); } catch { /* Receipt can still be recorded by the server. */ }
    await transition(invoice.session_id, 'submitted', { token, txid });
    return txid;
  } catch (error) {
    if (!broadcasting) await transition(invoice.session_id, 'cancel', { token }).catch(() => undefined);
    if (broadcasting) throw new Error('Broadcast outcome requires verification. Do not pay again. The merchant observer will reconcile the invoice.');
    throw error instanceof Error ? error : new Error(String(error));
  }
}

export async function cancelPreparedAttempt(id: string) {
  const token = sessionStorage.getItem(`zpay:attempt:${id}`);
  if (!token) throw new Error('This browser tab does not own the payment attempt.');
  await transition(id, 'cancel', { token });
  sessionStorage.removeItem(`zpay:attempt:${id}`);
}
