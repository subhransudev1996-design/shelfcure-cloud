'use client';

import { useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@shelfcure/api-client';
import type { PurchaseListRow } from '@shelfcure/api-client';
import { softDeletePurchase } from '@shelfcure/api-client';
import { EmptyState } from '../../../components/ui/empty-state';

type DateFilter = 'all' | 'today' | 'yesterday' | 'last7' | 'month';

const PAYMENT_COLORS: Record<string, string> = {
  paid: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  partial: 'border-blue-200 bg-blue-50 text-blue-700',
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
};

const PAYMENT_LABELS: Record<string, string> = {
  paid: 'Paid',
  partial: 'Partial',
  pending: 'Pending',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function fmtINR(n: number) {
  return `₹${Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function isToday(dateStr: string) {
  const d = new Date(dateStr);
  const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}

function isYesterday(dateStr: string) {
  const d = new Date(dateStr);
  const t = new Date();
  t.setDate(t.getDate() - 1);
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}

function isLast7(dateStr: string) {
  return new Date(dateStr).getTime() >= Date.now() - 7 * 86400000;
}

function isThisMonth(dateStr: string) {
  const d = new Date(dateStr);
  const t = new Date();
  return d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}

function matchesDateFilter(row: PurchaseListRow, f: DateFilter): boolean {
  if (f === 'all') return true;
  if (f === 'today') return isToday(row.bill_date);
  if (f === 'yesterday') return isYesterday(row.bill_date);
  if (f === 'last7') return isLast7(row.bill_date);
  if (f === 'month') return isThisMonth(row.bill_date);
  return true;
}

function detectDuplicates(rows: PurchaseListRow[]): Set<string> {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const r of [...rows].reverse()) {
    const key = `${r.supplier_id}|${r.bill_number.trim().toLowerCase()}`;
    if (seen.has(key)) dupes.add(r.id);
    else seen.add(key);
  }
  return dupes;
}

export function PurchaseList({
  purchases,
  storeId,
}: {
  purchases: PurchaseListRow[];
  storeId: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [deleting, setDeleting] = useState<string | null>(null);

  const dupes = useMemo(() => detectDuplicates(purchases), [purchases]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return purchases.filter((r) => {
      if (!matchesDateFilter(r, dateFilter)) return false;
      if (!q) return true;
      return (
        r.bill_number.toLowerCase().includes(q) ||
        (r.supplier_name ?? '').toLowerCase().includes(q)
      );
    });
  }, [purchases, search, dateFilter]);

  const stats = useMemo(() => {
    const totalSpend = filtered.reduce((s, r) => s + r.total_amount, 0);
    return {
      total: filtered.length,
      paid: filtered.filter((r) => r.payment_status === 'paid').length,
      pending: filtered.filter((r) => r.payment_status !== 'paid').length,
      totalSpend,
      dupeCount: filtered.filter((r) => dupes.has(r.id)).length,
    };
  }, [filtered, dupes]);

  const handleDeleteDupe = useCallback(
    async (p: PurchaseListRow) => {
      if (!window.confirm(`Delete duplicate bill ${p.bill_number}? This will reverse the stock.`)) return;
      setDeleting(p.id);
      try {
        const supabase = createBrowserSupabaseClient();
        await softDeletePurchase(supabase, p.id, storeId);
        router.refresh();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Delete failed';
        alert(msg);
      } finally {
        setDeleting(null);
      }
    },
    [storeId, router],
  );

  const DATE_FILTERS: { value: DateFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'last7', label: 'Last 7 days' },
    { value: 'month', label: 'This month' },
  ];

  return (
    <>
      {/* Stats row */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total bills', value: stats.total, color: 'text-zinc-900' },
          { label: 'Paid', value: stats.paid, color: 'text-emerald-700' },
          { label: 'Credit pending', value: stats.pending, color: 'text-amber-700' },
          stats.dupeCount > 0
            ? { label: 'Duplicates', value: stats.dupeCount, color: 'text-rose-600' }
            : { label: 'Total spend', value: fmtINR(stats.totalSpend), color: 'text-zinc-700' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-zinc-500">{s.label}</p>
            <p className={`mt-1 text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Action bar */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/dashboard/purchases/returns"
          className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-100"
        >
          Returns
        </Link>
        <Link
          href="/dashboard/purchases/challans"
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
        >
          Challans
        </Link>
        <Link
          href="/dashboard/purchases/orders"
          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
        >
          Reorders
        </Link>
        <div className="ml-auto flex gap-2">
          <Link
            href="/dashboard/purchases/new"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Manual entry
          </Link>
          <Link
            href="/dashboard/purchases/scan"
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path d="M5 3h2M3 5v2M5 21h2M3 19v-2M19 3h-2M21 5v2M19 21h-2M21 19v-2M9 7h6M9 12h6M9 17h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Scan Bill
          </Link>
        </div>
      </div>

      {/* Search + date filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <svg viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Supplier or bill no... (Ctrl+F)"
            className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
        <div className="flex gap-1">
          {DATE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setDateFilter(f.value)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                dateFilter === f.value
                  ? 'bg-indigo-600 text-white'
                  : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Card grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
              <path
                d="M3 7h13l3 4h2v7h-2a2 2 0 1 1-4 0H10a2 2 0 1 1-4 0H3V7Z"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          }
          title="No purchases found"
          description="Record your first purchase to load stock into batches."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const isDupe = dupes.has(p.id);
            return (
              <div
                key={p.id}
                className={`flex flex-col justify-between rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md ${
                  isDupe ? 'border-rose-200 hover:border-rose-300' : 'border-zinc-200 hover:border-indigo-200'
                }`}
              >
                <div>
                  <div className="mb-3 flex flex-wrap items-start gap-2">
                    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${PAYMENT_COLORS[p.payment_status] ?? 'border-zinc-200 bg-zinc-100 text-zinc-500'}`}>
                      {PAYMENT_LABELS[p.payment_status] ?? p.payment_status}
                    </span>
                    {p.is_ai_scanned && (
                      <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                        AI Scanned
                      </span>
                    )}
                    {p.return_status === 'fully_returned' && (
                      <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-600">
                        Returned
                      </span>
                    )}
                    {p.return_status === 'partially_returned' && (
                      <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-600">
                        Partial Return
                      </span>
                    )}
                    {isDupe && (
                      <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-600">
                        Duplicate
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-semibold leading-tight text-zinc-900">
                    {p.supplier_name ?? '—'}
                  </h3>
                  <p className="font-mono text-xs font-semibold text-zinc-400">{p.bill_number}</p>
                  <p className="mt-1 text-xs text-zinc-500">{fmtDate(p.bill_date)}</p>
                  <p className="mt-2 font-mono text-lg font-bold text-zinc-900">{fmtINR(p.total_amount)}</p>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3">
                  <Link
                    href={`/dashboard/purchases/${p.id}`}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    View details →
                  </Link>
                  {isDupe && (
                    <button
                      onClick={() => handleDeleteDupe(p)}
                      disabled={deleting === p.id}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-100 disabled:opacity-50"
                    >
                      {deleting === p.id ? 'Deleting…' : 'Delete'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
