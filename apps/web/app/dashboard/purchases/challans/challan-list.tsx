'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ChallanRecord } from '@shelfcure/api-client';
import { EmptyState } from '../../../../components/ui/empty-state';

type Status = 'all' | 'pending' | 'accepted' | 'returned';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  partially_accepted: 'Partial',
  returned: 'Returned',
  expired: 'Expired',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'border-amber-100 bg-amber-50 text-amber-600',
  accepted: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  partially_accepted: 'border-blue-100 bg-blue-50 text-blue-700',
  returned: 'border-red-100 bg-red-50 text-red-600',
  expired: 'border-zinc-100 bg-zinc-50 text-zinc-500',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysLeft(iso: string): number {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function matchesStatusFilter(status: string, filter: Status): boolean {
  if (filter === 'all') return true;
  if (filter === 'accepted') return status === 'accepted' || status === 'partially_accepted';
  return status === filter;
}

export function ChallanList({ challans, storeId: _storeId }: { challans: ChallanRecord[]; storeId: string }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Status>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return challans.filter((c) => {
      if (!matchesStatusFilter(c.status, statusFilter)) return false;
      if (!q) return true;
      return (
        c.challan_number.toLowerCase().includes(q) ||
        (c.supplier_name ?? '').toLowerCase().includes(q)
      );
    });
  }, [challans, search, statusFilter]);

  const stats = useMemo(() => {
    const pending = challans.filter((c) => c.status === 'pending');
    return {
      pending: pending.length,
      accepted: challans.filter((c) => c.status === 'accepted' || c.status === 'partially_accepted').length,
      returned: challans.filter((c) => c.status === 'returned').length,
      pendingQty: pending.reduce((s, c) => s + c.total_quantity, 0),
    };
  }, [challans]);

  const FILTERS: { value: Status; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'accepted', label: 'Accepted' },
    { value: 'returned', label: 'Returned' },
  ];

  return (
    <>
      {/* Stats row */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Pending review', value: stats.pending, color: 'text-amber-600' },
          { label: 'Accepted', value: stats.accepted, color: 'text-emerald-700' },
          { label: 'Returned', value: stats.returned, color: 'text-red-600' },
          { label: 'Pending items', value: stats.pendingQty, color: 'text-zinc-700' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-zinc-500">{s.label}</p>
            <p className={`mt-1 text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search + filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <svg viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search supplier or challan #"
            className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          />
        </div>
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === f.value
                  ? 'bg-amber-600 text-white'
                  : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Link
          href="/dashboard/purchases/challans/new"
          className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-700"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          New Challan
        </Link>
      </div>

      {/* Card grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
              <path
                d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          }
          title="No challans found"
          description="Record goods received on approval to create a delivery challan."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const days = c.expected_return_date ? daysLeft(c.expected_return_date) : null;
            const urgent = days !== null && days <= 3 && c.status === 'pending';
            return (
              <a
                key={c.id}
                href={`/dashboard/purchases/challans/${c.id}`}
                className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-amber-200 hover:shadow-md"
              >
                <div>
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[c.status] ?? 'border-zinc-200 bg-zinc-100 text-zinc-500'}`}>
                      {STATUS_LABELS[c.status] ?? c.status}
                    </span>
                    <div className="flex flex-col items-end gap-1">
                      {urgent && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
                          ⏰ {days}d left
                        </span>
                      )}
                      {c.linked_purchase_id && (
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                          Converted
                        </span>
                      )}
                    </div>
                  </div>
                  <h3 className="text-base font-semibold leading-tight text-zinc-900">{c.supplier_name ?? '—'}</h3>
                  <p className="font-mono text-xs font-semibold text-zinc-400">CHN-{c.challan_number}</p>
                  <div className="mt-1 space-y-0.5 text-xs font-medium text-zinc-500">
                    <p>{c.total_items} items · {c.total_quantity} units</p>
                    <p>Challan date: {fmtDate(c.challan_date)}</p>
                    <p>
                      {c.expected_return_date
                        ? `Return by: ${fmtDate(c.expected_return_date)}`
                        : 'No return deadline'}
                    </p>
                  </div>
                </div>
                <div className="mt-4 border-t border-zinc-100 pt-3">
                  <span className="text-xs font-medium text-amber-600">View details →</span>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </>
  );
}
