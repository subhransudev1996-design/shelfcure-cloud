'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addBatchManual,
  getMedicineDetail,
  listSuppliers,
  rpcStockCorrection,
  updateBatch,
  type DetailBatch,
  type MedicineDetail,
  type Supplier,
} from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import { Modal } from '../../../../components/ui/modal';
import { Button } from '../../../../components/ui/button';
import { Field, Alert } from '../../../../components/form-fields';

interface Props {
  storeId: string;
  initial: MedicineDetail;
  role: string;
}

export function DetailView({ storeId, initial, role }: Props) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  // UI is unconditionally permissive — RPCs enforce role checks server-side
  // (rpc_add_batch_manual, rpc_update_batch, rpc_stock_correction all require
  // super_admin / store_admin / pharmacist). The previous gate hid CTAs when
  // user_profiles row was missing or role was null.
  void role;
  const canEdit = true;

  const [detail, setDetail] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editBatch, setEditBatch] = useState<DetailBatch | null>(null);
  const [adjustBatch, setAdjustBatch] = useState<DetailBatch | null>(null);
  const [showAlts, setShowAlts] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const fresh = await getMedicineDetail(supabase, { medicineId: detail.medicine.id, storeId });
      setDetail(fresh);
    } finally { setRefreshing(false); }
  }, [supabase, detail.medicine.id, storeId]);

  // 'b' hotkey opens Add Batch (§2.5.8).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (!typing && e.key.toLowerCase() === 'b' && canEdit) {
        e.preventDefault(); setAddOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canEdit]);

  // Open add-stock modal when arriving via #add-stock anchor (Quick Adjust on list page).
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#add-stock' && canEdit) {
      setAddOpen(true);
      history.replaceState(null, '', window.location.pathname);
    }
  }, [canEdit]);

  const m = detail.medicine;
  const s = detail.stats;
  const lowStock = s.total_stock <= s.min_stock_level;
  const displayStock = displayStockValue(m, s.total_stock);
  const looseUnits = m.sale_unit_mode === 'both' && m.units_per_pack && m.units_per_pack > 1
    ? s.total_stock % m.units_per_pack : 0;

  return (
    <>
      {/* ── Header strip ─────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link
            href="/dashboard/inventory"
            className="mt-1 rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50"
            title="Back to inventory"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{m.name}</h1>
              {lowStock && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">Low stock</span>
              )}
              {s.near_expiry_count > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  {s.near_expiry_count} batch{s.near_expiry_count === 1 ? '' : 'es'} near expiry
                </span>
              )}
            </div>
            <div className="mt-1 text-sm text-zinc-500">
              {[m.salt_composition, m.dosage_form_name, m.strength, m.manufacturer].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} disabled={refreshing} className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50" title="Refresh">
            <svg viewBox="0 0 24 24" fill="none" className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <Link href={`/dashboard/inventory/barcodes?id=${m.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/></svg>
            Barcode
          </Link>
          {canEdit && (
            <>
              <Link href={`/dashboard/inventory/edit/${m.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50">
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M17 3l4 4-12 12H5v-4L17 3z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/></svg>
                Edit Details
              </Link>
              <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700">
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"/></svg>
                Add Stock
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Negative-stock auto-correction banner ────────────── */}
      <NegativeStockBanner detail={detail} canEdit={canEdit} onFixed={refresh} />

      {/* ── Stats row ─────────────────────────────────────────── */}
      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Total Stock"
          value={String(displayStock)}
          sub={looseUnits > 0 ? `${m.pack_unit} + ${looseUnits} units` : m.pack_unit}
          tone={lowStock ? 'rose' : 'emerald'}
        />
        <Stat label="Active Batches" value={String(s.active_batches)} sub="With stock on hand" />
        <Stat label="Near Expiry" value={String(s.near_expiry_count)} sub="≤ 90 days" tone={s.near_expiry_count > 0 ? 'amber' : undefined} />
        <Stat label="Min Stock Level" value={String(s.min_stock_level)} sub={`Reorder at ${m.reorder_level}`} />
      </section>

      {/* ── Two-column ────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        {/* Left — info card */}
        <aside className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Medicine Info</h3>
          <InfoRow label="Category" value={m.category_name ?? 'Uncategorized'} />
          <InfoRow label="Pack Unit" value={`${m.pack_unit} (${m.pack_size} per pack)`} />
          <InfoRow label="HSN Code" value={m.hsn_code ?? '—'} mono />
          <InfoRow label="Rack" value={m.rack_location ?? '—'} mono />
          <InfoRow
            label="Sale Mode"
            value={m.sale_unit_mode === 'both' && m.units_per_pack
              ? `Pack + Units (${m.units_per_pack}/pack)`
              : m.sale_unit_mode === 'pack_only' ? 'Pack Only' : 'Individual'}
          />
          <InfoRow label="Default GST" value={`${Number(m.default_gst_rate).toFixed(0)}%`} />
        </aside>

        {/* Right — batches table */}
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">Stock batches</h3>
              <p className="text-xs text-zinc-500">FEFO order — nearest-expiry sells first.</p>
            </div>
            <span className="text-xs text-zinc-500">{detail.batches.length} total</span>
          </div>
          {detail.batches.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm text-zinc-500">No batches yet.</p>
              {canEdit && <button onClick={() => setAddOpen(true)} className="mt-3 inline-flex rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">Add the first batch</button>}
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {detail.batches.map((b) => (
                <BatchRow
                  key={b.id}
                  batch={b}
                  medicine={m}
                  canEdit={canEdit}
                  onEdit={() => setEditBatch(b)}
                  onAdjust={() => setAdjustBatch(b)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ── Brand alternatives (desktop parity §2.5.8) ───────── */}
      {/* Renders whenever the current medicine has a salt_composition, even if
          no alternatives exist — desktop shows an empty state with guidance. */}
      {m.salt_composition ? (
        <section className="mt-5 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <button
            onClick={() => setShowAlts((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-4 transition hover:bg-zinc-50"
          >
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-indigo-500"><path d="M7 16l-4-4 4-4M17 8l4 4-4 4M3 12h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Brand Alternatives</h3>
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                {m.salt_composition}{m.strength ? ` · ${m.strength}` : ''}
              </span>
              <span className="text-[10px] font-bold text-zinc-400">
                {detail.alternatives.length} {detail.alternatives.length === 1 ? 'match' : 'matches'}
              </span>
            </div>
            <svg viewBox="0 0 24 24" fill="none" className={`h-4 w-4 text-zinc-400 transition-transform ${showAlts ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
          {showAlts && (detail.alternatives.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 border-t border-zinc-100 py-10 text-center text-zinc-400">
              <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-zinc-200"><path d="M7 16l-4-4 4-4M17 8l4 4-4 4M3 12h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <p className="text-sm font-medium text-zinc-500">No other brands with this salt composition</p>
              <p className="text-xs">Add more medicines with <span className="font-semibold">{m.salt_composition}</span> to see substitutes here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
              {detail.alternatives.map((a) => {
                const altFlexible = a.sale_unit_mode === 'both';
                const altUpp = a.units_per_pack ?? 1;
                const displayMrp = a.mrp != null ? (altFlexible && altUpp > 1 ? Number(a.mrp) * altUpp : Number(a.mrp)) : null;
                return (
                  <li key={a.id}>
                    <Link href={`/dashboard/inventory/${a.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-zinc-50">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-indigo-400"><path d="M3 7l9-4 9 4-9 4z M3 7v10l9 4 9-4V7" stroke="currentColor" strokeWidth="1.75"/></svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-zinc-900">{a.name}</div>
                        <div className="text-xs text-zinc-500">{[a.manufacturer, a.dosage_form_name].filter(Boolean).join(' · ')}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-bold text-indigo-600">{displayMrp != null ? `₹${displayMrp.toFixed(2)}` : '—'}</div>
                        {a.stock <= 0 ? (
                          <div className="text-[10px] font-bold text-rose-500">Out of stock</div>
                        ) : altFlexible && altUpp > 1 ? (
                          <div className="text-[10px] font-bold text-emerald-600">
                            {Math.floor(a.stock / altUpp)} Strips{a.stock % altUpp > 0 ? ` + ${a.stock % altUpp} units` : ''}
                          </div>
                        ) : (
                          <div className="text-[10px] font-bold text-emerald-600">{a.stock} in stock</div>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ))}
        </section>
      ) : (
        <section className="mt-5 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0 text-amber-600"><path d="M7 16l-4-4 4-4M17 8l4 4-4 4M3 12h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">Brand alternatives unavailable</p>
            <p className="text-xs text-amber-800">
              This medicine has no <strong>salt / composition</strong> set. Add it on the Edit Details page to enable generic-substitute lookup.
            </p>
          </div>
          <Link href={`/dashboard/inventory/edit/${m.id}`} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700">
            Add salt
          </Link>
        </section>
      )}

      {/* ── Modals ────────────────────────────────────────────── */}
      <AddBatchModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => { setAddOpen(false); refresh(); }}
        medicineId={m.id}
        storeId={storeId}
        defaultGst={Number(m.default_gst_rate)}
        isFlexible={m.sale_unit_mode === 'both' && (m.units_per_pack ?? 1) > 1}
        unitsPerPack={m.units_per_pack ?? 1}
        packUnit={m.pack_unit}
      />
      {editBatch && (
        <EditBatchModal
          open
          onClose={() => setEditBatch(null)}
          onSaved={() => { setEditBatch(null); refresh(); }}
          batch={editBatch}
        />
      )}
      {adjustBatch && (
        <AdjustModal
          open
          onClose={() => setAdjustBatch(null)}
          onSaved={() => { setAdjustBatch(null); refresh(); }}
          batch={adjustBatch}
        />
      )}
    </>
  );
}

// ──────────────────────────────────────────────────────────────

function Stat({
  label, value, sub, tone = 'zinc',
}: { label: string; value: string; sub?: string; tone?: 'zinc' | 'emerald' | 'amber' | 'rose' }) {
  const ring = tone === 'emerald' ? 'ring-emerald-200'
    : tone === 'amber' ? 'ring-amber-200'
    : tone === 'rose' ? 'ring-rose-200' : 'ring-zinc-200';
  const accent = tone === 'emerald' ? 'text-emerald-700'
    : tone === 'amber' ? 'text-amber-700'
    : tone === 'rose' ? 'text-rose-700' : 'text-zinc-700';
  return (
    <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ${ring}`}>
      <div className={`text-[10px] font-semibold uppercase tracking-wider ${accent}`}>{label}</div>
      <div className="mt-1 font-mono text-3xl font-bold tracking-tight text-zinc-900">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className={`text-right text-zinc-800 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

// ── Batch row (faithful port of MedicineDetail.tsx:702-879) ───
function BatchRow({
  batch: b, medicine: m, canEdit, onEdit, onAdjust,
}: {
  batch: DetailBatch;
  medicine: MedicineDetail['medicine'];
  canEdit: boolean;
  onEdit: () => void;
  onAdjust: () => void;
}) {
  const status = expiryStatus(b.days_to_expiry);
  const isFlexible = m.sale_unit_mode === 'both' && (m.units_per_pack ?? 1) > 1;
  const upp = m.units_per_pack ?? 1;
  const strips = isFlexible ? Math.floor(b.current_quantity / upp) : 0;
  const looseUnits = isFlexible ? b.current_quantity % upp : 0;

  return (
    <li className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-zinc-50 ${b.is_blocked ? 'opacity-50' : ''}`}>
      {/* Left status bar */}
      <span className={`h-12 w-1.5 shrink-0 rounded-full ${
        status === 'expired' ? 'bg-rose-500'
        : status === 'critical' ? 'bg-orange-500'
        : status === 'warning' ? 'bg-amber-400'
        : status === 'ok' ? 'bg-emerald-400'
        : 'bg-zinc-200'
      }`} />

      {/* Main column */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-extrabold text-zinc-900">Batch: {b.batch_number}</span>
          {b.supplier_name && (
            <span className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
              <svg viewBox="0 0 24 24" fill="none" className="h-2.5 w-2.5"><path d="M1 3h13v13H1z M14 8h4l3 3v5h-7z M5.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
              {b.supplier_name}
            </span>
          )}
          {b.is_blocked && (
            <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">BLOCKED</span>
          )}
          {b.current_quantity === 0 && !b.is_blocked && (
            <span className="rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold text-zinc-600">OUT OF STOCK</span>
          )}
          {status === 'expired' && (
            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">EXPIRED</span>
          )}
          {status === 'critical' && (
            <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">{b.days_to_expiry}d left</span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500">
          <span>Expiry: <strong className="text-zinc-700">{fmtMonth(b.expiry_date)}</strong></span>
          <span>MRP: <strong className="text-zinc-700">₹{Number(b.mrp).toFixed(2)}</strong></span>
          <span>Rate: <strong className="text-zinc-700">₹{Number(b.purchase_rate).toFixed(2)}</strong></span>
          {Number(b.gst_percentage) > 0 && <span>GST: <strong className="text-zinc-700">{Number(b.gst_percentage)}%</strong></span>}
          {b.selling_price != null && <span>Sell: <strong className="text-indigo-700">₹{Number(b.selling_price).toFixed(2)}</strong></span>}
          {b.batch_barcode && (
            <span className="rounded border border-indigo-100 bg-indigo-50 px-1.5 py-0.5 font-mono text-[10px] text-indigo-700">{b.batch_barcode}</span>
          )}
        </div>
      </div>

      {/* Stock count + inline actions */}
      <div className="shrink-0 text-right">
        {isFlexible ? (
          <>
            <p className={`text-lg font-extrabold ${b.current_quantity === 0 ? 'text-zinc-300' : strips < 2 ? 'text-rose-500' : 'text-zinc-900'}`}>{strips}</p>
            <p className="text-[10px] font-bold leading-tight text-zinc-400">Strips</p>
            {looseUnits > 0 && <p className="mt-0.5 text-[10px] font-bold leading-tight text-indigo-600">+ {looseUnits} units</p>}
          </>
        ) : (
          <>
            <p className={`text-lg font-extrabold ${b.current_quantity === 0 ? 'text-zinc-300' : b.current_quantity < 10 ? 'text-rose-500' : 'text-zinc-900'}`}>{b.current_quantity}</p>
            <p className="text-[10px] font-bold text-zinc-400">{m.pack_unit}s</p>
          </>
        )}
        {canEdit && !b.is_blocked && (
          <div className="mt-1 flex flex-col items-end gap-0.5">
            <button onClick={onEdit} className="text-[10px] font-bold text-zinc-500 hover:underline">Edit details</button>
            <button onClick={onAdjust} className="text-[10px] font-bold text-indigo-600 hover:underline">Adjust qty</button>
          </div>
        )}
      </div>
    </li>
  );
}

function expiryStatus(days: number | null): 'expired' | 'critical' | 'warning' | 'ok' | 'unknown' {
  if (days == null) return 'unknown';
  if (days < 0) return 'expired';
  if (days <= 30) return 'critical';
  if (days <= 90) return 'warning';
  return 'ok';
}

// ── Negative-stock banner (faithful port of MedicineDetail.tsx:639-677) ───
function NegativeStockBanner({
  detail, canEdit, onFixed,
}: { detail: MedicineDetail; canEdit: boolean; onFixed: () => void }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const total = detail.stats.total_stock;
  const [actualQty, setActualQty] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Reset when underlying stock changes (e.g. successful fix → server returns ≥ 0).
  useEffect(() => { if (total >= 0) setDone(false); }, [total]);

  if (total >= 0 && !done) return null;
  if (done && total >= 0) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-emerald-600"><path d="M5 12l5 5 9-12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        <p className="text-sm font-semibold text-emerald-800">Stock corrected successfully.</p>
      </div>
    );
  }

  async function fix() {
    if (!canEdit || actualQty === '') return;
    const target = Math.max(0, Math.floor(Number(actualQty)));
    // Sum non-blocked active batches (current_quantity > 0). The delta we apply
    // to the oldest non-blocked batch makes the total land at `target`.
    const positiveSum = detail.batches
      .filter((b) => !b.is_blocked && b.current_quantity > 0)
      .reduce((s, b) => s + b.current_quantity, 0);
    const oldest = [...detail.batches]
      .filter((b) => !b.is_blocked)
      .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date))[0];
    if (!oldest) { setError('No batch available to correct against.'); return; }
    const delta = target - positiveSum - oldest.current_quantity;
    setError(null); setSaving(true);
    try {
      await rpcStockCorrection(supabase, {
        batchId: oldest.id, delta,
        reason: `Negative-stock correction: set total to ${target}`,
      });
      setDone(true); setActualQty('');
      onFixed();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to correct stock');
    } finally { setSaving(false); }
  }

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
      <div className="flex items-start gap-2">
        <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 h-4 w-4 shrink-0 text-rose-500"><path d="M12 9v4M12 17h.01M10.3 3.86l-8.04 13.92A2 2 0 0 0 4 21h16a2 2 0 0 0 1.74-3.22L13.7 3.86a2 2 0 0 0-3.4 0z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
        <div>
          <p className="text-sm font-bold text-rose-700">Negative Stock Detected</p>
          <p className="mt-0.5 text-xs text-rose-600">
            This medicine has {Math.abs(total)} units in negative. Enter the actual quantity currently on your shelf to fix it.
          </p>
        </div>
      </div>
      {canEdit && (
        <div className="flex items-center gap-2">
          <input
            type="number" min={0} value={actualQty}
            onChange={(e) => setActualQty(e.target.value)}
            placeholder="Actual qty on shelf (0 if empty)"
            className="h-9 flex-1 rounded-lg border border-rose-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
          <button onClick={fix} disabled={saving || actualQty === ''} className="flex h-9 items-center gap-1.5 rounded-lg bg-rose-600 px-4 text-sm font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50">
            <svg viewBox="0 0 24 24" fill="none" className={`h-3.5 w-3.5 ${saving ? 'animate-spin' : ''}`}>
              {saving ? <path d="M21 12a9 9 0 1 1-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                      : <path d="M5 12l5 5 9-12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>}
            </svg>
            Fix Stock
          </button>
        </div>
      )}
      {error && <p className="text-xs font-medium text-rose-700">{error}</p>}
    </div>
  );
}

function fmtMonth(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  } catch { return iso; }
}

function displayStockValue(
  m: { sale_unit_mode: string; units_per_pack: number | null },
  total: number,
): number {
  if (m.sale_unit_mode === 'both' && m.units_per_pack && m.units_per_pack > 1) {
    return Math.floor(total / m.units_per_pack);
  }
  return total;
}

// ── Modals ────────────────────────────────────────────────────

function AddBatchModal({
  open, onClose, onSaved, medicineId, storeId, defaultGst, isFlexible, unitsPerPack, packUnit,
}: {
  open: boolean; onClose: () => void; onSaved: () => void;
  medicineId: string; storeId: string; defaultGst: number;
  isFlexible: boolean; unitsPerPack: number; packUnit: string;
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const oneYearOut = useMemo(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  }, []);
  const [form, setForm] = useState({
    batchNumber: '', expiryDate: oneYearOut, quantity: '',
    purchaseRate: '', mrp: '', sellingPrice: '', gst: String(defaultGst), barcode: '',
    supplierId: '',
  });

  useEffect(() => {
    if (open) {
      setForm({
        batchNumber: '', expiryDate: oneYearOut, quantity: '',
        purchaseRate: '', mrp: '', sellingPrice: '', gst: String(defaultGst), barcode: '',
        supplierId: '',
      });
      setError(null);
      listSuppliers(supabase, { storeId }).then(setSuppliers).catch(() => setSuppliers([]));
    }
  }, [open, oneYearOut, defaultGst, supabase, storeId]);

  // Ctrl+S submits.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        document.querySelector<HTMLFormElement>('[data-batch-form]')?.requestSubmit();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setLoading(true);
    try {
      const inputQty = Number(form.quantity) || 0;
      // Desktop parity (MedicineDetail.tsx:418): when flexible, user enters strips
      // but DB stores raw units. Multiply by upp.
      const storeQty = isFlexible ? inputQty * unitsPerPack : inputQty;
      await addBatchManual(supabase, {
        medicineId, storeId,
        input: {
          batchNumber: form.batchNumber.trim(),
          expiryDate: form.expiryDate,
          quantity: storeQty,
          purchaseRate: Number(form.purchaseRate) || 0,
          mrp: Number(form.mrp) || 0,
          sellingPrice: form.sellingPrice ? Number(form.sellingPrice) : null,
          gstPercentage: Number(form.gst) || 0,
          batchBarcode: form.barcode.trim() || null,
          supplierId: form.supplierId || null,
        },
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add batch');
    } finally { setLoading(false); }
  }

  const qtyLabel = isFlexible ? 'Quantity (Strips)' : `Quantity (${packUnit}s)`;
  const qtyHint = isFlexible && Number(form.quantity) > 0
    ? `= ${Number(form.quantity) * unitsPerPack} individual units stored`
    : undefined;

  return (
    <Modal open={open} onClose={onClose} title="Add stock batch" description="Records a new manufacturing lot for this medicine." maxWidth="xl"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={loading}>Add batch</Button>
      </>}>
      <form data-batch-form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Batch number" required autoFocus value={form.batchNumber} onChange={(e) => setForm((f) => ({ ...f, batchNumber: e.target.value }))} />
          <Field label="Expiry date" type="date" required value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} />
          <Field label={qtyLabel} type="number" min={0} required value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} hint={qtyHint} />
          <Field label="GST %" type="number" min={0} max={28} step={0.5} value={form.gst} onChange={(e) => setForm((f) => ({ ...f, gst: e.target.value }))} />
          <Field label="Purchase rate" type="number" min={0} step={0.01} required value={form.purchaseRate} onChange={(e) => setForm((f) => ({ ...f, purchaseRate: e.target.value }))} />
          <Field label="MRP" type="number" min={0} step={0.01} required value={form.mrp} onChange={(e) => setForm((f) => ({ ...f, mrp: e.target.value }))} />
          <Field label="Selling price" type="number" min={0} step={0.01} value={form.sellingPrice} onChange={(e) => setForm((f) => ({ ...f, sellingPrice: e.target.value }))} hint="Leave blank to use MRP" />
          <SupplierPicker value={form.supplierId} onChange={(v) => setForm((f) => ({ ...f, supplierId: v }))} suppliers={suppliers} />
        </div>
        <Field label="Batch barcode" value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} placeholder="Scan or type manufacturer barcode…" hint="Optional — lets the scanner app auto-identify this batch by scanning the box barcode." className="font-mono" />
        <div className="flex items-start gap-2 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs text-indigo-700">
          <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 h-4 w-4 shrink-0"><path d="M5 12l5 5 9-12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <span>Stock will be added directly. For invoice-linked purchases, use the <strong>Purchases</strong> module.</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-zinc-100 pt-2 text-[10px] text-zinc-500">
          {[['Tab', 'Next field'], ['Ctrl+S', 'Save batch'], ['Esc', 'Close']].map(([k, d]) => (
            <span key={k} className="flex items-center gap-1">
              <kbd className="rounded border border-zinc-200 bg-white px-1 py-0.5 font-mono text-[9px] font-bold text-zinc-700 shadow-sm">{k}</kbd>
              <span>{d}</span>
            </span>
          ))}
        </div>
        {error && <Alert variant="error">{error}</Alert>}
      </form>
    </Modal>
  );
}

// Searchable supplier dropdown — faithful port of MedicineDetail.tsx:1156-1212.
function SupplierPicker({
  value, onChange, suppliers,
}: { value: string; onChange: (v: string) => void; suppliers: Supplier[] }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function click(e: MouseEvent) { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', click);
    return () => document.removeEventListener('mousedown', click);
  }, []);

  const filtered = suppliers.filter((s) =>
    !search.trim() || s.name.toLowerCase().includes(search.toLowerCase()));
  const selected = suppliers.find((s) => s.id === value);

  return (
    <div ref={wrapRef} className="relative">
      <label className="mb-1.5 block text-sm font-medium text-zinc-800">
        Supplier <span className="text-zinc-400">(optional)</span>
      </label>
      <div
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm shadow-sm hover:border-zinc-400"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 shrink-0 text-zinc-400"><path d="M1 3h13v13H1z M14 8h4l3 3v5h-7z M5.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
        <span className={selected ? 'font-semibold text-zinc-900' : 'text-zinc-400'}>
          {selected ? selected.name : 'Select supplier…'}
        </span>
        {selected && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onChange(''); }} className="ml-auto text-zinc-400 hover:text-zinc-700">
            <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5"><path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        )}
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 flex max-h-56 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
          <div className="border-b border-zinc-100 p-2">
            <div className="flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-1.5">
              <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 text-zinc-400"><path d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              <input
                autoFocus value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search supplier…"
                className="flex-1 bg-transparent text-sm focus:outline-none"
              />
            </div>
          </div>
          <div className="overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="py-4 text-center text-xs text-zinc-400">No suppliers found</p>
            ) : filtered.map((s) => (
              <button
                key={s.id} type="button"
                onClick={() => { onChange(s.id); setOpen(false); setSearch(''); }}
                className="block w-full px-4 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-indigo-50"
              >
                {s.name}
                {s.phone && <span className="ml-2 text-xs text-zinc-400">{s.phone}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EditBatchModal({
  open, onClose, onSaved, batch,
}: { open: boolean; onClose: () => void; onSaved: () => void; batch: DetailBatch }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    batchNumber: batch.batch_number,
    expiryDate: batch.expiry_date,
    purchaseRate: String(batch.purchase_rate),
    mrp: String(batch.mrp),
    sellingPrice: batch.selling_price != null ? String(batch.selling_price) : '',
    gst: String(batch.gst_percentage),
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setLoading(true);
    try {
      await updateBatch(supabase, batch.id, {
        batchNumber: form.batchNumber.trim(),
        expiryDate: form.expiryDate,
        purchaseRate: Number(form.purchaseRate) || 0,
        mrp: Number(form.mrp) || 0,
        sellingPrice: form.sellingPrice ? Number(form.sellingPrice) : null,
        gstPercentage: Number(form.gst) || 0,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update batch');
    } finally { setLoading(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Edit batch ${batch.batch_number}`} description="Quantity is adjusted separately so it leaves an audit trail." maxWidth="lg"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={loading}>Save changes</Button>
      </>}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Batch number" required value={form.batchNumber} onChange={(e) => setForm((f) => ({ ...f, batchNumber: e.target.value }))} />
          <Field label="Expiry date" type="date" required value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} />
          <Field label="Purchase rate" type="number" min={0} step={0.01} value={form.purchaseRate} onChange={(e) => setForm((f) => ({ ...f, purchaseRate: e.target.value }))} />
          <Field label="MRP" type="number" min={0} step={0.01} value={form.mrp} onChange={(e) => setForm((f) => ({ ...f, mrp: e.target.value }))} />
          <Field label="Selling price" type="number" min={0} step={0.01} value={form.sellingPrice} onChange={(e) => setForm((f) => ({ ...f, sellingPrice: e.target.value }))} />
          <Field label="GST %" type="number" min={0} max={28} step={0.5} value={form.gst} onChange={(e) => setForm((f) => ({ ...f, gst: e.target.value }))} />
        </div>
        {error && <Alert variant="error">{error}</Alert>}
      </form>
    </Modal>
  );
}

function AdjustModal({
  open, onClose, onSaved, batch,
}: { open: boolean; onClose: () => void; onSaved: () => void; batch: DetailBatch }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('Damage');

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setLoading(true);
    try {
      await rpcStockCorrection(supabase, {
        batchId: batch.id, delta: Number(delta) || 0, reason: reason.trim() || 'Adjustment',
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to adjust');
    } finally { setLoading(false); }
  }

  const next = batch.current_quantity + (Number(delta) || 0);
  return (
    <Modal open={open} onClose={onClose} title={`Adjust ${batch.batch_number}`} description="Use positive numbers to add, negative to remove. Leaves an audit-log entry." maxWidth="md"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={loading} disabled={!delta || Number(delta) === 0}>Apply</Button>
      </>}>
      <form onSubmit={submit} className="space-y-3">
        <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-4 py-3 text-sm">
          <span className="text-zinc-600">Current quantity</span>
          <span className="font-mono text-lg font-semibold text-zinc-900">{batch.current_quantity}</span>
        </div>
        <Field
          label="Delta (+/-)"
          type="number"
          autoFocus
          required
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          hint={delta && Number(delta) !== 0 ? `New quantity will be ${next}` : 'Enter a positive or negative number'}
          error={next < 0 ? 'Quantity cannot go below 0' : undefined}
        />
        <Field label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} hint="e.g. Damage, Loss, Recount, Expiry write-off" />
        {error && <Alert variant="error">{error}</Alert>}
      </form>
    </Modal>
  );
}
