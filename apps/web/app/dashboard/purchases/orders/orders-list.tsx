'use client';

import { useMemo, useState } from 'react';
import type { PurchaseOrderRecord } from '@shelfcure/api-client';
import { EmptyState } from '../../../../components/ui/empty-state';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function OrdersList({ orders }: { orders: PurchaseOrderRecord[] }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) => o.supplier_name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q),
    );
  }, [orders, search]);

  return (
    <>
      <div className="mb-4">
        <div className="relative max-w-sm">
          <svg viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search supplier or PO #"
            className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
              <path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          }
          title="No pending purchase orders found"
          description="Go to Stock Summary to create bulk reorder requests."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((order) => (
            <div key={order.id} className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-orange-200 hover:shadow-md">
              <div>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600">
                    {order.status}
                  </span>
                  <span className="font-mono text-xs font-semibold text-zinc-400">
                    PO-{order.id.slice(0, 8).toUpperCase()}
                  </span>
                </div>
                <h3 className="text-lg font-semibold leading-tight text-zinc-900">{order.supplier_name}</h3>
                <div className="mt-1 space-y-0.5 text-xs font-medium text-zinc-500">
                  <p>Items requested: {order.total_items}</p>
                  <p>Ordered on: {fmtDate(order.order_date)}</p>
                </div>
              </div>
              <div className="mt-5 border-t border-zinc-100 pt-4">
                <a
                  href={`/dashboard/purchases/new?poId=${order.id}`}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-50 px-3 py-2.5 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-100"
                >
                  Convert to bill
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
