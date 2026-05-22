'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createCustomer, listCustomers, type Customer } from '@shelfcure/api-client';
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
  const [items, setItems] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  // Cashiers can create customers (POS walk-in flow)
  const canAdd = role !== 'accountant';
  const canAddNoStore = stores.length === 0 && role !== 'super_admin';

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listCustomers(supabase, { search });
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, [supabase, search]);

  useEffect(() => {
    const t = setTimeout(refresh, 250);
    return () => clearTimeout(t);
  }, [refresh]);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <svg viewBox="0 0 24 24" fill="none" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400">
            <path d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
            className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-10 pr-3 text-[15px] shadow-sm placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/15"
          />
        </div>
        <div className="text-sm text-zinc-500">
          {loading ? 'Loading…' : `${items.length} customer${items.length === 1 ? '' : 's'}`}
        </div>
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
          title={search ? 'No matches' : 'No customers yet'}
          description={
            search
              ? `Nothing matches "${search}".`
              : canAddNoStore
                ? 'Add a store first, then capture customers as they come in.'
                : 'Customers added here will autocomplete during sales.'
          }
          action={canAdd && !search && !canAddNoStore ? (
            <Button onClick={() => setAddOpen(true)}>Add your first customer</Button>
          ) : null}
        />
      )}

      {items.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <li
              key={c.id}
              className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">
                  {getInitials(c.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate font-semibold text-zinc-900">{c.name}</div>
                    {c.customer_type === 'b2b' && (
                      <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 ring-1 ring-violet-200">
                        B2B
                      </span>
                    )}
                  </div>
                  {c.phone && <div className="text-xs text-zinc-500">{c.phone}</div>}
                </div>
              </div>
              {(c.address || c.outstanding_balance > 0) && (
                <div className="mt-3 space-y-1 text-xs text-zinc-600">
                  {c.address && <div className="truncate">{c.address}</div>}
                  {Number(c.outstanding_balance) > 0 && (
                    <div className="font-medium text-amber-700">
                      Outstanding: ₹{Number(c.outstanding_balance).toLocaleString('en-IN')}
                    </div>
                  )}
                </div>
              )}
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
    customerType: 'b2c' as 'b2c' | 'b2b',
    gstin: '',
  });

  function reset() {
    setForm({
      storeId: userStoreId ?? stores[0]?.id ?? '',
      name: '',
      phone: '',
      email: '',
      address: '',
      customerType: 'b2c',
      gstin: '',
    });
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await createCustomer(supabase, {
        storeId: form.storeId || null,
        name: form.name,
        phone: form.phone,
        email: form.email,
        address: form.address,
        customerType: form.customerType,
        gstin: form.gstin,
      });
      onClose();
      reset();
      onCreated();
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
      description="Just name and phone are required."
      maxWidth="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => { onClose(); reset(); }}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={loading} type="submit">
            Add customer
          </Button>
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Full name"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
            placeholder="e.g. Rajesh Sharma"
          />
          <Field
            label="Phone"
            type="tel"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="+91 9000000000"
          />
          {form.customerType === 'b2b' && (
            <>
              <Field
                label="GSTIN"
                value={form.gstin}
                onChange={(e) => set('gstin', e.target.value.toUpperCase())}
                maxLength={15}
                placeholder="27AAACS1234A1Z5"
              />
              <Field
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="billing@company.com"
              />
            </>
          )}
        </div>
        <Field
          label="Address"
          value={form.address}
          onChange={(e) => set('address', e.target.value)}
          placeholder="Street, city, pincode"
        />

        {error && <Alert variant="error">{error}</Alert>}
      </form>
    </Modal>
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
