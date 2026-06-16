'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SaleListRow } from '@shelfcure/api-client';

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function fmtINR(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── tone maps ────────────────────────────────────────────────────────────────

const STATUS_TONE: Record<string, string> = {
  paid:    'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  pending: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  partial: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
};

const PAYMENT_ICON: Record<string, { icon: string; cls: string; label: string }> = {
  cash:   { icon: '₹', cls: 'text-green-600',  label: 'Cash' },
  upi:    { icon: '⊙', cls: 'text-blue-600',   label: 'UPI' },
  card:   { icon: '▣', cls: 'text-purple-600', label: 'Card' },
  credit: { icon: '✦', cls: 'text-amber-600',  label: 'Credit' },
};

// ─── props ────────────────────────────────────────────────────────────────────

interface Props {
  rows: SaleListRow[];
  from: string;
  to: string;
  page: number;
  perPage: number;
  storeId: string;
}

export function SalesHistoryClient({ rows, from, to, page, perPage, storeId: _storeId }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [fromDate, setFromDate] = useState(from);
  const [toDate, setToDate] = useState(to);
  const [selectedIdx, setSelectedIdx] = useState<number>(-1);
  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  // Client-side filter
  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (r) =>
        r.bill_number.toLowerCase().includes(q) ||
        r.customer_name.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const totalValue = useMemo(
    () => filtered.reduce((s, r) => s + Number(r.total_amount), 0),
    [filtered],
  );

  // Navigate to a new date range (server re-render)
  const applyDateRange = useCallback(
    (f: string, t: string) => {
      router.push(`/dashboard/sales?from=${f}&to=${t}&page=1`);
    },
    [router],
  );

  const gotoPage = useCallback(
    (p: number) => {
      router.push(`/dashboard/sales?from=${fromDate}&to=${toDate}&page=${p}`);
    },
    [router, fromDate, toDate],
  );

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if ((e.ctrlKey && e.key === 'f') || e.key === 'Insert') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }

      if (e.key === 'Escape') {
        if (query) { setQuery(''); return; }
        setSelectedIdx(-1);
        return;
      }

      if (inInput) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && selectedIdx >= 0) {
        const row = filtered[selectedIdx];
        if (row) router.push(`/dashboard/sales/${row.id}`);
      } else if (e.key === 'ArrowLeft' && page > 1) {
        gotoPage(page - 1);
      } else if (e.key === 'ArrowRight' && rows.length === perPage) {
        gotoPage(page + 1);
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [query, selectedIdx, filtered, page, rows.length, perPage, router, gotoPage]);

  // Scroll selected row into view
  useEffect(() => {
    if (selectedIdx >= 0) rowRefs.current[selectedIdx]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-2 text-xl font-bold text-zinc-900">Sales History</h1>

        {/* Search */}
        <div className="relative min-w-48 flex-1">
          <svg viewBox="0 0 24 24" fill="none" className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400">
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
            <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            placeholder="Bill no. or customer... (Ctrl+F)"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIdx(-1); }}
            className="w-full rounded-lg border border-zinc-200 bg-white py-1.5 pl-8 pr-3 text-sm text-zinc-800 placeholder-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {/* Date range */}
        <div className="flex items-center gap-1.5 text-sm">
          <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 text-zinc-400">
            <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.75" />
            <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); applyDateRange(e.target.value, toDate); }}
            className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs text-zinc-700 focus:border-indigo-400 focus:outline-none"
          />
          <span className="text-zinc-400">to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); applyDateRange(fromDate, e.target.value); }}
            className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs text-zinc-700 focus:border-indigo-400 focus:outline-none"
          />
        </div>

        {/* Summary */}
        <div className="ml-auto flex items-baseline gap-1.5 text-sm text-zinc-500">
          <span className="font-medium text-zinc-700">{filtered.length} bills</span>
          <span>·</span>
          <span className="font-bold text-zinc-900">{fmtINR(totalValue)}</span>
        </div>

        <Link
          href="/dashboard/sales/new"
          className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
          </svg>
          New Sale
        </Link>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-200 bg-white py-20 shadow-sm">
          <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 text-zinc-300">
            <path d="M5 7h14l-1.5 11a2 2 0 0 1-2 1.8H8.5a2 2 0 0 1-2-1.8L5 7Z M9 7V5a3 3 0 1 1 6 0v2"
              stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          <p className="mt-3 text-sm font-medium text-zinc-500">No sales found</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3">Bill #</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3 text-center">Items</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((s, i) => {
                const pay = PAYMENT_ICON[s.payment_method] ?? { icon: '·', cls: 'text-zinc-500', label: s.payment_method };
                const isSelected = i === selectedIdx;
                return (
                  <tr
                    key={s.id}
                    ref={(el) => { rowRefs.current[i] = el; }}
                    onClick={() => { setSelectedIdx(i); router.push(`/dashboard/sales/${s.id}`); }}
                    className={`cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50 ring-inset ring-1 ring-indigo-200' : 'hover:bg-zinc-50/60'}`}
                  >
                    {/* Bill # + badges */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-mono text-xs font-semibold text-indigo-700">
                          {s.bill_number}
                        </span>
                        {s.source === 'mobile' && (
                          <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-700">
                            Mobile
                          </span>
                        )}
                        {s.is_fully_returned ? (
                          <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-700">
                            Returned
                          </span>
                        ) : s.is_returned ? (
                          <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">
                            Partial
                          </span>
                        ) : null}
                        {s.is_modified && (
                          <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-teal-700">
                            Modified
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Date */}
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-600">
                      {fmtDateTime(s.created_at)}
                    </td>

                    {/* Customer */}
                    <td className="px-4 py-3 text-zinc-800">{s.customer_name}</td>

                    {/* Items */}
                    <td className="px-4 py-3 text-center text-zinc-500">{s.item_count}</td>

                    {/* Payment method */}
                    <td className="px-4 py-3">
                      <span className={`font-medium ${pay.cls}`}>
                        {pay.icon} {pay.label}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_TONE[s.payment_status] ?? 'bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200'}`}>
                        {s.payment_status}
                      </span>
                    </td>

                    {/* Amount */}
                    <td className="px-4 py-3 text-right font-mono font-semibold text-zinc-900">
                      {fmtINR(s.total_amount)}
                    </td>

                    {/* Chevron */}
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm ${isSelected ? 'text-indigo-500' : 'text-zinc-400'}`}>→</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {(page > 1 || rows.length === perPage) && (
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>
            Showing {(page - 1) * perPage + 1}–{(page - 1) * perPage + rows.length}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => gotoPage(page - 1)}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-40"
            >
              ← Prev
            </button>
            <button
              disabled={rows.length < perPage}
              onClick={() => gotoPage(page + 1)}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Keyboard hint strip */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-400">
        {[
          ['Ctrl+F', 'Search'],
          ['↑↓', 'Navigate'],
          ['Enter', 'Open'],
          ['←→', 'Prev/Next page'],
          ['Esc', 'Clear search'],
        ].map(([key, desc]) => (
          <span key={key}>
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 font-mono">{key}</kbd>{' '}
            {desc}
          </span>
        ))}
      </div>
    </div>
  );
}
