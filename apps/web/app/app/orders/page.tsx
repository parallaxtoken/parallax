import { Suspense } from 'react';
import { OrdersClient } from '@/components/OrdersClient';

export const metadata = { title: 'Standing orders' };

export default function OrdersPage() {
  return (
    <div className="mx-auto w-[min(1180px,calc(100%-24px))] py-10">
      <h1 className="h2">Standing orders</h1>
      <p className="mt-3 max-w-2xl text-graphite">Each order is a limit in shares that you signed once. The keeper watches it at every hour; the chain refuses any fill below your floor.</p>
      <div className="mt-8">
        <Suspense fallback={<div className="skeleton h-40 w-full" />}>
          <OrdersClient />
        </Suspense>
      </div>
    </div>
  );
}
