'use client';

/**
 * POS Phase C — Quick Access strip, Alt+1-9 hotkey manager, Brand Comparison.
 * Kept in a sibling file so the main pos-client.tsx stays scannable.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getMedicineDetail, posQuickAccess, posSearchMedicines, posToggleFavourite,
  posGetHotkeyGroups, posSetHotkeyName, posAddHotkeyMedicine,
  posRemoveHotkeyMedicine, posClearHotkeyGroup,
  type BrandAlternative, type PosQuickAccess, type PosSearchResult,
  type PosHotkeyGroup,
} from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import { Modal } from '../../../../components/ui/modal';
import { Button } from '../../../../components/ui/button';

// ── Quick Access strip ────────────────────────────────────────

type QuickSectionKey = keyof PosQuickAccess;
const SECTIONS: { key: QuickSectionKey; label: string; tone: string }[] = [
  { key: 'favorites',          label: 'Favorites',          tone: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
  { key: 'focused',            label: 'Focused',            tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  { key: 'frequently_bought',  label: 'Frequently bought',  tone: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
  { key: 'customer_medicines', label: 'Customer history',   tone: 'bg-violet-50 text-violet-800 border-violet-200' },
  { key: 'fast_moving_7d',     label: 'Fast moving (7d)',   tone: 'bg-sky-50 text-sky-800 border-sky-200' },
  { key: 'fast_moving_30d',    label: 'Fast moving (30d)',  tone: 'bg-cyan-50 text-cyan-800 border-cyan-200' },
  { key: 'high_margin',        label: 'High margin',        tone: 'bg-lime-50 text-lime-800 border-lime-200' },
  { key: 'near_expiry',        label: 'Near expiry',        tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  { key: 'overstock',          label: 'Overstock',          tone: 'bg-orange-50 text-orange-800 border-orange-200' },
];

interface QuickAccessProps {
  storeId: string;
  customerId: string | null;
  onAdd: (med: PosSearchResult) => void;
  // Pin-to-hotkey callback (Phase C): user can right-click or shift-click a
  // tile to assign it to Alt+1-9. Provided by the parent hotkey hook.
  onPin: (med: PosSearchResult) => void;
  refreshSignal?: unknown; // change this to force a refetch after a sale
}

export function QuickAccessStrip({ storeId, customerId, onAdd, onPin, refreshSignal }: QuickAccessProps) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [data, setData] = useState<PosQuickAccess | null>(null);
  const [activeSection, setActiveSection] = useState<QuickSectionKey>('favorites');
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await posQuickAccess(supabase, storeId, customerId, 12);
      setData(fresh);
    } finally { setLoading(false); }
  }, [supabase, storeId, customerId]);

  useEffect(() => { load(); }, [load, refreshSignal]);

  // If active section is empty after fetch, jump to the first non-empty section.
  useEffect(() => {
    if (!data) return;
    if ((data[activeSection] ?? []).length > 0) return;
    const first = SECTIONS.find((s) => (data[s.key] ?? []).length > 0);
    if (first) setActiveSection(first.key);
  }, [data, activeSection]);

  const tiles = data?.[activeSection] ?? [];

  async function onToggleFav(med: PosSearchResult, e: React.MouseEvent) {
    e.stopPropagation();
    const wasFav = (data?.favorites ?? []).some((m) => m.medicine_id === med.medicine_id);
    try {
      await posToggleFavourite(supabase, med.medicine_id, !wasFav);
      load();
    } catch {}
  }

  return (
    <section data-pos-section="quick-access" className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {SECTIONS.map((s) => {
            const count = data?.[s.key]?.length ?? 0;
            const isActive = s.key === activeSection;
            return (
              <button key={s.key} type="button" onClick={() => setActiveSection(s.key)} disabled={count === 0 && !isActive}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${
                  isActive ? s.tone : 'border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 disabled:opacity-40 disabled:hover:bg-white'
                }`}
              >{s.label} {count > 0 && <span className="opacity-70">{count}</span>}</button>
            );
          })}
        </div>
        <button onClick={() => setCollapsed((v) => !v)} className="rounded-md px-2 py-1 text-[11px] font-bold text-zinc-500 hover:bg-zinc-100">
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </div>
      {!collapsed && (
        <div className="p-3">
          {loading && tiles.length === 0 ? (
            <div className="py-4 text-center text-xs text-zinc-400">Loading…</div>
          ) : tiles.length === 0 ? (
            <div className="py-4 text-center text-xs text-zinc-400">
              {(activeSection === 'frequently_bought' || activeSection === 'customer_medicines') && !customerId
                ? 'Pick a customer to see their history.'
                : 'Nothing here yet.'}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {tiles.map((m) => {
                const inStock = (m.current_quantity ?? 0) > 0;
                const isFav = (data?.favorites ?? []).some((x) => x.medicine_id === m.medicine_id);
                return (
                  <div key={m.medicine_id}
                    onClick={() => inStock && onAdd(m)}
                    onContextMenu={(e) => { e.preventDefault(); onPin(m); }}
                    title={inStock ? 'Click to add · Right-click to pin to Alt+1-9' : 'Out of stock'}
                    className={`group relative rounded-lg border border-zinc-200 bg-white p-2 transition ${inStock ? 'cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/30' : 'opacity-50'}`}
                  >
                    <button
                      onClick={(e) => onToggleFav(m, e)}
                      title={isFav ? 'Unfavorite' : 'Favorite'}
                      className={`absolute right-1 top-1 rounded p-0.5 ${isFav ? 'text-yellow-500' : 'text-zinc-300 opacity-0 group-hover:opacity-100 hover:text-yellow-500'}`}
                    >
                      <svg viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} className="h-3.5 w-3.5"><path d="M12 2l3 7h7l-6 4 2 7-6-4-6 4 2-7-6-4h7z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/></svg>
                    </button>
                    <div className="pr-5 text-xs font-bold text-zinc-900 line-clamp-2">{m.name}</div>
                    <div className="mt-0.5 truncate text-[10px] text-zinc-500">
                      {m.manufacturer || '—'}
                      {m.expiry_date && ` · ${m.expiry_date.slice(0, 7)}`}
                    </div>
                    <div className="mt-1 flex items-baseline justify-between">
                      <span className="font-mono text-sm font-bold text-indigo-700">
                        ₹{Number(m.selling_price ?? m.mrp ?? 0).toFixed(2)}
                      </span>
                      <span className="text-[10px] font-bold text-zinc-400">
                        {inStock ? `${m.current_quantity}` : 'OOS'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── Alt+1-9 Hotkey GROUPS (server-backed, named, multi-medicine) ─────────────
//
// Faithful port of desktop POS.tsx hotkey manager (lines 4470-4678): each Alt+
// digit holds a NAMED GROUP of medicines (e.g. Alt+1 = "Fever Pack" containing
// Paracetamol + Cetirizine + Cough Syrup). Pressing Alt+digit bulk-adds every
// medicine in the group with its configured quantity.
//
// Persisted in `pos_hotkey_groups` + `pos_hotkey_group_items` (migration 0027).

export type HotkeyGroups = PosHotkeyGroup[];

/**
 * Loads the 9 hotkey groups from the server, binds Alt+1-9 globally, and
 * returns a refetch helper the modal calls after CRUD operations.
 *
 * Bulk-adds every item in the matched group on Alt+digit, respecting per-item
 * quantity. Uses capture-phase listener so the chord fires even when focus is
 * inside an input.
 */
