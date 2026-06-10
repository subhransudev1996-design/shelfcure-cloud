'use client';

// Three-column Barcode Generator (WEB_PARITY_PLAN §2.5.10):
//   LEFT: searchable, medicine-grouped batch list with per-batch quantity spinner.
//   MIDDLE: LABEL SIZE picker · SHOW ON LABEL toggles · ACTIONS.
//   RIGHT: live label preview (capped at 6).

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listBatchesForBarcodes,
  saveBatchBarcodes,
  type BatchForBarcode,
} from '@shelfcure/api-client';
import {
  LABEL_SIZES,
  generateBatchQrData,
  generateLabelPrintHtml,
  printRawHtml,
  renderBarcodeToSvgString,
  renderQrSvgString,
  type LabelData,
  type LabelSize,
} from '@shelfcure/ui';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';

const TOGGLE_KEY = 'shelfcure.barcode.toggles.v1';
type ShowToggles = {
  name: boolean; code: boolean; mrp: boolean; expiry: boolean; qr: boolean;
};
const DEFAULT_TOGGLES: ShowToggles = { name: true, code: true, mrp: true, expiry: true, qr: false };

interface Props {
  storeId: string;
  medicineFilterId: string | null;
}

export function BarcodeGeneratorView({ storeId, medicineFilterId }: Props) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [batches, setBatches] = useState<BatchForBarcode[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Map<string, number>>(new Map()); // batch_id → qty
  const [size, setSize] = useState<LabelSize>('medium');
  const [toggles, setToggles] = useState<ShowToggles>(DEFAULT_TOGGLES);
  const [savedToast, setSavedToast] = useState<number | null>(null);
  const [savedAt, setSavedAt] = useState<number>(0);

  // Persisted toggles (per-device for v1, plan D5).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(TOGGLE_KEY);
      if (raw) setToggles({ ...DEFAULT_TOGGLES, ...JSON.parse(raw) });
    } catch {}
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(TOGGLE_KEY, JSON.stringify(toggles)); } catch {}
  }, [toggles]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setBatches(await listBatchesForBarcodes(supabase, { storeId, medicineId: medicineFilterId }));
    } finally { setLoading(false); }
  }, [supabase, storeId, medicineFilterId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Filter + group.
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? batches.filter((b) =>
          b.medicine_name.toLowerCase().includes(q) || b.batch_number.toLowerCase().includes(q))
      : batches;
    const m = new Map<string, { name: string; manufacturer: string; rows: BatchForBarcode[] }>();
    for (const b of filtered) {
      const g = m.get(b.medicine_id) ?? { name: b.medicine_name, manufacturer: b.manufacturer, rows: [] };
      g.rows.push(b); m.set(b.medicine_id, g);
    }
    return Array.from(m.entries()).map(([id, g]) => ({ medicine_id: id, ...g }));
  }, [batches, search]);

  const totalVisible = grouped.reduce((s, g) => s + g.rows.length, 0);
  const selectedCount = selected.size;
  const totalLabels = Array.from(selected.values()).reduce((a, b) => a + b, 0);
  const unsavedCount = useMemo(() => {
    let n = 0;
    for (const [id] of selected) {
      const b = batches.find((x) => x.batch_id === id);
      if (b && !b.batch_barcode) n += 1;
    }
    return n;
  }, [selected, batches]);

  function toggleBatch(b: BatchForBarcode) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(b.batch_id)) next.delete(b.batch_id);
      else next.set(b.batch_id, 1);
      return next;
    });
  }
  function setQty(id: string, qty: number) {
    setSelected((prev) => {
      const next = new Map(prev);
      next.set(id, Math.max(1, Math.min(qty, 999)));
      return next;
    });
  }
  function toggleMedicineGroup(rows: BatchForBarcode[]) {
    setSelected((prev) => {
      const next = new Map(prev);
      const allSelected = rows.every((r) => next.has(r.batch_id));
      if (allSelected) for (const r of rows) next.delete(r.batch_id);
      else for (const r of rows) if (!next.has(r.batch_id)) next.set(r.batch_id, 1);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelected((prev) => {
      if (prev.size === totalVisible) return new Map();
      const next = new Map<string, number>();
      for (const g of grouped) for (const r of g.rows) next.set(r.batch_id, prev.get(r.batch_id) ?? 1);
      return next;
    });
  }

  async function onSaveBarcodes() {
    if (selectedCount === 0) return;
    const targetIds = Array.from(selected.keys()).filter((id) => {
      const b = batches.find((x) => x.batch_id === id);
      return b && !b.batch_barcode;
    });
    if (targetIds.length === 0) return;
    const res = await saveBatchBarcodes(supabase, targetIds);
    setSavedToast(res.saved); setSavedAt(Date.now());
    await refresh();
    setTimeout(() => setSavedToast(null), 4000);
  }

  async function onPrint() {
    if (selectedCount === 0) return;
    const selectedBatches = batches.filter((b) => selected.has(b.batch_id));
    const labels: LabelData[] = await Promise.all(selectedBatches.map(async (b) => {
      let qrSvgString: string | undefined;
      if (toggles.qr) {
        qrSvgString = await renderQrSvgString(generateBatchQrData({
          batch_id: b.batch_id,
          medicine_id: b.medicine_id,
          medicine_name: b.medicine_name,
          batch_number: b.batch_number,
          expiry_date: b.expiry_date,
          mrp: b.mrp,
          gst_percentage: b.gst_percentage,
        }));
      }
      return {
        medicineName: b.medicine_name,
        barcodeValue: b.batch_barcode ?? '',
        mrp: b.mrp,
        expiryDate: b.expiry_date,
        quantity: selected.get(b.batch_id) ?? 1,
        showName: toggles.name,
        showBarcodeNumber: toggles.code,
        showMrp: toggles.mrp,
        showExpiry: toggles.expiry,
        qrSvgString,
      };
    }));
    printRawHtml(generateLabelPrintHtml(labels, size));
  }

  const previewBatches = batches.filter((b) => selected.has(b.batch_id)).slice(0, 6);
  const sizeCfg = LABEL_SIZES[size];

  return (
    <>
      {/* Header */}
      <div className="mb-5 flex items-start gap-3">
        <Link href="/dashboard/inventory" className="mt-1 rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-600 transition hover:bg-zinc-50" title="Back to inventory">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </Link>
        <div className="flex items-start gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5"><path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/></svg>
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Barcode Generator</h1>
            <p className="text-sm text-zinc-500">Select batches — labels print with batch-specific MRP and expiry.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[4fr_3fr_5fr]">
        {/* ── LEFT: select batches ─────────────────────────────── */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Select Batches</h2>
            <span className="ml-auto text-xs text-zinc-500">{selectedCount} selected</span>
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search medicine or batch no..."
            className="mb-3 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/15"
          />
          <label className="mb-2 flex cursor-pointer items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={totalVisible > 0 && selectedCount === totalVisible}
              onChange={toggleSelectAll}
              className="h-4 w-4 accent-emerald-600"
            />
            <span className="font-medium text-zinc-800">Select All ({totalVisible})</span>
          </label>

          {loading ? (
            <div className="py-8 text-center text-sm text-zinc-400">Loading…</div>
          ) : grouped.length === 0 ? (
            <div className="py-8 text-center text-sm text-zinc-400">
              {medicineFilterId ? 'No batches for this medicine.' : 'No batches with stock yet.'}
            </div>
          ) : (
            <ul className="max-h-[68vh] space-y-3 overflow-y-auto pr-1">
              {grouped.map((g) => {
                const allSelected = g.rows.every((r) => selected.has(r.batch_id));
                return (
                  <li key={g.medicine_id} className="rounded-xl border border-zinc-200 p-2.5">
                    <label className="flex cursor-pointer items-center gap-2 pb-2">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={() => toggleMedicineGroup(g.rows)}
                        className="h-4 w-4 accent-emerald-600"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-zinc-900">{g.name}</div>
                        <div className="text-[11px] text-zinc-500">{g.rows.length} batch{g.rows.length === 1 ? '' : 'es'}</div>
                      </div>
                    </label>
                    <ul className="space-y-1.5">
                      {g.rows.map((b) => {
                        const isSel = selected.has(b.batch_id);
                        return (
                          <li key={b.batch_id}
                            className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs transition ${isSel ? 'border-emerald-300 bg-emerald-50/40' : 'border-zinc-100 hover:bg-zinc-50'}`}
                          >
                            <input
                              type="checkbox"
                              checked={isSel}
                              onChange={() => toggleBatch(b)}
                              className="h-3.5 w-3.5 accent-emerald-600"
                            />
                            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
                              <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3"><path d="M3 7l9-4 9 4-9 4z M3 7v10l9 4 9-4V7" stroke="currentColor" strokeWidth="1.75"/></svg>
                              {b.batch_number}
                            </span>
                            <span className="text-zinc-500">Exp: {fmtMonthYear(b.expiry_date)}</span>
                            <span className="font-semibold text-zinc-800">₹{Number(b.mrp).toFixed(2)}</span>
                            <span className="text-zinc-500">Qty: {b.current_qty}</span>
                            {b.batch_barcode ? (
                              <span className="ml-auto inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                                <svg viewBox="0 0 24 24" fill="none" className="h-2.5 w-2.5"><path d="M5 12l5 5 9-12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                                {b.batch_barcode}
                              </span>
                            ) : (
                              <span className="ml-auto text-[10px] font-medium text-amber-700">not saved</span>
                            )}
                            {isSel && (
                              <div className="flex items-center gap-0.5 rounded-md border border-zinc-200 bg-white px-0.5">
                                <button type="button"
                                  onClick={() => setQty(b.batch_id, (selected.get(b.batch_id) ?? 1) - 1)}
                                  className="px-1 text-zinc-500 hover:text-zinc-800">−</button>
                                <input
                                  type="number" min={1} max={999}
                                  value={selected.get(b.batch_id) ?? 1}
                                  onChange={(e) => setQty(b.batch_id, Number(e.target.value) || 1)}
                                  className="w-9 border-none bg-transparent text-center text-xs focus:outline-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <button type="button"
                                  onClick={() => setQty(b.batch_id, (selected.get(b.batch_id) ?? 1) + 1)}
                                  className="px-1 text-zinc-500 hover:text-zinc-800">+</button>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── MIDDLE: size + toggles + actions ─────────────────── */}
        <section className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Label Size</h2>
            <div className="space-y-2">
              {(Object.keys(LABEL_SIZES) as LabelSize[]).map((k) => {
                const cfg = LABEL_SIZES[k];
                const active = size === k;
                return (
                  <button key={k} type="button" onClick={() => setSize(k)}
                    className={`block w-full rounded-xl border-2 px-3 py-2 text-left transition ${active ? 'border-indigo-500 bg-indigo-50/40' : 'border-zinc-200 hover:border-zinc-300'}`}
                  >
                    <div className="text-sm font-semibold text-zinc-900">{cfg.label}</div>
                    <div className="text-[11px] text-zinc-500">{cfg.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Show on Label</h2>
            <div className="space-y-2">
              <ToggleRow label="Medicine Name" value={toggles.name} onChange={(v) => setToggles((t) => ({ ...t, name: v }))} />
              <ToggleRow label="Barcode Number" value={toggles.code} onChange={(v) => setToggles((t) => ({ ...t, code: v }))} />
              <ToggleRow label="MRP (₹)" value={toggles.mrp} onChange={(v) => setToggles((t) => ({ ...t, mrp: v }))} />
              <ToggleRow label="Expiry Date" value={toggles.expiry} onChange={(v) => setToggles((t) => ({ ...t, expiry: v }))} />
              <ToggleRow label="QR Code (scan on mobile)" value={toggles.qr} onChange={(v) => setToggles((t) => ({ ...t, qr: v }))} />
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            {savedToast !== null && Date.now() - savedAt < 5000 && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M5 12l5 5 9-12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                {savedToast} barcode{savedToast === 1 ? '' : 's'} saved to batches!
              </div>
            )}
            <button type="button" onClick={onSaveBarcodes}
              disabled={selectedCount === 0 || unsavedCount === 0}
              className="mb-2 flex w-full items-center justify-between rounded-xl border-2 border-indigo-300 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span>Save Barcodes to Batches</span>
              <span className="text-xs font-normal text-indigo-500">({unsavedCount} unsaved)</span>
            </button>
            <button type="button" onClick={onPrint} disabled={selectedCount === 0}
              className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
            >Print {totalLabels} Label{totalLabels === 1 ? '' : 's'}</button>
            {selectedCount > 0 && (
              <p className="mt-2 text-center text-[11px] text-zinc-500">
                {sizeCfg.colsPerPage} per row · {sizeCfg.colsPerPage * sizeCfg.rowsPerPage} per A4 page
              </p>
            )}
          </div>
        </section>

        {/* ── RIGHT: live preview ──────────────────────────────── */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Label Preview</h2>
            {selectedCount > 6 && <span className="text-xs text-zinc-500">Showing 6 of {selectedCount}</span>}
          </div>
          {previewBatches.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 px-4 py-12 text-center">
              <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 text-zinc-300">
                <path d="M3 3h6v6H3z M15 3h6v6h-6z M3 15h6v6H3z M15 15h6v6h-6z" stroke="currentColor" strokeWidth="1.75"/>
              </svg>
              <p className="mt-2 text-sm font-medium text-zinc-600">Select batches from the list</p>
              <p className="text-xs text-zinc-400">Label previews will appear here</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {previewBatches.map((b) => (
                <PreviewLabel key={b.batch_id} batch={b} size={size} toggles={toggles} />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────────

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-50">
      <span className="text-zinc-700">{label}</span>
      <button type="button" onClick={() => onChange(!value)}
        className={`relative h-5 w-9 rounded-full transition ${value ? 'bg-emerald-600' : 'bg-zinc-300'}`}
        aria-pressed={value}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${value ? 'left-4' : 'left-0.5'}`} />
      </button>
    </label>
  );
}

function PreviewLabel({ batch, size, toggles }: { batch: BatchForBarcode; size: LabelSize; toggles: ShowToggles }) {
  const cfg = LABEL_SIZES[size];
  const [barcodeSvg, setBarcodeSvg] = useState('');
  const [qrSvg, setQrSvg] = useState('');

  useEffect(() => {
    if (!batch.batch_barcode) { setBarcodeSvg(''); return; }
    setBarcodeSvg(renderBarcodeToSvgString(batch.batch_barcode, {
      height: cfg.barcodeHeight, width: cfg.barcodeWidth, displayValue: false, margin: 0,
    }));
  }, [batch.batch_barcode, cfg.barcodeHeight, cfg.barcodeWidth]);

  useEffect(() => {
    let alive = true;
    if (!toggles.qr) { setQrSvg(''); return; }
    renderQrSvgString(generateBatchQrData({
      batch_id: batch.batch_id, medicine_id: batch.medicine_id, medicine_name: batch.medicine_name,
      batch_number: batch.batch_number, expiry_date: batch.expiry_date, mrp: batch.mrp,
      gst_percentage: batch.gst_percentage,
    })).then((s) => { if (alive) setQrSvg(s); });
    return () => { alive = false; };
  }, [toggles.qr, batch]);

  // Scale mm → px (≈ 3.78px/mm at 96dpi) but cap so the preview grid stays manageable.
  const scale = 2.4;
  return (
    <div
      className="flex flex-col items-center justify-center overflow-hidden rounded-md border border-zinc-300 bg-white text-[10px]"
      style={{ width: `${cfg.widthMm * scale}px`, height: `${cfg.heightMm * scale}px`, padding: `${1 * scale}px` }}
    >
      {toggles.name && (
        <div className="line-clamp-2 w-full text-center font-bold leading-tight" style={{ fontSize: `${cfg.nameFontSize}px` }}>
          {batch.medicine_name}
        </div>
      )}
      {barcodeSvg ? (
        <div className="flex w-full justify-center" dangerouslySetInnerHTML={{ __html: barcodeSvg }} />
      ) : (
        <div className="my-1 rounded border border-dashed border-zinc-300 px-2 py-1 text-[8px] text-zinc-400">NO BARCODE</div>
      )}
      {toggles.code && batch.batch_barcode && (
        <div className="font-mono" style={{ fontSize: `${cfg.fontSize}px` }}>{batch.batch_barcode}</div>
      )}
      {toggles.mrp && (
        <div className="font-bold" style={{ fontSize: `${cfg.fontSize}px` }}>MRP: ₹{Number(batch.mrp).toFixed(2)}</div>
      )}
      {toggles.expiry && (
        <div className="text-zinc-600" style={{ fontSize: `${cfg.fontSize - 1}px` }}>Exp: {fmtMonthYear(batch.expiry_date)}</div>
      )}
      {toggles.qr && qrSvg && (
        <div className="mt-0.5 h-10 w-10" dangerouslySetInnerHTML={{ __html: qrSvg }} />
      )}
    </div>
  );
}

function fmtMonthYear(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  } catch { return iso; }
}
