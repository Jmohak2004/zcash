'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { connectSnap, payWithZcash, cancelPreparedAttempt, type Invoice } from '@/lib/zcash';

export default function Checkout() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [birthday, setBirthday] = useState('0');
  const paying = useRef(false);
  const demo = id === 'demo';
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setStatus(''); setInvoice(null);
    if (id === 'demo') {
      setInvoice({ session_id: 'demo', amount: 0.5, memo: 'Website Design', merchant_z_address: 'Preview only — no payment address configured' });
      setLoading(false);
      return () => controller.abort();
    }
    async function load() {
      try {
        const response = await fetch(`/api/session/${encodeURIComponent(id)}`, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(response.status === 404 ? 'This invoice was not found or has expired.' : 'Could not load this checkout. Please try again.');
        setInvoice(await response.json());
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to load invoice.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    const timer = setInterval(() => { void load(); }, 10000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [id]);
  async function pay() {
    if (!invoice || demo || paying.current || invoice.status !== 'open') return;
    paying.current = true; setBusy(true); setError(''); setStatus('Approve the Zcash Snap connection in MetaMask…');
    try {
      const provider = await connectSnap();
      setStatus('Preparing shielded payment…');
      const txid = await payWithZcash(invoice, provider, Number(birthday), setStatus);
      setStatus(`Transaction submitted: ${txid}. Awaiting merchant verification.`);
      setInvoice({ ...invoice, status: 'submitted', txid });
    } catch (err) { setStatus(''); setError(err instanceof Error ? err.message : 'Payment could not be started.'); }
    finally { paying.current = false; setBusy(false); }
  }
  return <main className="mx-auto max-w-6xl px-5 pb-12 sm:px-10">
    <header className="flex items-center justify-between border-b-2 border-stone-700 py-7"><Link href="/" className="text-3xl font-black tracking-tighter">Z—PAY<span className="text-[#d0ff59]">.</span></Link><span className="border border-stone-600 px-3 py-2 font-mono text-[10px] tracking-widest sm:text-xs">POWERED BY ZCASH</span></header>
    <div className="grid gap-12 py-12 lg:grid-cols-[1fr_1.05fr] lg:gap-20 lg:py-20">
      <section><div className="mb-7 flex items-center gap-3 font-mono text-xs tracking-widest text-[#d0ff59]"><span className="h-2 w-2 bg-[#d0ff59]"/> SHIELDED CHECKOUT</div><h1 className="text-6xl font-black uppercase leading-[0.95] tracking-tighter sm:text-7xl">Good work.<br/>Private<br/><span className="text-[#d0ff59]">payments.</span></h1><p className="mt-7 max-w-sm leading-relaxed text-stone-400">Pay your merchant in ZEC through MetaMask. Keep your spending keys in your wallet.</p><div className="mt-10 space-y-4 border-t border-stone-700 pt-6 font-mono text-xs text-stone-300"><p>01 / REVIEW YOUR INVOICE</p><p>02 / CONNECT METAMASK + ZCASH SNAP</p><p>03 / APPROVE A SHIELDED PAYMENT</p></div><p className="mt-10 max-w-sm text-xs leading-relaxed text-stone-500">Invoice details are visible to the merchant and anyone with this link. WhatsApp and AI extraction process the merchant’s message.</p></section>
      <section aria-label="Invoice" className="self-start border-2 border-stone-200 bg-[#1b1e18] shadow-[8px_8px_0_#d0ff59]">
        <div className="flex justify-between border-b-2 border-stone-200 px-6 py-4 font-mono text-xs"><span>PAYMENT REQUEST</span><span className="text-[#d0ff59]">{demo ? 'PREVIEW' : 'TESTNET ONLY'}</span></div>
        <div className="p-6 sm:p-8">
          {loading && <p role="status" className="py-16 font-mono">Loading invoice…</p>}
          {invoice && <><p className="font-mono text-xs text-stone-400">AMOUNT DUE</p><p className="mt-3 break-all text-6xl font-black tracking-tighter">{invoice.amount}<span className="ml-3 text-xl text-[#d0ff59]">ZEC</span></p><p className="mt-3 text-xs text-stone-500">Network fee calculated when preparing the transaction.</p><dl className="my-8 space-y-6 border-y border-stone-700 py-6"><div><dt className="font-mono text-xs text-stone-400">FOR</dt><dd className="mt-2 break-words text-xl font-bold">{invoice.memo}</dd></div><div><dt className="font-mono text-xs text-stone-400">MERCHANT SHIELDED ADDRESS</dt><dd className="mt-2 break-all font-mono text-xs leading-relaxed">{invoice.merchant_z_address}</dd></div><div><dt className="font-mono text-xs text-stone-400">INVOICE ID</dt><dd className="mt-2 break-all font-mono text-xs">{invoice.session_id}</dd></div></dl>{!demo && <div className="mb-6 space-y-4"><label className="block font-mono text-xs">WALLET BIRTHDAY BLOCK<input type="number" min="0" step="1" value={birthday} disabled={busy} onChange={e => setBirthday(e.target.value)} className="mt-2 w-full border border-stone-500 bg-black p-3 text-base"/></label><p className="text-xs text-stone-400">Use a block before you first received funds. Zero scans full history and can take a long time.</p><p className="font-mono text-xs text-[#d0ff59]">STATUS: {invoice.status?.toUpperCase()} · {invoice.confirmations || 0} CONFIRMATIONS</p>{invoice.txid && <p className="break-all font-mono text-xs">TX: {invoice.txid}</p>}{!invoice.verification_enabled && <p className="text-xs text-orange-200">Merchant receipt observer is not configured. Payments cannot be independently marked paid yet.</p>}</div>}{invoice.status === 'preparing' && !busy && <button className="mb-5 text-sm underline" onClick={async () => { try { await cancelPreparedAttempt(id); setInvoice({ ...invoice, status: 'open' }); } catch (err) { setError(err instanceof Error ? err.message : 'Could not cancel attempt'); } }}>Cancel unfinished preparation from this tab</button>}<button onClick={pay} disabled={busy || demo || invoice.status !== 'open'} className="w-full cursor-pointer border-2 border-black bg-[#d0ff59] px-4 py-5 text-base font-black text-black shadow-[4px_4px_0_#f5f5ec] transition hover:bg-[#e0ff94] disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Payment in progress…' : invoice.status === 'paid' ? 'Payment confirmed ✓' : !demo && invoice.status !== 'open' ? 'Payment awaiting verification' : 'Pay Privately with MetaMask'} <span aria-hidden>↗</span></button><p className="mt-5 text-center font-mono text-[10px] text-stone-400">{demo ? 'DEMO INVOICE · PAYMENTS DISABLED' : 'TESTNET ZEC ONLY · NO REAL MONETARY VALUE'}</p></>}
          {error && <p role="alert" className="mt-6 break-words border border-orange-300 bg-orange-950/30 p-4 text-sm text-orange-200">{error}</p>}
          {status && <p role="status" className="mt-6 break-all text-sm text-[#d0ff59]">{status}</p>}
        </div>
      </section>
    </div><footer className="flex flex-wrap justify-between gap-4 border-t border-stone-700 pt-6 font-mono text-[10px] tracking-widest text-stone-500"><span>BUILT FOR THE FREE SOCIETY</span><span>YOUR KEYS. YOUR BUSINESS.</span></footer>
  </main>;
}