export function useAltHotkeys(
  storeId: string,
  addByMedicineId: (medicineId: string, qty?: number) => void | Promise<void>,
) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [groups, setGroups] = useState<HotkeyGroups>([]);
  const groupsRef = useRef<HotkeyGroups>([]);
  groupsRef.current = groups;

  const refetch = useCallback(async () => {
    try { setGroups(await posGetHotkeyGroups(supabase, storeId)); }
    catch (e) { console.error('[pos] hotkey groups fetch failed', e); }
  }, [supabase, storeId]);

  useEffect(() => { refetch(); }, [refetch]);

  useEffect(() => {
    async function onKey(e: KeyboardEvent) {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (!/^[1-9]$/.test(e.key)) return;
      const digit = Number(e.key);
      const group = groupsRef.current.find((g) => g.digit === digit);
      if (!group || group.items.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      for (const it of group.items) {
        try { await addByMedicineId(it.medicine_id, it.quantity); }
        catch (err) { console.error('[pos] hotkey bulk-add failed', err); break; }
      }
    }
    // capture-phase to beat input handlers — matches desktop behavior
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [addByMedicineId]);

  return { groups, refetch };
}

interface HotkeyManagerProps {
  open: boolean;
  onClose: () => void;
  storeId: string;
  groups: HotkeyGroups;
  onChange: () => Promise<void> | void;
}

export function HotkeyManagerModal({ open, onClose, storeId, groups, onChange }: HotkeyManagerProps) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [assigningDigit, setAssigningDigit] = useState<number | null>(null);
  const [editingName, setEditingName] = useState<number | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<PosSearchResult[]>([]);

  useEffect(() => {
    if (assigningDigit === null) return;
    const q = search.trim();
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      try { setResults((await posSearchMedicines(supabase, storeId, q, 6))); }
      catch {}
    }, 180);
    return () => clearTimeout(t);
  }, [search, assigningDigit, supabase, storeId]);

  const populatedCount = groups.filter((g) => g.items.length > 0).length;

  async function saveName(digit: number) {
    await posSetHotkeyName(supabase, storeId, digit, nameDraft.trim());
    await onChange();
    setEditingName(null);
  }

  async function addMedicine(digit: number, medicineId: string) {
    await posAddHotkeyMedicine(supabase, storeId, digit, medicineId, 1);
    await onChange();
    setSearch(''); setResults([]);
  }

  async function removeMedicine(digit: number, medicineId: string) {
    await posRemoveHotkeyMedicine(supabase, storeId, digit, medicineId);
    await onChange();
  }

  async function clearGroup(digit: number) {
    await posClearHotkeyGroup(supabase, storeId, digit);
    await onChange();
    setAssigningDigit(null);
  }

  return (
    <Modal
      open={open}
      onClose={() => { onClose(); setAssigningDigit(null); setEditingName(null); setSearch(''); setResults([]); }}
      title="Quick Access Hotkeys"
      description={`Alt+1–9 bulk-adds every medicine in the group to the cart. ${populatedCount} group${populatedCount === 1 ? '' : 's'} set.`}
      maxWidth="xl"
      footer={<Button variant="ghost" onClick={onClose}>Close</Button>}
    >
      <ul className="space-y-2">
        {[1,2,3,4,5,6,7,8,9].map((digit) => {
          const group = groups.find((g) => g.digit === digit);
          const isExpanded = assigningDigit === digit;
          const isEditingName = editingName === digit;
          const populated = (group?.items.length ?? 0) > 0;

          return (
            <li key={digit} className={`overflow-hidden rounded-xl border-2 transition-all ${
              isExpanded ? 'border-violet-300' :
              populated ? 'border-emerald-100' :
              'border-dashed border-zinc-200'
            }`}>
              {/* ── Row header ── */}
              <div className={`flex items-center gap-3 p-3 ${
                isExpanded ? 'bg-violet-50/50' :
                populated ? 'bg-emerald-50/30' :
                'bg-zinc-50/50'
              }`}>
                <kbd className="flex h-8 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-800 font-mono text-[11px] font-bold text-white shadow-sm">
                  Alt+{digit}
                </kbd>
                <div className="min-w-0 flex-1">
                  {isEditingName ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveName(digit);
                          if (e.key === 'Escape') setEditingName(null);
                        }}
                        placeholder="Group name (e.g. Fever Pack)"
                        className="flex-1 rounded-lg border border-violet-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400"
                      />
                      <button onClick={() => saveName(digit)}
                        className="rounded-lg bg-violet-600 px-2 py-1 text-[10px] font-bold text-white"
                      >Save</button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditingName(digit); setNameDraft(group?.name ?? ''); }}
                      className="w-full text-left"
                    >
                      {group?.name
                        ? <span className="text-sm font-semibold text-zinc-800">{group.name}</span>
                        : <span className="text-xs italic text-zinc-400">Name this group…</span>}
                      {populated && (
                        <span className="ml-2 text-[10px] text-zinc-500">
                          {group!.items.length} medicine{group!.items.length === 1 ? '' : 's'}
                        </span>
                      )}
                    </button>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {populated && (
                    <button onClick={() => clearGroup(digit)}
                      className="rounded-lg border border-rose-100 px-2 py-1 text-[10px] font-bold text-rose-500 hover:bg-rose-50"
                    >Clear</button>
                  )}
                  <button
                    onClick={() => { setAssigningDigit(isExpanded ? null : digit); setSearch(''); setResults([]); }}
                    className={`rounded-lg border px-2 py-1 text-[10px] font-bold transition-colors ${
                      isExpanded
                        ? 'border-violet-600 bg-violet-600 text-white'
                        : 'border-violet-100 bg-violet-50 text-violet-600 hover:bg-violet-100'
                    }`}
                  >
                    {isExpanded ? 'Done' : populated ? 'Edit' : 'Add'}
                  </button>
                </div>
              </div>

              {/* ── Medicine list ── */}
              {populated && (
                <ul className="divide-y divide-zinc-50 border-t border-zinc-100">
                  {group!.items.map((it) => (
                    <li key={it.medicine_id} className="flex items-center gap-3 bg-white/60 px-3 py-2">
                      <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 shrink-0 text-zinc-300"><path d="M3 7l9-4 9 4-9 4z M3 7v10l9 4 9-4V7" stroke="currentColor" strokeWidth="1.75"/></svg>
                      <div className="min-w-0 flex-1">
                        <span className="truncate text-xs font-semibold text-zinc-700">{it.name}</span>
                        <span className="ml-2 text-[10px] text-zinc-500">
                          ₹{(it.mrp ?? 0).toFixed(0)} · {it.total_stock} in stock
                          {it.quantity > 1 && <> · <strong>qty {it.quantity}</strong></>}
                        </span>
                      </div>
                      {isExpanded && (
                        <button onClick={() => removeMedicine(digit, it.medicine_id)}
                          className="shrink-0 rounded-lg p-1 text-zinc-300 hover:bg-rose-50 hover:text-rose-500"
                        >
                          <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5"><path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* ── Search to add ── */}
              {isExpanded && (
                <div className="border-t border-zinc-100 bg-zinc-50/80 p-2.5">
                  <input autoFocus type="text" value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search medicine to add…"
                    className="w-full rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-300"
                  />
                  {results.length > 0 && (
                    <ul className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-violet-100 bg-white shadow-lg">
                      {results.map((med) => {
                        const alreadyAdded = group?.items.some((i) => i.medicine_id === med.medicine_id);
                        return (
                          <li key={med.medicine_id}>
                            <button
                              disabled={alreadyAdded}
                              onClick={() => !alreadyAdded && addMedicine(digit, med.medicine_id)}
                              className="flex w-full items-center gap-2 border-b border-zinc-50 px-3 py-2 text-left transition-colors last:border-0 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold text-zinc-800">{med.name}</p>
                                <p className="text-[10px] text-zinc-500">
                                  {med.manufacturer || '—'} · ₹{Number(med.selling_price ?? med.mrp ?? 0).toFixed(0)} · {med.current_quantity} in stock
                                </p>
                              </div>
                              {alreadyAdded
                                ? <span className="shrink-0 rounded bg-zinc-100 px-1 py-0.5 text-[9px] font-bold text-zinc-500">Added</span>
                                : <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 shrink-0 text-violet-500"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"/></svg>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-center text-[10px] text-zinc-400">
        Press <kbd className="rounded bg-zinc-200 px-1 font-mono text-[9px]">Alt + digit</kbd> on the POS screen to instantly add all medicines in that group to the cart.
      </p>
    </Modal>
  );
}

// ── Brand Comparison modal (lazy-loaded for a single cart line) ──

interface BrandComparisonProps {
  open: boolean;
  storeId: string;
  medicineId: string;
  medicineName: string;
  onClose: () => void;
  onSwitch: (alt: BrandAlternative) => void;
}

export function BrandComparisonModal({ open, storeId, medicineId, medicineName, onClose, onSwitch }: BrandComparisonProps) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(false);
  const [alts, setAlts] = useState<BrandAlternative[]>([]);
  const [salt, setSalt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true); setError(null);
    getMedicineDetail(supabase, { medicineId, storeId })
      .then((d) => { setSalt(d.medicine.salt_composition ?? null); setAlts(d.alternatives); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load alternatives'))
      .finally(() => setLoading(false));
  }, [open, supabase, medicineId, storeId]);

  return (
    <Modal open={open} onClose={onClose} title={`Brand alternatives — ${medicineName}`}
      description={salt ? `Other brands with salt: ${salt}` : 'Looking up generic substitutes…'}
      maxWidth="xl"
      footer={<Button variant="ghost" onClick={onClose}>Close</Button>}
    >
      {loading && <div className="py-8 text-center text-sm text-zinc-400">Loading…</div>}
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {!loading && alts.length === 0 && (
        <div className="py-8 text-center text-sm text-zinc-400">No other brands with this salt composition.</div>
      )}
      {alts.length > 0 && (
        <ul className="max-h-96 divide-y divide-zinc-100 overflow-y-auto rounded-xl border border-zinc-200">
          {alts.map((a) => {
            const flex = a.sale_unit_mode === 'both';
            const upp = a.units_per_pack ?? 1;
            const displayMrp = a.mrp != null ? (flex && upp > 1 ? Number(a.mrp) * upp : Number(a.mrp)) : null;
            const inStock = a.stock > 0;
            return (
              <li key={a.id}
                onClick={() => inStock && onSwitch(a)}
                className={`flex items-center gap-3 px-4 py-3 ${inStock ? 'cursor-pointer hover:bg-emerald-50' : 'opacity-60'}`}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-indigo-400"><path d="M3 7l9-4 9 4-9 4z M3 7v10l9 4 9-4V7" stroke="currentColor" strokeWidth="1.75"/></svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-zinc-900">{a.name}</div>
                  <div className="text-xs text-zinc-500">{[a.manufacturer, a.dosage_form_name, a.strength].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-bold text-indigo-700">{displayMrp != null ? `₹${displayMrp.toFixed(2)}` : '—'}</div>
                  {!inStock
                    ? <div className="text-[10px] font-bold text-rose-500">Out of stock</div>
                    : flex && upp > 1
                      ? <div className="text-[10px] font-bold text-emerald-600">{Math.floor(a.stock / upp)} Strips</div>
                      : <div className="text-[10px] font-bold text-emerald-600">{a.stock} in stock</div>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

// ── Wedge-scanner detection ──────────────────────────────────

/**
 * Detects barcode-scanner input via keystroke rate. Real scanners type the
 * full code in < 50 ms (10+ chars/sec). When detected, suppress the search
 * dropdown so the cashier doesn't see autocomplete flicker mid-scan.
 *
 * Returns `[isScanning, register]` — call `register(e)` from your search
 * input's onKeyDown to update the detection state.
 */
export function useWedgeScannerDetection() {
  const [isScanning, setIsScanning] = useState(false);
  const lastKeyAt = useRef(0);
  const rateChars = useRef(0);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const register = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const now = performance.now();
    const dt = now - lastKeyAt.current;
    lastKeyAt.current = now;

    // Skip non-character keys (arrows / shift / tab) — scanners don't send them
    // mid-burst, so they're a strong signal the human is editing.
    if (e.key.length !== 1) {
      if (isScanning) setIsScanning(false);
      rateChars.current = 0;
      return;
    }

    if (dt < 30) rateChars.current += 1; else rateChars.current = 1;
    if (rateChars.current >= 5 && !isScanning) setIsScanning(true);

    // After 200 ms of silence, scanner burst is done — re-enable autocomplete.
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => {
      setIsScanning(false);
      rateChars.current = 0;
    }, 200);
  }, [isScanning]);

  return [isScanning, register] as const;
}
