'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  listInventory,
  toggleFocused,
  type InventoryRow,
} from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';

const PER_PAGE = 100;
const FOCUS_LABELS = ['Overstock', 'High Margin', 'New Arrival', 'Promo', 'Clearance'] as const;

interface Props {
  storeId: string;
  role: string;
}

export function InventoryView({ storeId, role }: Props) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();
  const canEdit = role !== 'cashier' && role !== 'accountant';

  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [activeRack, setActiveRack] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [flagPopover, setFlagPopover] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const shiftAlone = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { rows: r, total: t } = await listInventory(supabase, {
        storeId, query: search, page, limit: PER_PAGE,
      });
      setRows(r); setTotal(t);
    } finally { setLoading(false); }
  }, [supabase, storeId, search, page]);

  useEffect(() => { const t = setTimeout(refresh, 300); return () => clearTimeout(t); }, [refresh]);

  // ── Rack chips (client-side filter over the current page, per §2.5.2) ──
  const rackCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const master = (r.rack_location ?? '').split('-')[0]?.trim();
      if (master) m.set(master, (m.get(master) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const visible = useMemo(() => {
    if (!activeRack) return rows;
    return rows.filter((r) => (r.rack_location ?? '').split('-')[0]?.trim() === activeRack);
  }, [rows, activeRack]);

  // ── Keyboard shortcuts (§2.5.7) ──
  useEffect(() => {
    function isTyping() {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    }
    function onKeyDown(e: KeyboardEvent) {
      // Ctrl+F / "/" / Insert → focus search
      if ((e.ctrlKey && e.key.toLowerCase() === 'f') || (!isTyping() && (e.key === '/' || e.key === 'Insert'))) {
        e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); return;
      }
      // Shift-alone detector
      if (e.key === 'Shift') { shiftAlone.current = true; return; }
      if (e.key !== 'Shift') shiftAlone.current = false;

      if (isTyping()) {
        if (e.key === 'Escape') { (e.target as HTMLInputElement).blur(); setSelectedIdx(null); }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => (i === null ? 0 : Math.min(i + 1, visible.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => (i === null ? 0 : Math.max(i - 1, 0)));
      } else if (e.key === 'Enter' && selectedIdx !== null && visible[selectedIdx]) {
        e.preventDefault();
        router.push(`/dashboard/inventory/${visible[selectedIdx]!.id}`);
      } else if (e.key === 'a' || e.key === 'n') {
        e.preventDefault(); router.push('/dashboard/inventory/add');
      } else if (e.key === 'ArrowLeft' && page > 1) {
        e.preventDefault(); setPage((p) => p - 1);
      } else if (e.key === 'ArrowRight' && page * PER_PAGE < total) {
        e.preventDefault(); setPage((p) => p + 1);
      } else if (e.key === 'Escape') {
        if (search) setSearch(''); else setSelectedIdx(null);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'Shift' && shiftAlone.current) {
        shiftAlone.current = false;
        searchRef.current?.blur();
        setSelectedIdx((i) => i ?? 0);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, [router, page, total, visible, selectedIdx, search, canEdit]);

  async function onToggleFocus(m: InventoryRow, label?: string) {
    const next = !m.is_focused;
    setRows((rs) => rs.map((r) => r.id === m.id ? { ...r, is_focused: next, focus_label: next ? (label ?? null) : null } : r));
    setFlagPopover(null);
    try { await toggleFocused(supabase, { medicineId: m.id, isFocused: next, label }); }
    catch { refresh(); }
  }

  const lastPage = Math.max(1, Math.ceil(total / PER_PAGE));
  const pageStart = (page - 1) * PER_PAGE + 1;
  const pageEnd = Math.min(page * PER_PAGE, total);

  return (
    <>
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[280px]">
          <svg viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400">
            <path d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search medicines... (Ctrl+F)"
            className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-10 pr-3 text-[15px] shadow-sm placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/15"
          />
        </div>
        <div className="text-sm text-zinc-500 tabular-nums">
          {loading ? 'Loading…' : (
            activeRack
              ? <><span className="font-medium text-zinc-700">{visible.length} shown</span> · {total} total</>
              : <>{pageStart}–{pageEnd} of {total} medicines</>
          )}
        </div>
        <Link
          href="/dashboard/inventory/barcodes"
          className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:border-zinc-400 hover:bg-zinc-50"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/></svg>
          Barcode Labels
        </Link>
        <Link
          href="/dashboard/inventory/add"
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"/></svg>
          Add Medicine
        </Link>
      </div>

      {/* ── Rack filter bar ─────────────────────────────────────── */}
      {rackCounts.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Rack</span>
          <button
            onClick={() => setActiveRack(null)}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${activeRack === null ? 'bg-slate-900 text-white' : 'bg-white text-zinc-700 hover:bg-zinc-100'}`}
          >All</button>
          {rackCounts.map(([code, n]) => (
            <button
              key={code}
              onClick={() => setActiveRack(activeRack === code ? null : code)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${activeRack === code ? 'bg-emerald-600 text-white' : 'bg-white text-zinc-700 hover:bg-zinc-100'}`}
            >{code} <span className="ml-0.5 opacity-70">{n}</span></button>
          ))}
          {activeRack && (
            <button onClick={() => setActiveRack(null)} className="ml-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100">
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────── */}
      {!loading && visible.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center shadow-sm">
          <div className="mx-auto h-12 w-12 rounded-full bg-zinc-100 p-3 text-zinc-400">
            <svg viewBox="0 0 24 24" fill="none"><path d="M8.5 3.5a5 5 0 1 1 7.07 7.07l-5.5 5.5a5 5 0 1 1-7.07-7.07l5.5-5.5Z" stroke="currentColor" strokeWidth="1.75"/></svg>
          </div>
          <h3 className="mt-3 text-base font-medium text-zinc-900">{search ? 'No matches' : 'No medicines yet'}</h3>
          <p className="mt-1 text-sm text-zinc-500">{search ? `Nothing matches "${search}".` : 'Add your first medicine to start tracking stock.'}</p>
          {!search && (
            <Link href="/dashboard/inventory/add" className="mt-4 inline-flex rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
              Add your first medicine
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table ref={tableRef} className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50/60 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3">Medicine</th>
                <th className="px-3 py-3">Category</th>
                <th className="px-3 py-3">Rack</th>
                <th className="px-3 py-3">Pack Unit</th>
                <th className="px-3 py-3 text-right">Stock</th>
                <th className="px-3 py-3 text-center">₹ Purchase</th>
                <th className="px-3 py-3 text-right">₹ Selling</th>
                <th className="px-3 py-3 text-right">₹ MRP</th>
                <th className="px-3 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {visible.map((m, i) => {
                const isSelected = selectedIdx === i;
                const masterRack = (m.rack_location ?? '').split('-')[0]?.trim();
                const shelfPart = (m.rack_location ?? '').split('-').slice(1).join('-').trim();
                return (
                  <tr
                    key={m.id}
                    onMouseEnter={() => setSelectedIdx(i)}
                    onClick={() => router.push(`/dashboard/inventory/${m.id}`)}
                    className={`cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50/60 ring-1 ring-inset ring-indigo-200' : 'hover:bg-zinc-50/60'}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-zinc-900">{m.name}</div>
                        <Badges m={m} />
                      </div>
                      {(m.salt_composition || m.strength || m.dosage_form_name) && (
                        <div className="mt-0.5 text-xs text-zinc-500">
                          {[m.salt_composition, m.dosage_form_name, m.strength].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {m.category_name ? (
                        <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{m.category_name}</span>
                      ) : <span className="text-xs text-zinc-400">Uncategorized</span>}
                    </td>
                    <td className="px-3 py-3">
                      {masterRack ? (
                        <div>
                          <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${activeRack === masterRack ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-700'}`}>{masterRack}</span>
                          {shelfPart && <div className="mt-0.5 text-[11px] text-zinc-500">S {shelfPart}</div>}
                        </div>
                      ) : <span className="text-xs text-zinc-400">—</span>}
                    </td>
                    <td className="px-3 py-3 text-zinc-700">
                      <div>{m.pack_unit}</div>
                      <div className="text-[11px] text-zinc-500">{m.pack_size} per pack</div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <StockCell m={m} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="text-[10px] uppercase tracking-wider text-zinc-400">Purchase</div>
                      <div className="font-mono text-sm text-zinc-700 tabular-nums">{m.purchase_rate != null ? `₹${Number(m.purchase_rate).toFixed(2)}` : '—'}</div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="font-mono text-sm font-semibold text-indigo-700 tabular-nums">
                        {m.selling_price != null ? `₹${Number(m.selling_price).toFixed(2)}` : (m.mrp != null ? `₹${Number(m.mrp).toFixed(2)}` : '—')}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-sm text-zinc-700 tabular-nums">
                      {m.mrp != null ? `₹${Number(m.mrp).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && (
                          <div className="relative">
                            <button
                              title={m.is_focused ? `Focused${m.focus_label ? ` — ${m.focus_label}` : ''}` : 'Flag as focused'}
                              onClick={() => m.is_focused ? onToggleFocus(m) : setFlagPopover(m.id)}
                              className={`rounded-lg p-1.5 transition ${m.is_focused ? 'bg-emerald-100 text-emerald-700' : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700'}`}
                            >
                              <svg viewBox="0 0 24 24" fill={m.is_focused ? 'currentColor' : 'none'} className="h-4 w-4"><path d="M4 21V5a2 2 0 0 1 2-2h11l-2 4 2 4H6" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/></svg>
                            </button>
                            {flagPopover === m.id && (
                              <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-lg">
                                {FOCUS_LABELS.map((l) => (
                                  <button key={l} onClick={() => onToggleFocus(m, l)} className="block w-full rounded-md px-2.5 py-1.5 text-left text-xs text-zinc-700 hover:bg-emerald-50 hover:text-emerald-800">{l}</button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {canEdit && (
                          <Link
                            href={`/dashboard/inventory/${m.id}#add-stock`}
                            title="Quick adjust stock"
                            className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                          >
                            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                          </Link>
                        )}
                        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-zinc-300"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/></svg>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ──────────────────────────────────────────── */}
      {total > PER_PAGE && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-xs text-zinc-500 tabular-nums">Showing {pageStart}–{pageEnd} of {total} medicines</div>
          <div className="flex items-center gap-1">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-30">‹ Prev</button>
            {pageNumbers(page, lastPage).map((n, i) =>
              n === '…' ? <span key={`e${i}`} className="px-1 text-xs text-zinc-400">…</span> : (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${n === page ? 'bg-indigo-600 text-white' : 'text-zinc-700 hover:bg-zinc-100'}`}
                >{n}</button>
              )
            )}
            <button disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)} className="rounded-md px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-30">Next ›</button>
          </div>
        </div>
      )}

      {/* ── Keyboard shortcuts footer ───────────────────────────── */}
      <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <Kbd>Ctrl+F</Kbd> Search
        <Kbd>/</Kbd> Search
        <Kbd>Insert</Kbd> Jump to search
        <Kbd>Shift</Kbd> Back to list
        <Kbd>↑</Kbd><Kbd>↓</Kbd> Navigate
        <Kbd>Enter</Kbd> Open
        <Kbd>A</Kbd> Add medicine
        <Kbd>←</Kbd><Kbd>→</Kbd> Prev / next page
        <Kbd>Esc</Kbd> Clear
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────

function Badges({ m }: { m: InventoryRow }) {
  const badges: { label: string; cls: string }[] = [];
  if (m.is_focused) {
    badges.push({ label: m.focus_label ? `★ ${m.focus_label}` : 'Focused', cls: 'bg-emerald-100 text-emerald-800' });
  }
  const ageDays = Math.floor((Date.now() - new Date(m.created_at).getTime()) / 86400000);
  if (ageDays <= 30) {
    badges.push({ label: ageDays === 0 ? 'Today' : `${ageDays}d ago`, cls: 'bg-purple-100 text-purple-700' });
  }
  if (m.mrp && m.purchase_rate && m.mrp > 0) {
    const margin = (Number(m.mrp) - Number(m.purchase_rate)) / Number(m.mrp);
    if (margin >= 0.30) badges.push({ label: `${Math.round(margin * 100)}% margin`, cls: 'bg-indigo-100 text-indigo-700' });
  }
  const displayStock = displayStockValue(m);
  if (displayStock > 20 && m.reorder_level > 0 && displayStock > 5 * m.reorder_level) {
    badges.push({ label: 'Overstock', cls: 'bg-orange-100 text-orange-700' });
  }
  if (badges.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {badges.map((b, i) => (
        <span key={i} className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${b.cls}`}>{b.label}</span>
      ))}
    </span>
  );
}

function StockCell({ m }: { m: InventoryRow }) {
  if (m.total_stock <= 0) {
    return (
      <div>
        <div className="font-semibold text-rose-600 tabular-nums">0</div>
        <div className="text-[10px] uppercase tracking-wider text-rose-500">{m.pack_unit}</div>
      </div>
    );
  }
  if (m.sale_unit_mode === 'both' && m.units_per_pack && m.units_per_pack > 1) {
    const strips = Math.floor(m.total_stock / m.units_per_pack);
    const loose = m.total_stock % m.units_per_pack;
    const low = strips <= (m.min_stock_level ?? 0);
    return (
      <div>
        <div className={`text-lg font-bold tabular-nums ${low ? 'text-rose-600' : 'text-zinc-900'}`}>{strips}</div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">{m.pack_unit}</div>
        {loose > 0 && <div className="mt-0.5 text-[11px] font-medium text-indigo-600">+ {loose} units</div>}
      </div>
    );
  }
  const low = m.total_stock <= (m.min_stock_level ?? 0);
  return (
    <div>
      <div className={`text-lg font-bold tabular-nums ${low ? 'text-rose-600' : 'text-zinc-900'}`}>{m.total_stock}</div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{m.pack_unit}</div>
    </div>
  );
}

function displayStockValue(m: InventoryRow): number {
  if (m.sale_unit_mode === 'both' && m.units_per_pack && m.units_per_pack > 1) {
    return Math.floor(m.total_stock / m.units_per_pack);
  }
  return m.total_stock;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700 shadow-sm">{children}</kbd>
  );
}

function pageNumbers(current: number, last: number): (number | '…')[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  if (current > 4) out.push('…');
  for (let p = Math.max(2, current - 2); p <= Math.min(last - 1, current + 2); p++) out.push(p);
  if (current < last - 3) out.push('…');
  out.push(last);
  return out;
}
