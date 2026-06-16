'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createDoctor, type Doctor, type CreateDoctorInput, DomainError } from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import { Modal } from '../../../components/ui/modal';
import { Button } from '../../../components/ui/button';
import { Field, Alert } from '../../../components/form-fields';

const INR = (n: number) =>
  '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Filter = 'active' | 'inactive' | 'all';

interface Props {
  doctors: Doctor[];
  canManage: boolean;
}

export function DoctorsListClient({ doctors, canManage }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('active');
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [addOpen, setAddOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  const filtered = useMemo(() => {
    let list = doctors;
    if (filter === 'active') list = list.filter((d) => d.is_active);
    else if (filter === 'inactive') list = list.filter((d) => !d.is_active);
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.specialization ?? '').toLowerCase().includes(q) ||
        (d.clinic_name ?? '').toLowerCase().includes(q),
    );
  }, [doctors, filter, query]);

  const total = doctors.length;
  const active = doctors.filter((d) => d.is_active).length;

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
        const d = filtered[selectedIdx];
        if (d) router.push(`/dashboard/doctors/${d.id}`);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [query, selectedIdx, filtered, router, canManage]);

  useEffect(() => {
    if (selectedIdx >= 0) rowRefs.current[selectedIdx]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'active', label: 'Active' },
    { id: 'inactive', label: 'Inactive' },
    { id: 'all', label: 'All' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Doctors</p>
          <h1 className="mt-0.5 text-3xl font-black text-zinc-900">Prescribers</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Doctors whose prescriptions you fulfil — tracked for commission and recall.
          </p>
        </div>
        {canManage && (
          <Button
            size="md"
            onClick={() => setAddOpen(true)}
            leadingIcon={
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
              </svg>
            }
          >
            Add doctor (n)
          </Button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: 'Total Doctors', value: total, cls: 'text-zinc-900' },
          { label: 'Active', value: active, cls: 'text-emerald-700' },
          { label: 'Inactive', value: total - active, cls: 'text-zinc-500' },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{c.label}</p>
            <p className={`mt-1 text-3xl font-black tabular-nums ${c.cls}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filter + search row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex gap-1 rounded-xl bg-zinc-100 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                filter === f.id ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <svg viewBox="0 0 24 24" fill="none" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400">
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
            <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search by name, specialization, clinic… (Ctrl+F)"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIdx(-1); }}
            className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-sm text-zinc-800 placeholder-zinc-400 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      </div>

      {/* Keyboard hints */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-400">
        {[['Ctrl+F', 'Search'], ['↑↓', 'Navigate'], ['Enter', 'Open'], ['n', 'Add doctor'], ['Esc', 'Clear']].map(([k, d]) => (
          <span key={k}><kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 font-mono">{k}</kbd> {d}</span>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50 py-16">
          <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 text-zinc-400 mb-3">
            <path d="M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM5 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1M9 13l1 3M15 13l-1 3"
              stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          <p className="font-semibold text-zinc-700">No doctors found</p>
          <p className="text-sm text-zinc-400">
            {query ? 'Try a different search.' : canManage ? 'Add a doctor to get started.' : 'Ask your admin to add doctors.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Specialization</th>
                <th className="px-4 py-3">Clinic</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Commission</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((d, i) => {
                const isSelected = i === selectedIdx;
                return (
                  <tr
                    key={d.id}
                    ref={(el) => { rowRefs.current[i] = el; }}
                    onClick={() => router.push(`/dashboard/doctors/${d.id}`)}
                    className={`cursor-pointer transition-colors hover:bg-indigo-50/50 ${isSelected ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200' : ''}`}
                  >
                    <td className="px-4 py-3 font-semibold text-zinc-900">Dr. {d.name}</td>
                    <td className="px-4 py-3 text-zinc-600">{d.specialization || '—'}</td>
                    <td className="px-4 py-3 text-zinc-600">{d.clinic_name || '—'}</td>
                    <td className="px-4 py-3 text-zinc-600">{d.phone || '—'}</td>
                    <td className="px-4 py-3 text-zinc-600">
                      {d.commission_rate > 0 ? (
                        <span className="rounded-lg border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                          {d.commission_type === 'percentage'
                            ? `${d.commission_rate}%`
                            : `${INR(d.commission_rate)}/bill`}
                        </span>
                      ) : (
                        <span className="text-zinc-400">No commission</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {d.is_active ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" /> Inactive
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Doctor Modal */}
      {canManage && <AddDoctorModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => router.refresh()} />}
    </div>
  );
}

function AddDoctorModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CreateDoctorInput & { commission_type: 'percentage' | 'fixed'; commission_rate: number }>({
    name: '',
    specialization: '',
    phone: '',
    clinic_name: '',
    clinic_address: '',
    commission_type: 'percentage',
    commission_rate: 0,
  });

  function reset() {
    setForm({ name: '', specialization: '', phone: '', clinic_name: '', clinic_address: '', commission_type: 'percentage', commission_rate: 0 });
    setError(null);
  }

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await createDoctor(getSupabaseBrowserClient(), form);
      onClose();
      reset();
      onSaved();
    } catch (err) {
      setError(err instanceof DomainError ? err.message : err instanceof Error ? err.message : 'Failed to add doctor');
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
    <Modal
      open={open}
      onClose={() => { onClose(); reset(); }}
      title="Add a doctor"
      description="A prescriber whose scripts you fulfil."
      maxWidth="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => { onClose(); reset(); }}>Cancel</Button>
          <Button onClick={onSubmit} loading={loading} type="submit">Create doctor</Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Doctor name"
            placeholder="e.g. Anil Sharma"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
            minLength={2}
            maxLength={200}
            hint="No need to include 'Dr.' — we add it automatically."
          />
          <Field
            label="Specialization"
            value={form.specialization ?? ''}
            onChange={(e) => set('specialization', e.target.value)}
            placeholder="MBBS, MD (Medicine)"
          />
          <Field
            label="Phone"
            type="tel"
            value={form.phone ?? ''}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="+91 9000000000"
          />
          <Field
            label="Clinic name"
            value={form.clinic_name ?? ''}
            onChange={(e) => set('clinic_name', e.target.value)}
            placeholder="HealthFirst Clinic"
          />
        </div>
        <Field
          label="Clinic address (optional)"
          value={form.clinic_address ?? ''}
          onChange={(e) => set('clinic_address', e.target.value)}
          placeholder="Street, area, landmark"
        />

        {/* Commission section */}
        <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Commission</p>
          <div className="flex gap-2">
            {(['percentage', 'fixed'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set('commission_type', t)}
                className={`flex-1 rounded-xl border py-2 text-sm font-semibold transition-all ${
                  form.commission_type === t
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                    : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300'
                }`}
              >
                {t === 'percentage' ? '% of bill' : '₹ per bill'}
              </button>
            ))}
          </div>
          <Field
            label={form.commission_type === 'percentage' ? 'Commission rate (%)' : 'Commission rate (₹ / bill)'}
            type="number"
            value={String(form.commission_rate)}
            onChange={(e) => set('commission_rate', Number(e.target.value))}
            placeholder="0"
            min="0"
            step={form.commission_type === 'percentage' ? '0.1' : '1'}
          />
        </div>

        {error && <Alert variant="error">{error}</Alert>}
      </form>
    </Modal>
  );
}
