'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  posSearchMedicines,
  createChallan,
  type PosSearchResult,
  DomainError,
} from '@shelfcure/api-client';
import { useHotkey } from '@shelfcure/hotkeys';
import { getSupabaseBrowserClient } from '../../../../../lib/supabase/client';
import { Button } from '../../../../../components/ui/button';
import { Alert } from '../../../../../components/form-fields';

interface Supplier {
  id: string;
  name: string;
  city: string;
  state: string;
  phone: string;
  gstin: string | null;
  is_active: boolean;
}

interface Props {
  storeId: string;
  initialSuppliers: Supplier[];
}

interface ChallanLine {
  key: string;
  medicine_id: string;
  medicine_name: string;
  received_quantity: number;
  purchase_rate: number;
  mrp: number;
  gst_percentage: number;
  batch_number: string;
  expiry_date: string;
}

function newKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nextYearEndISO() {
  return `${new Date().getFullYear() + 1}-12-31`;
}

function Hint({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      <kbd className="rounded border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px]">{k}</kbd>
      <span>{children}</span>
    </span>
  );
}

export function ChallanClient({ storeId, initialSuppliers }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [suppliers] = useState<Supplier[]>(initialSuppliers);
  const [supplierId, setSupplierId] = useState<string>(initialSuppliers[0]?.id ?? '');
  const [challanNumber, setChallanNumber] = useState('');
  const [challanDate, setChallanDate] = useState(todayISO());
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [notes, setNotes] = useState('');

  const [lines, setLines] = useState<ChallanLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // Per-line medicine search
  const [searchKey, setSearchKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PosSearchResult[]>([]);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (!searchKey) { setSearchResults([]); return; }
    const q = searchQuery.trim();
    if (!q) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const rows = await posSearchMedicines(supabase, storeId, q, 10);
        setSearchResults(rows);
        setHighlight(0);
      } catch { /* ignore */ }
    }, 180);
    return () => clearTimeout(t);
  }, [searchKey, searchQuery, storeId, supabase]);

  const addBlankLine = useCallback(() => {
    setLines((prev) => [
      ...prev,
      {
        key: newKey(),
        medicine_id: '',
        medicine_name: '',
        received_quantity: 1,
        purchase_rate: 0,
        mrp: 0,
        gst_percentage: 12,
        batch_number: '',
        expiry_date: nextYearEndISO(),
      },
    ]);
  }, []);

  function updateLine(key: string, patch: Partial<ChallanLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function pickMedicine(line: ChallanLine, r: PosSearchResult) {
    updateLine(line.key, {
      medicine_id: r.medicine_id,
      medicine_name: r.name,
      gst_percentage: Number(r.gst_percentage ?? r.default_gst_rate ?? 12),
      mrp: line.mrp || Number(r.mrp ?? 0),
      purchase_rate: line.purchase_rate || Number(r.mrp ?? 0) * 0.85,
    });
    setSearchKey(null);
    setSearchQuery('');
    setSearchResults([]);
  }

  function clearForm() {
    setLines([]);
    setChallanNumber('');
    setChallanDate(todayISO());
    setExpectedReturnDate('');
    setNotes('');
    setError(null);
    setLastSaved(null);
  }

  async function onSave() {
    setError(null);
    if (!supplierId) { setError('Pick a supplier first.'); return; }
    if (!challanNumber.trim()) { setError('Enter the challan number.'); return; }
    if (lines.length === 0) { setError('Add at least one line.'); return; }

    for (const [i, l] of lines.entries()) {
      if (!l.medicine_id) { setError(`Line ${i + 1}: pick a medicine.`); return; }
      if (l.received_quantity <= 0) { setError(`Line ${i + 1}: quantity must be > 0.`); return; }
      if (l.mrp <= 0) { setError(`Line ${i + 1}: MRP must be > 0.`); return; }
    }

    setSaving(true);
    try {
      const challanId = await createChallan(supabase, {
        store_id: storeId,
        supplier_id: supplierId,
        challan_number: challanNumber.trim(),
        challan_date: challanDate,
        expected_return_date: expectedReturnDate || null,
        notes: notes.trim() || null,
        items: lines.map((l) => ({
          medicine_id: l.medicine_id,
          batch_number: l.batch_number.trim() || undefined,
          expiry_date: l.expiry_date || undefined,
          received_quantity: l.received_quantity,
          purchase_rate: l.purchase_rate,
          mrp: l.mrp,
          gst_percentage: l.gst_percentage,
        })),
      });

      setLastSaved(challanNumber.trim());
      clearForm();
      router.push(`/dashboard/purchases/challans/${challanId}`);
    } catch (e) {
      const msg =
        e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Failed to save challan';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  useHotkey('F9', (e) => { e.preventDefault(); if (!saving) onSave(); }, [lines, saving, supplierId, challanNumber]);
  useHotkey('+', (e) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    e.preventDefault();
    addBlankLine();
  }, [addBlankLine]);

  if (suppliers.length === 0) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">Add a supplier first</h1>
        <Link href="/dashboard/suppliers" className="mt-6 inline-flex rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
          Go to Suppliers
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-amber-600">New challan</div>
          <div className="mt-0.5 text-sm font-semibold text-zinc-900">Delivery Challan — Provisional Stock</div>
        </div>
        <div className="hidden gap-4 text-xs text-zinc-600 sm:flex">
          <Hint k="+">Add line</Hint>
          <Hint k="F9">Save</Hint>
        </div>
      </div>

      {lastSaved && (
        <Alert variant="success">Challan #{lastSaved} saved. Stock is now available for sale.</Alert>
      )}
      {error && <Alert variant="error">{error}</Alert>}

      {/* Supplier + Challan details */}
      <div className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-zinc-600">Supplier *</label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-zinc-600">Challan Number *</label>
          <input
            type="text"
            value={challanNumber}
            onChange={(e) => setChallanNumber(e.target.value)}
            placeholder="e.g. DC-2025-001"
            className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-zinc-600">Challan Date *</label>
          <input
            type="date"
            value={challanDate}
            onChange={(e) => setChallanDate(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-zinc-600">Expected Return Date</label>
          <input
            type="date"
            value={expectedReturnDate}
            onChange={(e) => setExpectedReturnDate(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-zinc-600">Notes</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes about this challan"
            className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          />
        </div>
      </div>

      {/* Line items */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">Items ({lines.length})</h2>
          <button
            onClick={addBlankLine}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            Add line
          </button>
        </div>

        {lines.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400">No items yet. Click &quot;Add line&quot; or press + to start.</p>
        ) : (
          <div className="space-y-4">
            {lines.map((line, idx) => (
              <div key={line.key} className="rounded-xl border border-zinc-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-400">Line {idx + 1}</span>
                  <button
                    onClick={() => removeLine(line.key)}
                    className="rounded-lg p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>

                {/* Medicine search */}
                <div className="mb-3 relative">
                  <label className="mb-1 block text-xs font-medium text-zinc-500">Medicine *</label>
                  <input
                    type="text"
                    value={searchKey === line.key ? searchQuery : line.medicine_name}
                    onFocus={() => { setSearchKey(line.key); setSearchQuery(line.medicine_name); }}
                    onChange={(e) => {
                      setSearchKey(line.key);
                      setSearchQuery(e.target.value);
                      updateLine(line.key, { medicine_id: '', medicine_name: e.target.value });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, searchResults.length - 1)); }
                      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
                      if (e.key === 'Enter' && searchResults[highlight]) { pickMedicine(line, searchResults[highlight]!); }
                      if (e.key === 'Escape') { setSearchKey(null); setSearchResults([]); }
                    }}
                    placeholder="Type medicine name..."
                    className={`w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${
                      line.medicine_id
                        ? 'border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500/20'
                        : 'border-zinc-300 focus:border-amber-500 focus:ring-amber-500/20'
                    }`}
                  />
                  {searchKey === line.key && searchResults.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
                      {searchResults.map((r, i) => (
                        <button
                          key={r.medicine_id}
                          onMouseDown={() => pickMedicine(line, r)}
                          className={`flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-amber-50 ${i === highlight ? 'bg-amber-50' : ''}`}
                        >
                          <div>
                            <div className="font-medium text-zinc-900">{r.name}</div>
                            <div className="text-xs text-zinc-500">MRP ₹{r.mrp ?? '—'} · GST {r.gst_percentage ?? r.default_gst_rate ?? 12}%</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Numeric fields */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-500">Qty (Strips) *</label>
                    <input
                      type="number"
                      min={1}
                      value={line.received_quantity || ''}
                      onChange={(e) => updateLine(line.key, { received_quantity: Number(e.target.value) })}
                      className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-500">Purchase Rate</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={line.purchase_rate || ''}
                      onChange={(e) => updateLine(line.key, { purchase_rate: Number(e.target.value) })}
                      className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-500">MRP *</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={line.mrp || ''}
                      onChange={(e) => updateLine(line.key, { mrp: Number(e.target.value) })}
                      className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-500">GST %</label>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={line.gst_percentage}
                      onChange={(e) => updateLine(line.key, { gst_percentage: Number(e.target.value) })}
                      className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                </div>

                {/* Batch + Expiry */}
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-500">Batch No.</label>
                    <input
                      type="text"
                      value={line.batch_number}
                      onChange={(e) => updateLine(line.key, { batch_number: e.target.value })}
                      placeholder="Auto if blank"
                      className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-500">Expiry Date</label>
                    <input
                      type="date"
                      value={line.expiry_date}
                      onChange={(e) => updateLine(line.key, { expiry_date: e.target.value })}
                      className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-5 py-4 shadow-sm">
        <div className="text-sm text-zinc-500">
          {lines.length} item{lines.length !== 1 ? 's' : ''}
          {lines.length > 0 && (
            <span> · {lines.reduce((s, l) => s + l.received_quantity, 0)} total strips</span>
          )}
        </div>
        <div className="flex gap-3">
          <Button
            variant="ghost"
            onClick={() => router.push('/dashboard/purchases/challans')}
          >
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={saving}
            className="bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Challan (F9)'}
          </Button>
        </div>
      </div>
    </div>
  );
}
