import { VerifyClient } from '@/components/VerifyClient';

export const metadata = { title: 'Verify a fill' };

export default function VerifyPage() {
  return (
    <div className="mx-auto w-[min(1180px,calc(100%-24px))] py-10">
      <h1 className="h2">Verify a fill</h1>
      <p className="mt-3 max-w-2xl text-graphite">The check recomputes a fill from chain logs and an <code className="font-mono text-sm">eth_call</code> at that block. No vendor API and no model is involved. The same logic ships as a command line tool.</p>
      <VerifyClient />
    </div>
  );
}
