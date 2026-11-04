'use client';
import { useState } from 'react';
import Link from 'next/link';
import { connectSnap, getShieldedAddress } from '@/lib/zcash';

// Utility page: shows the account's shielded testnet address derived from the
// ChainSafe Zcash Snap. Needed to fund the wallet (faucet) and to use as the
// merchant receiving address for a self-pay demo.
export default function WalletPage() {
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function reveal() {
    setBusy(true); setError(''); setAddress('');
    try {
      const provider = await connectSnap();
      setAddress(await getShieldedAddress(provider));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the address.');
    } finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-3xl px-5 pb-16 sm:px-10">
    <header className="flex items-center justify-between border-b-2 border-stone-700 py-7">
      <Link href="/" className="text-3xl font-black tracking-tighter">Z—PAY<span className="text-[#d0ff59]">.</span></Link>
      <span className="border border-stone-600 px-3 py-2 font-mono text-[10px] tracking-widest sm:text-xs">TESTNET WALLET</span>
    </header>
    <section className="py-12">
      <div className="mb-6 flex items-center gap-3 font-mono text-xs tracking-widest text-[#d0ff59]"><span className="h-2 w-2 bg-[#d0ff59]"/> YOUR SHIELDED ADDRESS</div>
      <h1 className="text-5xl font-black uppercase leading-[0.95] tracking-tighter sm:text-6xl">Fund your<br/><span className="text-[#d0ff59]">testnet wallet.</span></h1>
      <p className="mt-6 max-w-lg leading-relaxed text-stone-400">This reads your Zcash <strong>testnet</strong> address from the ChainSafe Snap (not your <code>0x</code> Ethereum account). Send TAZ here from a faucet, and use the same address as <code>MERCHANT_Z_ADDRESS</code> for a self-pay demo.</p>
      <button onClick={reveal} disabled={busy} className="mt-8 cursor-pointer border-2 border-black bg-[#d0ff59] px-5 py-4 text-base font-black text-black shadow-[4px_4px_0_#f5f5ec] transition hover:bg-[#e0ff94] disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Reading from Snap…' : 'Show my Zcash testnet address'}</button>
      {address && <div className="mt-8 border-2 border-stone-200 bg-[#1b1e18] p-6 shadow-[8px_8px_0_#d0ff59]">
        <p className="font-mono text-xs text-stone-400">UNIFIED TESTNET ADDRESS</p>
        <p className="mt-3 break-all font-mono text-sm leading-relaxed text-[#d0ff59]">{address}</p>
        <button onClick={() => navigator.clipboard?.writeText(address)} className="mt-4 cursor-pointer border border-stone-500 px-3 py-2 font-mono text-xs hover:border-[#d0ff59]">Copy</button>
      </div>}
      {error && <p role="alert" className="mt-6 break-words border border-orange-300 bg-orange-950/30 p-4 text-sm text-orange-200">{error}</p>}
      <ol className="mt-10 space-y-2 border-t border-stone-700 pt-6 font-mono text-xs text-stone-300">
        <li>01 / INSTALL METAMASK FLASK + CONNECT THE LOCAL SNAP</li>
        <li>02 / COPY THIS ADDRESS, GET TAZ FROM A FAUCET OR A MENTOR</li>
        <li>03 / SET IT AS MERCHANT_Z_ADDRESS, THEN PAY FROM /checkout</li>
      </ol>
    </section>
  </main>;
}
