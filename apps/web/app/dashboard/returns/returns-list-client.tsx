'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SaleReturnListRow } from '@shelfcure/api-client';

function fmtINR(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

const REFUND_CHIP: Record<string, { cls: string; label: string }> = {
  cash:        { cls: 'bg-emerald-100 text-emerald-700', label: 'CASH' },
  upi:         { cls: 'bg-blue-100 text-blue-700',       label: 'UPI' },
  card:        { cls: 'bg-purple-100 text-purple-700',   label: 'CARD' },
  credit:      { cls: 'bg-amber-100 text-amber-700',     label: 'CREDIT' },
  credit_note: { cls: 'bg-teal-100 text-teal-700',       label: 'CREDIT NOTE' },
  neft:        { cls: 'bg-indigo-100 text-indigo-700',   label: 'NEFT' },
  adjustment:  { cls: 'bg-zinc-100 text-zinc-700',       label: 'ADJUSTMENT' },
};

type DatePreset = 'today' | 'yesterday' | 'week' | 'month' | 'all';

function presetRange(p: DatePreset): { from?: string; to?: string } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const today = iso(now);
  if (p === 'today') return { from: today, to: today };
  if (p === 'yesterday') {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    const yiso = iso(y); return { from: yiso, to: yiso };
  }
  if (p === 'week') {
    const w = new Date(now); w.setDate(w.getDate() - 6);
    return { from: iso(w), to: today };
  }
  if (p === 'month') {
    const m = new Date(now); m.setDate(1);
    return { from: iso(m), to: today };
  }
  return {};
}

interface Props {
  rows: SaleReturnListRow[];
  from?: string;
  to?: string;
  page: number;
  perPage: number;
}

export function ReturnsListClient({ rows, from, to, page, perPage }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [preset, setPreset] = useState<DatePreset>('all');
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const searchRef = useRef<HTMLInputElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (r) =>
        r.return_number.toLowerCase().includes(q) ||
        r.bill_number.toLowerCase().includes(q) ||
        r.customer_name.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const applyPreset = useCallback(
    (p: DatePreset) => {
      setPreset(p);
      const { from: f, to: t } = presetRange(p);
      const params = new URLSearchParams();
      if (f) params.set('from', f);
      if (t) params.set('to', t);
      params.set('page', '1');
      router.push(`/dashboard/returns?${params.toString()}`);
    },
    [router],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA';

      if ((e.ctrlKey && e.key === 'f') || e.key === '/' || e.key === 'Insert') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (e.key === 'n' && !inInput) {
        router.push('/dashboard/returns/new');
        return;
      }
      if (e.key === 'Escape') {
        if (query) { setQuery(''); return; }
        setSelectedIdx(-1); return;
      }
      if (inInput) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)); }
      else if (e.key === 'Enter' && selectedIdx >= 0) {
        const r = filtered[selectedIdx];
        if (r) router.push(`/dashboard/returns/${r.id}`);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [query, selectedIdx, filtered, router]);

  useEffect(() => {
    if (selectedIdx >= 0) cardRefs.current[selectedIdx]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  const PRESETS: { id: DatePreset; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'week', label: 'This Week' },
    { id: 'month', label: 'This Month' },
    { id: 'all', label: 'All' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Sales</p>
          <div className="mt-0.5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-indigo-600">
                <path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="text-3xl font-black text-zinc-900">Sales Returns</h1>
          </div>
          <p className="mt-1 text-sm text-zinc-500">Manage and track customer returns and refunds.</p>
        </div>
        <Link
          href="/dashboard/returns/new"
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
          </svg>
          New Return
        </Link>
      </div>

      {/* Date preset pills */}
      <div className="inline-flex gap-1 rounded-xl bg-zinc-100 p-1">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => applyPreset(p.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              preset === p.id
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <svg viewBox="0 0 24 24" fill="none" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400">
          <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
          <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          ref={searchRef}
          type="text"
          placeholder="Search by return number, bill number or customer... (Ctrl+F)"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedIdx(-1); }}
          className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-sm text-zinc-800 placeholder-zinc-400 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      {/* Keyboard hints */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-400">
        {[['Ctrl+F', 'Search'], ['↑↓', 'Navigate'], ['Enter', 'Open'], ['n', 'New return'], ['Esc', 'Clear']].map(([k, d]) => (
          <span key={k}><kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 font-mono">{k}</kbd> {d}</span>
        ))}
      </div>

      {/* Card list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50 py-20">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100">
            <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-zinc-400">
              <path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="mt-3 text-sm font-semibold text-zinc-700">No returns found</p>
          <p className="text-xs text-zinc-400">Try a different date range or search query.</p>
          {(query || preset !== 'all' || from || to) && (
            <button
              onClick={() => { setQuery(''); setPreset('all'); router.push('/dashboard/returns'); }}
              className="mt-3 rounded-xl border border-zinc-300 px-4 py-1.5 text-xs font-medium hover:bg-zinc-50"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r, i) => {
            const chip = REFUND_CHIP[r.refund_method] ?? { cls: 'bg-zinc-100 text-zinc-700', label: r.refund_method.toUpperCase() };
            const isSelected = i === selectedIdx;
            return (
              <div
                key={r.id}
                ref={(el) => { cardRefs.current[i] = el; }}
                onClick={() => { setSelectedIdx(i); router.push(`/dashboard/returns/${r.id}`); }}
                className={`group flex cursor-pointer items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm transition-all hover:shadow-md ${isSelected ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-zinc-200'}`}
              >
                {/* Block 1 — Identity */}
                <div className="flex min-w-0 flex-[2] items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50">
                    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-orange-500">
                      <path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-zinc-900">{r.return_number}</span>
                      <span className="rounded-lg border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] text-zinc-500">
                        Inv: {r.bill_number}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-400">
                      <span>📅</span>
                      <span>{fmtDateTime(r.created_at)}</span>
                      <span>·</span>
                      <span>{r.item_count} items</span>
                    </div>
                  </div>
                </div>

                {/* Block 2 — Customer */}
                <div className="hidden flex-1 md:block">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">Customer</div>
                  <div className="truncate font-medium text-zinc-800">{r.customer_name}</div>
                </div>

                {/* Block 3 — Amount + refund method */}
                <div className="shrink-0 text-right">
                  <div className="font-mono text-lg font-black text-zinc-900">{fmtINR(r.total_amount)}</div>
                  <span className={`mt-0.5 inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-bold ${chip.cls}`}>
                    {chip.label}
                  </span>
                </div>

                {/* Block 4 — Chevron */}
                <div className={`hidden shrink-0 text-lg transition-all md:block ${isSelected ? 'translate-x-0.5 text-indigo-500' : 'text-zinc-300 group-hover:translate-x-0.5 group-hover:text-zinc-500'}`}>
                  →
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {(page > 1 || rows.length === perPage) && (
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>Showing {(page - 1) * perPage + 1}–{(page - 1) * perPage + rows.length}</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => router.push(`/dashboard/returns?page=${page - 1}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`)}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-40"
            >← Prev</button>
            <button
              disabled={rows.length < perPage}
              onClick={() => router.push(`/dashboard/returns?page=${page + 1}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`)}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-40"
            >Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
