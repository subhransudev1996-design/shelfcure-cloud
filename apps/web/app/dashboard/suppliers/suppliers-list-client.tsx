'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  createSupplier,
  type Supplier,
  type CreateSupplierInput,
  DomainError,
} from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import { Modal } from '../../../components/ui/modal';
import { Button } from '../../../components/ui/button';
import { Field, Alert } from '../../../components/form-fields';

const INR = (n: number) =>
  '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type FilterType = 'all' | 'balance' | 'settled';

interface Props {
  suppliers: Supplier[];
  canManage: boolean;
  initialFilter: FilterType;
}

export function SuppliersListClient({ suppliers, canManage, initialFilter }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterType>(initialFilter);
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [addOpen, setAddOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  const filtered = useMemo(() => {
    let list = suppliers;
    if (filter === 'balance') list = list.filter((s) => Number(s.outstanding_balance) > 0);
    else if (filter === 'settled') list = list.filter((s) => Number(s.outstanding_balance) === 0);
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.city ?? '').toLowerCase().includes(q) || (s.phone ?? '').toLowerCase().includes(q),
    );
  }, [suppliers, filter, query]);

  const totalPayable = suppliers.reduce((sum, s) => sum + Number(s.outstanding_balance), 0);
  const activeCount = suppliers.filter((s) => s.is_active).length;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA';
      if ((e.ctrlKey && e.key === 'f') || e.key === '/') { e.preventDefault(); searchRef.current?.focus(); return; }
      if (e.key === 'n' && !inInput && canManage) { setAddOpen(true); return; }
      if (e.key === 'Escape') { if (query) { setQuery(''); return; } setSelectedIdx(-1); return; }
      if (inInput) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)); }
      else if (e.key === 'Enter' && selectedIdx >= 0) {
        const s = filtered[selectedIdx];
        if (s) router.push(`/dashboard/suppliers/${s.id}`);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [query, selectedIdx, filtered, router, canManage]);

  useEffect(() => {
    if (selectedIdx >= 0) rowRefs.current[selectedIdx]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  const FILTERS: { id: FilterType; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'balance', label: 'With Balance' },
    { id: 'settled', label: 'Settled' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Suppliers</p>
          <h1 className="mt-0.5 text-3xl font-black text-zinc-900">Distributors & Vendors</h1>
          <p className="mt-1 text-sm text-zinc-500">Suppliers you buy stock from.</p>
        </div>
        {canManage && (
          <Button size="md" onClick={() => setAddOpen(true)}
            leadingIcon={<svg viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" /></svg>}>
            Add supplier (n)
          </Button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Suppliers', value: String(suppliers.length), cls: 'text-zinc-900' },
          { label: 'Active', value: String(activeCount), cls: 'text-emerald-700' },
          { label: 'Total Payable', value: INR(totalPayable), cls: totalPayable > 0 ? 'text-amber-600' : 'text-zinc-500' },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{c.label}</p>
            <p className={`mt-1 text-2xl font-black tabular-nums ${c.cls}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filter + search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex gap-1 rounded-xl bg-zinc-100 p-1">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${filter === f.id ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <svg viewBox="0 0 24 24" fill="none" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400">
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
            <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input ref={searchRef} type="text" placeholder="Search supplier name, city, phone… (Ctrl+F)"
            value={query} onChange={(e) => { setQuery(e.target.value); setSelectedIdx(-1); }}
            className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-sm text-zinc-800 placeholder-zinc-400 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
        </div>
      </div>

      {/* Keyboard hints */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-400">
        {[['Ctrl+F', 'Search'], ['↑↓', 'Navigate'], ['Enter', 'Open'], ['n', 'Add supplier'], ['Esc', 'Clear']].map(([k, d]) => (
          <span key={k}><kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 font-mono">{k}</kbd> {d}</span>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50 text-center">
          <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 text-zinc-400 mb-3">
            <path d="M3 7h13l3 4h2v7h-2a2 2 0 1 1-4 0H10a2 2 0 1 1-4 0H3V7ZM3 11h13" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          <p className="font-semibold text-zinc-700">No suppliers found</p>
          <p className="text-sm text-zinc-400">{query ? 'Try a different search.' : canManage ? 'Add a supplier to get started.' : 'Ask your admin to add suppliers.'}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">GSTIN</th>
                <th className="px-4 py-3 text-right">Payable</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((s, i) => {
                const isSelected = i === selectedIdx;
                const balance = Number(s.outstanding_balance);
                return (
                  <tr key={s.id} ref={(el) => { rowRefs.current[i] = el; }}
                    onClick={() => router.push(`/dashboard/suppliers/${s.id}`)}
                    className={`cursor-pointer transition-colors hover:bg-indigo-50/50 ${isSelected ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200' : ''}`}
                  >
                    <td className="px-4 py-3 font-semibold text-zinc-900">{s.name}</td>
                    <td className="px-4 py-3 text-zinc-600">{[s.city, s.state].filter(Boolean).join(', ') || '—'}</td>
                    <td className="px-4 py-3 text-zinc-600">{s.phone || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-700">{s.gstin || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {balance > 0 ? (
                        <span className="font-mono font-semibold text-amber-600">{INR(balance)}</span>
                      ) : (
                        <span className="text-xs text-zinc-400">Settled</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {s.is_active ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500"><span className="h-1.5 w-1.5 rounded-full bg-zinc-400" /> Inactive</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <AddSupplierModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => router.refresh()} />
      )}
    </div>
  );
}

function AddSupplierModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CreateSupplierInput>({
    name: '', contact_person: '', phone: '', email: '',
    gstin: '', city: '', state: '', pincode: '', address: '',
    credit_limit: undefined, credit_days: undefined,
  });

  function reset() {
    setForm({ name: '', contact_person: '', phone: '', email: '', gstin: '', city: '', state: '', pincode: '', address: '', credit_limit: undefined, credit_days: undefined });
    setError(null);
  }

  function set<K extends keyof CreateSupplierInput>(k: K, v: CreateSupplierInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await createSupplier(getSupabaseBrowserClient(), form);
      onClose(); reset(); onSaved();
    } catch (err) {
      setError(err instanceof DomainError ? err.message : err instanceof Error ? err.message : 'Failed to add supplier');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); onSubmit(e as unknown as React.FormEvent); }
      if (e.key === 'Escape') { onClose(); reset(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form]);

  return (
    <Modal open={open} onClose={() => { onClose(); reset(); }} title="Add a supplier"
      description="A distributor or vendor you buy medicines from." maxWidth="lg"
      footer={<><Button variant="ghost" onClick={() => { onClose(); reset(); }}>Cancel</Button><Button onClick={onSubmit} loading={loading} type="submit">Create supplier</Button></>}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Supplier name" placeholder="e.g. Sun Pharma Distributors"
            value={form.name} onChange={(e) => set('name', e.target.value)} required minLength={2} maxLength={200} />
          <Field label="Contact person" value={form.contact_person ?? ''} onChange={(e) => set('contact_person', e.target.value)} placeholder="e.g. Rajesh Kumar" />
          <Field label="Phone" type="tel" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="+91 9000000000" />
          <Field label="Email" type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} placeholder="orders@supplier.com" />
          <Field label="GSTIN (optional)" value={form.gstin ?? ''} onChange={(e) => set('gstin', e.target.value.toUpperCase())} placeholder="27AAACS1234A1Z5" maxLength={15} />
          <Field label="Pincode" value={form.pincode ?? ''} onChange={(e) => set('pincode', e.target.value)} placeholder="400001" maxLength={6} inputMode="numeric" />
          <Field label="City" value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} placeholder="Mumbai" />
          <Field label="State" value={form.state ?? ''} onChange={(e) => set('state', e.target.value)} placeholder="Maharashtra" />
        </div>
        <Field label="Address (optional)" value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} placeholder="Street, area, landmark" />

        {/* Credit Terms */}
        <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Credit Terms</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Credit limit (₹)" type="number"
              value={form.credit_limit != null ? String(form.credit_limit) : ''}
              onChange={(e) => set('credit_limit', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="e.g. 50000" min="0" />
            <Field label="Credit days" type="number"
              value={form.credit_days != null ? String(form.credit_days) : ''}
              onChange={(e) => set('credit_days', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="e.g. 30" min="0" step="1" />
          </div>
        </div>

        {error && <Alert variant="error">{error}</Alert>}
      </form>
    </Modal>
  );
}
