'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { Invoice } from '@/lib/zcash';
export default function Merchant() {
  const [token, setToken] = useState('');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/merchant/invoices', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load invoices. Check your merchant access token.');
      setInvoices(await response.json());
    } catch (err) { setError(err instanceof Error ? err.message : 'Request failed.'); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-5xl px-6 py-12"><Link href="/" className="font-black text-[#d0ff59]">Z—PAY / TESTNET</Link><h1 className="my-10 text-5xl font-black uppercase">Your checkout desk.</h1><form onSubmit={e => { e.preventDefault(); void refresh(); }} className="flex flex-wrap gap-4"><label className="flex-1 font-mono text-xs">MERCHANT ACCESS TOKEN<input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} className="mt-2 w-full border-2 p-3" required /></label><button disabled={busy} className="self-end bg-[#d0ff59] px-6 py-3 font-bold text-black">{busy ? 'Loading…' : 'Load / refresh'}</button></form><p className="mt-4 text-xs text-stone-400">The token stays in memory. Create invoices through your WhatsApp agent.</p>{error && <p role="alert" className="mt-6 text-orange-200">{error}</p>}<div className="mt-10 space-y-4">{invoices.map(invoice => <article key={invoice.session_id} className="border-2 border-stone-600 p-6"><div className="flex flex-wrap justify-between gap-4"><h2 className="text-xl font-bold">{invoice.memo}</h2><strong className="text-[#d0ff59]">{invoice.amount} ZEC</strong></div><p className="my-4 font-mono text-sm">{invoice.status?.toUpperCase()} · {invoice.confirmations || 0} confirmations</p><Link className="break-all text-sm underline" href={`/checkout/${invoice.session_id}`}>Open invoice {invoice.session_id}</Link>{invoice.txid && <p className="mt-3 break-all font-mono text-xs text-stone-400">{invoice.txid}</p>}</article>)}</div><p className="mt-8 text-sm text-stone-500">“Paid” means the watch-only observer matched the shielded receipt, invoice memo and amount. A submitted hash alone is not proof of payment.</p></main>;
}
