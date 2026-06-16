'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SupplierMedicineRow } from '@shelfcure/api-client';

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

const INR = (n: number) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ExpiryBadge({ days }: { days: number }) {
  if (days < 0) return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">EXPIRED</span>;
  if (days <= 30) return <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">{days}d left</span>;
  if (days <= 90) return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">{days}d left</span>;
  return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{days}d left</span>;
}

type TabType = 'all' | 'low' | 'expiry';

interface Props {
  supplierId: string;
  supplierName: string;
  medicines: SupplierMedicineRow[];
}

export function SupplierMedicinesClient({ supplierId, supplierName, medicines }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<TabType>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    let list = medicines;
    if (tab === 'low') list = list.filter((m) => m.is_low_stock);
    else if (tab === 'expiry') list = list.filter((m) => m.days_to_expiry <= 90);
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter((m) => m.medicine_name.toLowerCase().includes(q) || m.batch_number.toLowerCase().includes(q));
  }, [medicines, tab, query]);

  function toggleSelect(batchId: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(batchId)) n.delete(batchId); else n.add(batchId);
      return n;
    });
  }

  function selectAll() {
    setSelected(new Set(filtered.map((m) => m.batch_id)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  const selectedItems = useMemo(() => filtered.filter((m) => selected.has(m.batch_id)), [filtered, selected]);

  const totalReorderQty = useMemo(() =>
    selectedItems.reduce((s, m) => s + Math.max(1, m.reorder_level - m.current_quantity), 0),
  [selectedItems]);

  const TABS: { id: TabType; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: medicines.length },
    { id: 'low', label: 'Low Stock', count: medicines.filter((m) => m.is_low_stock).length },
    { id: 'expiry', label: 'Expiry ≤ 90d', count: medicines.filter((m) => m.days_to_expiry <= 90).length },
  ];

  function handleWhatsAppShare() {
    if (selectedItems.length === 0) return;
    const lines = selectedItems.map((m) => {
      const qty = Math.max(1, m.reorder_level - m.current_quantity);
      return `• ${m.medicine_name} (Batch: ${m.batch_number}) — Reorder: ${qty} units`;
    });
    const text = `Reorder request from ${supplierName}:\n\n${lines.join('\n')}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <Link href="/dashboard/suppliers" className="hover:text-zinc-700">Suppliers</Link>
        <span>›</span>
        <Link href={`/dashboard/suppliers/${supplierId}`} className="hover:text-zinc-700">{supplierName}</Link>
        <span>›</span>
        <span className="text-zinc-700">Medicines</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black text-zinc-900">Supplier Medicines</h1>
          <p className="mt-1 text-sm text-zinc-500">Batches ever supplied by {supplierName}.</p>
        </div>
        <Link href={`/dashboard/purchases/orders`}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700">
          Create Purchase Order
        </Link>
      </div>

      {/* Tabs */}
      <div className="inline-flex gap-1 rounded-xl bg-zinc-100 p-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${tab === t.id ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'}`}>
            {t.label}
            <span className="ml-1.5 rounded-full bg-zinc-200 px-1.5 py-0.5 text-[9px] font-bold">{t.count}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <svg viewBox="0 0 24 24" fill="none" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400">
          <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
          <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input type="text" placeholder="Search medicine or batch…" value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-sm text-zinc-800 placeholder-zinc-400 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
      </div>

      {/* Select all / clear */}
      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <button onClick={selectAll} className="hover:text-indigo-600 font-medium">Select All ({filtered.length})</button>
        {selected.size > 0 && <button onClick={clearAll} className="hover:text-zinc-700">Clear ({selected.size} selected)</button>}
      </div>

      {/* Floating action bar */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-10 flex items-center gap-3 rounded-2xl border border-indigo-200 bg-white p-3 shadow-xl">
          <span className="text-sm font-semibold text-zinc-800">{selected.size} selected · {totalReorderQty} units to reorder</span>
          <div className="ml-auto flex gap-2">
            <button onClick={handleWhatsAppShare}
              className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100">
              📱 WhatsApp
            </button>
            <button
              onClick={() => {
                const ids = selectedItems.map((m) => m.medicine_id).join(',');
                router.push(`/dashboard/purchases/new?medicines=${ids}&supplier=${supplierId}`);
              }}
              className="rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-700">
              Create Purchase Order
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50 text-center">
          <p className="font-semibold text-zinc-700">No medicines found</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              <tr>
                <th className="px-4 py-3 w-8"></th>
                <th className="px-4 py-3">Medicine</th>
                <th className="px-4 py-3">Batch</th>
                <th className="px-4 py-3">Expiry</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-right">MRP</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((m) => {
                const isSelected = selected.has(m.batch_id);
                const reorderQty = Math.max(1, m.reorder_level - m.current_quantity);
                return (
                  <tr key={m.batch_id}
                    className={`transition-colors ${isSelected ? 'bg-indigo-50' : 'hover:bg-zinc-50/60'}`}
                    onClick={() => toggleSelect(m.batch_id)}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(m.batch_id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 rounded border-zinc-300 text-indigo-600 cursor-pointer" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-zinc-900">{m.medicine_name}</div>
                      {m.last_purchase_date && (
                        <div className="text-[10px] text-zinc-400">Last: {fmtDate(m.last_purchase_date)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-600">{m.batch_number}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-zinc-600">{fmtDate(m.expiry_date)}</div>
                      <ExpiryBadge days={m.days_to_expiry} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={m.is_low_stock ? 'font-bold text-amber-600' : 'text-zinc-800'}>{m.current_quantity}</span>
                      {m.is_low_stock && (
                        <div className="text-[9px] text-amber-500">Reorder: {reorderQty}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-700">{INR(m.purchase_rate)}</td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-700">{INR(m.mrp)}</td>
                    <td className="px-4 py-3">
                      {m.is_low_stock && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">LOW STOCK</span>
                      )}
                      {m.days_to_expiry < 0 && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">EXPIRED</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
