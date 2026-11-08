import { HoldingsClient } from '@/components/HoldingsClient';

export const metadata = { title: 'Holdings in shares' };

export default function HoldingsPage() {
  return (
    <div className="mx-auto w-[min(1180px,calc(100%-24px))] py-10">
      <h1 className="h2">Holdings, in shares</h1>
      <p className="mt-3 max-w-2xl text-graphite">Your balances across every wrapper, converted with the unit read from each issuer. A raw token count undercounts what you own whenever a dividend has been reinvested.</p>
      <div className="mt-8"><HoldingsClient /></div>
    </div>
  );
}
