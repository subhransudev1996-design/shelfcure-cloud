'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  createCustomer,
  listCustomers,
  type Customer,
  type CreateCustomerInput,
} from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';
import { EmptyState } from '../../../components/ui/empty-state';
import { Field, Alert } from '../../../components/form-fields';

interface Store {
  id: string;
  code: string;
  name: string;
}

type Filter = 'all' | 'outstanding' | 'clear';

export function CustomersView({
  role,
  userStoreId,
  stores,
}: {
  role: string;
  userStoreId: string | null;
  stores: Store[];
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [allItems, setAllItems] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [addOpen, setAddOpen] = useState(false);

  const canAdd = role !== 'accountant';
  const canAddNoStore = stores.length === 0 && role !== 'super_admin';

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listCustomers(supabase, {});
      setAllItems(data);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { refresh(); }, [refresh]);

  // client-side filter + search
  const items = useMemo(() => {
    let list = allItems;
    if (filter === 'outstanding') list = list.filter((c) => Number(c.outstanding_balance) > 0);
    else if (filter === 'clear') list = list.filter((c) => Number(c.outstanding_balance) === 0);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
    }
    return list;
  }, [allItems, filter, search]);

  // Stats computed from full list
  const stats = useMemo(() => ({
    total: allItems.length,
    active: allItems.filter((c) => c.is_active).length,
    totalOutstanding: allItems.reduce((s, c) => s + Number(c.outstanding_balance), 0),
    b2bCount: allItems.filter((c) => c.customer_type === 'b2b').length,
  }), [allItems]);

  function exportCsv() {
    const rows = [
      ['Name', 'Phone', 'Email', 'Type', 'GSTIN', 'Address', 'Outstanding Balance', 'Credit Limit', 'Created'],
      ...items.map((c) => [
        c.name, c.phone, c.email ?? '', c.customer_type, c.gstin ?? '',
        c.address ?? '', String(c.outstanding_balance), String(c.credit_limit ?? ''),
        c.created_at.slice(0, 10),
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'customers.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {/* Stats row */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Customers" value={stats.total} />
        <StatCard label="Active" value={stats.active} />
        <StatCard
          label="Total Outstanding"
          value={`₹${stats.totalOutstanding.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
          accent="amber"
        />
        <StatCard label="B2B Accounts" value={stats.b2bCount} />
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Filter pills */}
        <div className="flex gap-1 rounded-xl bg-zinc-100 p-1">
          {(['all', 'outstanding', 'clear'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                filter === f ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              {f === 'clear' ? 'No Balance' : f === 'outstanding' ? 'Outstanding' : 'All'}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <svg viewBox="0 0 24 24" fill="none" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400">
            <path d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
            className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/15"
          />
        </div>

        <div className="text-sm text-zinc-500">
          {loading ? 'Loading…' : `${items.length} customer${items.length === 1 ? '' : 's'}`}
        </div>

        <button
          onClick={exportCsv}
          disabled={items.length === 0}
          className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Export CSV
        </button>

        {canAdd && (
          <Button
            onClick={() => setAddOpen(true)}
            disabled={canAddNoStore}
            title={canAddNoStore ? 'Add a store first.' : undefined}
            leadingIcon={
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
              </svg>
            }
          >
            Add customer
          </Button>
        )}
      </div>

      {!loading && items.length === 0 && (
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
              <path
                d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          }
          title={search || filter !== 'all' ? 'No matches' : 'No customers yet'}
          description={
            search
              ? `Nothing matches "${search}".`
              : filter !== 'all'
              ? 'No customers match this filter.'
              : canAddNoStore
              ? 'Add a store first, then capture customers as they come in.'
              : 'Customers added here will autocomplete during sales.'
          }
          action={
            canAdd && !search && filter === 'all' && !canAddNoStore ? (
              <Button onClick={() => setAddOpen(true)}>Add your first customer</Button>
            ) : null
          }
        />
      )}

      {items.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <li key={c.id}>
              <Link
                href={`/dashboard/customers/${c.id}`}
                className="group block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">
                    {getInitials(c.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate font-semibold text-zinc-900 group-hover:text-emerald-700">
                        {c.name}
                      </div>
                      {c.customer_type === 'b2b' && (
                        <span className="shrink-0 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 ring-1 ring-violet-200">
                          B2B
                        </span>
                      )}
                    </div>
                    {c.phone && <div className="text-xs text-zinc-500">{c.phone}</div>}
                  </div>
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0 text-zinc-300 group-hover:text-emerald-500 transition-colors">
                    <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                {(c.address || Number(c.outstanding_balance) > 0) && (
                  <div className="mt-3 space-y-1 text-xs text-zinc-600">
                    {c.address && <div className="truncate">{c.address}</div>}
                    {Number(c.outstanding_balance) > 0 && (
                      <div className="font-semibold text-amber-700">
                        Outstanding: ₹{Number(c.outstanding_balance).toLocaleString('en-IN')}
                      </div>
                    )}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <AddCustomerModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        role={role}
        userStoreId={userStoreId}
        stores={stores}
        onCreated={refresh}
      />
    </>
  );
}

function AddCustomerModal({
  open,
  onClose,
  role,
  userStoreId,
  stores,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  role: string;
  userStoreId: string | null;
  stores: Store[];
  onCreated: () => void;
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    storeId: userStoreId ?? stores[0]?.id ?? '',
    name: '',
    phone: '',
    email: '',
    address: '',
    state: '',
    customerType: 'b2c' as 'b2c' | 'b2b',
    gstin: '',
    creditLimit: '',
    creditDays: '',
  });

  function reset() {
    setForm({
      storeId: userStoreId ?? stores[0]?.id ?? '',
      name: '', phone: '', email: '', address: '', state: '',
      customerType: 'b2c', gstin: '', creditLimit: '', creditDays: '',
    });
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) { setError('Name is required.'); return; }
    if (form.phone && !/^\d{10}$/.test(form.phone.replace(/\D/g, ''))) {
      setError('Phone must be 10 digits when provided.'); return;
    }
    if (form.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(form.gstin)) {
      setError('Invalid GSTIN format.'); return;
    }

    setLoading(true);
    try {
      const input: CreateCustomerInput = {
        storeId: form.storeId || null,
        name: form.name,
        phone: form.phone,
        email: form.email,
        address: form.address,
        state: form.state,
        customerType: form.customerType,
        gstin: form.gstin,
        creditLimit: form.creditLimit ? parseFloat(form.creditLimit) : null,
        creditDays: form.creditDays ? parseInt(form.creditDays, 10) : null,
      };
      await createCustomer(supabase, input);
      onClose(); reset(); onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add customer');
    } finally {
      setLoading(false);
    }
  }

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v } as typeof f));
  }

  return (
    <Modal
      open={open}
      onClose={() => { onClose(); reset(); }}
      title="Add a customer"
      description="Name and phone are the key fields — the rest can be filled in later."
      maxWidth="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => { onClose(); reset(); }}>Cancel</Button>
          <Button onClick={onSubmit} loading={loading} type="submit">Add customer</Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {role === 'super_admin' && stores.length > 1 && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-zinc-800">Store</span>
            <select
              value={form.storeId}
              onChange={(e) => set('storeId', e.target.value)}
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-[15px] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/15"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.code} · {s.name}</option>
              ))}
            </select>
          </label>
        )}

        {/* Type toggle */}
        <div className="flex gap-2 rounded-xl bg-zinc-100 p-1">
          {(['b2c', 'b2b'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => set('customerType', t)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                form.customerType === t ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              {t === 'b2c' ? 'Walk-in (B2C)' : 'Business (B2B)'}
            </button>
          ))}
        </div>

        {/* Personal */}
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Personal Details</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name *" value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="e.g. Rajesh Sharma" />
          <Field label="Phone" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="10-digit mobile" />
          <Field label="Email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="optional" />
          {form.customerType === 'b2b' && (
            <Field label="GSTIN" value={form.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} maxLength={15} placeholder="27AAACS1234A1Z5" />
          )}
        </div>

        {/* Address */}
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Address</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Address" value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Street, city" />
          <Field label="State" value={form.state} onChange={(e) => set('state', e.target.value)} placeholder="e.g. Maharashtra" />
        </div>

        {/* Credit Terms */}
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Credit Terms</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Credit Limit (₹)" type="number" value={form.creditLimit} onChange={(e) => set('creditLimit', e.target.value)} placeholder="0 = no limit" />
          <Field label="Credit Days" type="number" value={form.creditDays} onChange={(e) => set('creditDays', e.target.value)} placeholder="e.g. 30" />
        </div>

        {error && <Alert variant="error">{error}</Alert>}
      </form>
    </Modal>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number | string; accent?: 'amber' }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${accent === 'amber' ? 'text-amber-700' : 'text-zinc-900'}`}>
        {value}
      </div>
    </div>
  );
}

function getInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}
