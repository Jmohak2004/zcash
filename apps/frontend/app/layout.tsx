import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Z-Pay — Private by design', description: 'A headless Zcash checkout powered by MetaMask.', robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className="min-h-screen font-sans antialiased">{children}</body></html>;
}
