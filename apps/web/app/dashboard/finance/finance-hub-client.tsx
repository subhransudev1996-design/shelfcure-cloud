'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  addExpense, updateExpense, deleteExpense,
  addExpenseCategory, deleteExpenseCategory,
  listExpenseCategories, listExpenses, getExpenseSummary,
  type Expense, type ExpenseCategory, type ExpenseSummaryRow,
  EXPENSE_PAYMENT_METHODS,
} from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';

const INR = (n: number) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtMethod(m: string | null) {
  return (m ?? 'cash').replace(/_/g, ' ').toUpperCase();
}

function monthRange(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(y, d.getMonth() + 1, 0).getDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(lastDay).padStart(2, '0')}` };
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

interface Props {
  storeId: string;
  initialCategories: ExpenseCategory[];
  initialExpenses: Expense[];
  initialSummary: ExpenseSummaryRow[];
  initialFrom: string;
  initialTo: string;
}

export function FinanceHubClient({
  storeId,
  initialCategories,
  initialExpenses,
  initialSummary,
  initialFrom,
  initialTo,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [categories, setCategories] = useState<ExpenseCategory[]>(initialCategories);
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [summary, setSummary] = useState<ExpenseSummaryRow[]>(initialSummary);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [loading, setLoading] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [showCategories, setShowCategories] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const totalExpenses = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount), 0), [expenses]);
  const maxCategory = useMemo(() => Math.max(0, ...summary.map((r) => Number(r.total))), [summary]);

  const reload = useCallback(async (f: string, t: string) => {
    setLoading(true);
    try {
      const [ex, sum] = await Promise.all([
        listExpenses(supabase, storeId, f, t),
        getExpenseSummary(supabase, storeId, f, t),
      ]);
      setExpenses(ex);
      setSummary(sum);
      setFrom(f);
      setTo(t);
    } finally {
      setLoading(false);
    }
  }, [supabase, storeId]);

  const reloadCategories = useCallback(async () => {
    const cats = await listExpenseCategories(supabase, storeId).catch(() => []);
    setCategories(cats);
  }, [supabase, storeId]);

  // Keyboard shortcuts (n, m, t, l, 1, 2, Esc, Ctrl+S)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      const anyModal = addOpen || !!editExpense || showCategories;

      if (e.key === 'Escape') {
        if (showCategories) { setShowCategories(false); return; }
        if (editExpense) { setEditExpense(null); return; }
        if (addOpen) { setAddOpen(false); return; }
        router.push('/dashboard');
        return;
      }
      if (inInput || anyModal) return;
      if (e.key === 'n') { setAddOpen(true); return; }
      if (e.key === 'm') { setShowCategories(true); return; }
      if (e.key === 't') { const r = monthRange(0); reload(r.from, r.to); return; }
      if (e.key === 'l') { const r = monthRange(-1); reload(r.from, r.to); return; }
      if (e.key === '1') { router.push('/dashboard/customers'); return; }
      if (e.key === '2') { router.push('/dashboard/suppliers'); return; }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addOpen, editExpense, showCategories, router, reload]);

  async function handleDelete(id: string) {
    await deleteExpense(supabase, storeId, id);
    setDeleteConfirm(null);
    await reload(from, to);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50">
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-indigo-500">
              <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.75" />
              <path d="M2 10h20" stroke="currentColor" strokeWidth="1.75" />
              <path d="M6 15h4M14 15h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-black text-zinc-900">Finance Hub</h1>
            <p className="text-xs text-zinc-500">Expense tracking, credit ledgers and financial overview</p>
          </div>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>
          Log Expense
        </button>
      </div>

      {/* Quick-link cards */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/dashboard/customers"
          className="group flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-indigo-500">
              <path d="M3 18s0-4 9-4 9 4 9 4M12 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
              <path d="M20 12l2-2m0 0l2 2m-2-2v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-zinc-900">Customer Ledgers</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Manage receivables</p>
          </div>
        </Link>
        <Link href="/dashboard/suppliers"
          className="group flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm hover:border-orange-300 hover:shadow-md transition-all">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-orange-500">
              <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-zinc-900">Supplier Ledgers</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Manage payables</p>
          </div>
        </Link>
      </div>

      {/* Date-range bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0 text-zinc-400">
          <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.75" />
          <path d="M3 9h18M8 4v2M16 4v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          <span className="text-sm text-zinc-400">to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          <button onClick={() => reload(from, to)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
            Apply
          </button>
        </div>
        <div className="flex gap-2 ml-2">
          {[{ label: 'This Month', offset: 0 }, { label: 'Last Month', offset: -1 }].map((p) => (
            <button key={p.label}
              onClick={() => { const r = monthRange(p.offset); reload(r.from, r.to); }}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50">
              {p.label}
            </button>
          ))}
        </div>
        <div className="ml-auto text-sm font-bold text-red-500">
          Total: {loading ? '…' : INR(totalExpenses)}
        </div>
      </div>

      {/* Keyboard shortcuts strip */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 rounded-xl bg-slate-50 px-4 py-3 text-[10px] text-zinc-500">
        {[
          ['n', 'Log expense'],
          ['m', 'Categories'],
          ['t', 'This Month'],
          ['l', 'Last Month'],
          ['1', 'Customer Ledgers'],
          ['2', 'Supplier Ledgers'],
          ['Esc', 'Close / Back'],
          ['Ctrl+S', 'Save form'],
        ].map(([k, d]) => (
          <span key={k} className="flex items-center gap-1">
            <kbd className="rounded border border-zinc-200 bg-white px-1 py-0.5 font-mono text-[9px] font-bold text-zinc-700 shadow-sm">{k}</kbd>
            {d}
          </span>
        ))}
      </div>

      {/* Body: 3-column grid */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* By Category panel (1 col) */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400">By Category</p>
          {summary.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">No expenses logged</p>
          ) : (
            <div className="space-y-3">
              {summary.map((row) => {
                const pct = maxCategory > 0 ? (Number(row.total) / maxCategory) * 100 : 0;
                return (
                  <div key={row.category}>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-sm font-semibold text-zinc-800">{row.category}</span>
                      <span className="font-mono text-sm font-bold text-zinc-900">{INR(Number(row.total))}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-0.5 text-[10px] text-zinc-400">{Number(row.cnt)} {Number(row.cnt) === 1 ? 'entry' : 'entries'}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Expense Log panel (2 cols) */}
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              Expense Log
            </p>
            <span className="text-xs text-zinc-500">{expenses.length} {expenses.length === 1 ? 'entry' : 'entries'}</span>
          </div>

          {expenses.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 text-zinc-300 mb-3">
                <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M2 10h20" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <p className="font-semibold text-zinc-700">No expenses in this period</p>
              <button onClick={() => setAddOpen(true)}
                className="mt-3 text-sm font-semibold text-indigo-600 hover:underline">
                + Log first expense
              </button>
            </div>
          ) : (
            <div className="max-h-[460px] overflow-y-auto divide-y divide-zinc-100">
              {expenses.map((exp) => (
                <ExpenseRow
                  key={exp.id}
                  expense={exp}
                  isDeleteConfirm={deleteConfirm === exp.id}
                  onEdit={() => setEditExpense(exp)}
                  onDeleteArm={() => setDeleteConfirm(exp.id)}
                  onDeleteConfirm={() => handleDelete(exp.id)}
                  onDeleteCancel={() => setDeleteConfirm(null)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Expense Modal */}
      {addOpen && (
        <ExpenseModal
          mode="add"
          categories={categories}
          onCategoriesOpen={() => setShowCategories(true)}
          onClose={() => setAddOpen(false)}
          onSaved={async () => {
            setAddOpen(false);
            await reload(from, to);
          }}
          storeId={storeId}
        />
      )}

      {/* Edit Expense Modal */}
      {editExpense && (
        <ExpenseModal
          mode="edit"
          expense={editExpense}
          categories={categories}
          onCategoriesOpen={() => setShowCategories(true)}
          onClose={() => setEditExpense(null)}
          onSaved={async () => {
            setEditExpense(null);
            await reload(from, to);
          }}
          storeId={storeId}
        />
      )}

      {/* Manage Categories Modal */}
      {showCategories && (
        <ManageCategoriesModal
          storeId={storeId}
          categories={categories}
          onClose={() => setShowCategories(false)}
          onChanged={reloadCategories}
        />
      )}
    </div>
  );
}

// ── Expense Row ──────────────────────────────────────────────────────────────

function ExpenseRow({
  expense: exp, isDeleteConfirm,
  onEdit, onDeleteArm, onDeleteConfirm, onDeleteCancel,
}: {
  expense: Expense;
  isDeleteConfirm: boolean;
  onEdit: () => void;
  onDeleteArm: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
}) {
  return (
    <div className="group flex items-start gap-3 px-5 py-4 hover:bg-zinc-50/70">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-50">
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-indigo-500">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
          <circle cx="7" cy="7" r="1" fill="currentColor" />
        </svg>
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-semibold text-zinc-900">{exp.description}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.75" /><path d="M3 9h18M8 4v2M16 4v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>
            {fmtDate(exp.expense_date)}
          </span>
          {exp.category_name && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600">
              {exp.category_name}
            </span>
          )}
          <span className="flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600">
            <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3"><rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.75" /><path d="M2 10h20" stroke="currentColor" strokeWidth="1.75" /></svg>
            {fmtMethod(exp.payment_method)}
          </span>
        </div>
        {exp.notes && <p className="mt-1 text-xs italic text-zinc-400">{exp.notes}</p>}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-mono font-semibold text-red-500">− {INR(Number(exp.amount))}</span>
        {isDeleteConfirm ? (
          <div className="flex gap-1.5">
            <button onClick={onDeleteConfirm} className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-red-700">Delete</button>
            <button onClick={onDeleteCancel} className="rounded border border-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-600 hover:bg-zinc-100">Cancel</button>
          </div>
        ) : (
          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button onClick={onEdit} className="rounded p-1 hover:bg-zinc-100" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 text-zinc-500"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" /></svg>
            </button>
            <button onClick={onDeleteArm} className="rounded p-1 hover:bg-red-50" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 text-red-500"><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Expense Modal (Add / Edit) ───────────────────────────────────────────────

interface ExpenseModalProps {
  mode: 'add' | 'edit';
  storeId: string;
  categories: ExpenseCategory[];
  expense?: Expense;
  onCategoriesOpen: () => void;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

interface ExpenseFormState {
  id?: string;
  description: string;
  amount: string;
  expense_date: string;
  category_id: string;
  payment_method: string;
  notes: string;
}

function ExpenseModal({ mode, storeId, categories, expense, onCategoriesOpen, onClose, onSaved }: ExpenseModalProps) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const descRef = useRef<HTMLInputElement>(null);

  const today = todayStr();
  const [form, setForm] = useState<ExpenseFormState>({
    id: expense?.id,
    description: expense?.description ?? '',
    amount: expense?.amount != null ? String(expense.amount) : '',
    expense_date: expense?.expense_date ?? today,
    category_id: expense?.category_id ?? '',
    payment_method: expense?.payment_method ?? 'cash',
    notes: expense?.notes ?? '',
  });

  useEffect(() => {
    setTimeout(() => descRef.current?.focus(), 50);
  }, []);

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        submit();
      }
      if (e.key === 'Escape') { onClose(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  async function submit() {
    if (!form.description.trim() || !form.amount || Number(form.amount) <= 0) {
      setError('Description and a valid amount are required');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const input = {
        description: form.description.trim(),
        amount: Number(form.amount),
        expense_date: form.expense_date,
        category_id: form.category_id || null,
        payment_method: form.payment_method || 'cash',
        notes: form.notes?.trim() || null,
      };
      if (mode === 'edit' && form.id) {
        await updateExpense(supabase, storeId, { ...input, id: form.id });
      } else {
        await addExpense(supabase, storeId, input);
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-indigo-600">
              {mode === 'add'
                ? <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
                : <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
              }
            </svg>
            <h2 className="text-base font-bold text-zinc-900">{mode === 'add' ? 'Log Expense' : 'Edit Expense'}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-zinc-100">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-zinc-500"><path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="space-y-3 p-5">
          {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-800">Description *</label>
            <input ref={descRef} type="text" placeholder="e.g. Electricity bill, Staff salary…"
              value={form.description} onChange={(e) => set('description', e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-800">Amount (₹) *</label>
              <input type="number" min="1" step="0.01" placeholder="0.00"
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-800">Date *</label>
              <input type="date" value={form.expense_date} onChange={(e) => set('expense_date', e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-zinc-800">Category</label>
              <button type="button" onClick={onCategoriesOpen}
                className="text-xs font-semibold text-indigo-600 hover:underline">
                Manage
              </button>
            </div>
            <select value={form.category_id} onChange={(e) => set('category_id', e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100">
              <option value="">Uncategorized</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-800">Payment Method</label>
            <select value={form.payment_method ?? 'cash'} onChange={(e) => set('payment_method', e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100">
              {EXPENSE_PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-800">Notes</label>
            <input type="text" placeholder="Optional reference…"
              value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
          </div>

          {mode === 'add' && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-zinc-50 px-3 py-2 text-[10px] text-zinc-500">
              {[['Ctrl+S', 'Save'], ['Tab', 'Next field'], ['Esc', 'Close']].map(([k, d]) => (
                <span key={k}><kbd className="rounded border border-zinc-200 bg-white px-1 py-0.5 font-mono font-bold text-zinc-700">{k}</kbd> {d}</span>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-100 px-5 py-4">
          <button onClick={onClose} className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            Cancel
          </button>
          <button onClick={submit} disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
            {loading && <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity=".25" /><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>}
            {mode === 'add' ? 'Save Expense' : 'Update Expense'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Manage Categories Modal ──────────────────────────────────────────────────

function ManageCategoriesModal({
  storeId, categories, onClose, onChanged,
}: {
  storeId: string;
  categories: ExpenseCategory[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);

  // Hotkey: n focuses the input (when categories modal open)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === 'n' && tag !== 'INPUT') { e.preventDefault(); inputRef.current?.focus(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function addCat() {
    if (!newName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await addExpenseCategory(supabase, storeId, newName.trim());
      setNewName('');
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  async function deleteCat(id: string) {
    try {
      await deleteExpenseCategory(supabase, storeId, id);
      await onChanged();
    } catch { /* silently ignore */ }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h2 className="text-base font-bold text-zinc-900">Manage Categories</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-zinc-100">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-zinc-500"><path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="max-h-64 overflow-y-auto divide-y divide-zinc-100 px-5 py-3">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between py-2">
              <span className={`text-sm ${c.is_system ? 'text-zinc-500 italic' : 'font-medium text-zinc-800'}`}>
                {c.name}
                {c.is_system && <span className="ml-2 text-[10px] text-zinc-400">(system)</span>}
              </span>
              {!c.is_system && (
                <button onClick={() => deleteCat(c.id)} className="rounded p-1 hover:bg-red-50">
                  <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 text-red-500"><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              )}
            </div>
          ))}
        </div>

        {error && <p className="px-5 pb-2 text-xs text-red-600">{error}</p>}

        <div className="flex gap-2 border-t border-zinc-100 px-5 py-4">
          <input ref={inputRef} data-cat-name-input type="text" placeholder="New Category..."
            value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addCat(); }}
            className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
          <button onClick={addCat} disabled={saving || !newName.trim()}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
