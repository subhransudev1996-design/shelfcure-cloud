'use client';

// Shared form used by both /dashboard/inventory/add and /edit/[id].
// Implements WEB_PARITY_PLAN §2.5.9: 4 sectioned cards (basic / sale / classification
// / alerts) + sticky right preview + master-medicine autocomplete + rack composer
// + inline category create + keyboard shortcuts (Ctrl+S, Alt+←/→, Esc).

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createCategory,
  createMedicine,
  listCategories,
  searchMasterMedicines,
  updateMedicine,
  type DosageForm,
  type MasterMedicine,
  type MedicineCategory,
} from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import { Field, Alert } from '../../../../components/form-fields';
import { Button } from '../../../../components/ui/button';

const MASTER_RACKS = ['A', 'B', 'C', 'D', 'E', 'F', 'REF', 'OTC'] as const;
const SHELVES = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;
const GST_OPTIONS = [
  { value: 0, label: '0% (Exempt)' },
  { value: 5, label: '5%' },
  { value: 12, label: '12%' },
  { value: 18, label: '18%' },
  { value: 28, label: '28%' },
];

export interface MedicineFormInitial {
  id?: string;
  store_id?: string | null;
  name?: string;
  salt_composition?: string | null;
  manufacturer?: string;
  dosage_form_id?: string;
  strength?: string | null;
  pack_size?: number;
  pack_unit?: string;
  units_per_pack?: number | null;
  sale_unit_mode?: 'individual' | 'pack_only' | 'both';
  category_id?: string | null;
  rack_location?: string | null;
  hsn_code?: string | null;
  default_gst_rate?: number;
  min_stock_level?: number;
  reorder_level?: number;
  hasStock?: boolean;
}

interface Props {
  mode: 'create' | 'edit';
  dosageForms: DosageForm[];
  initialCategories: MedicineCategory[];
  initial?: MedicineFormInitial;
  storeId: string | null;
}

interface FormState {
  name: string;
  salt: string;
  manufacturer: string;
  dosageFormId: string;
  strength: string;
  packUnit: string;
  packSize: string;
  saleMode: 'pack_only' | 'both';
  unitsPerPack: string;
  masterRack: string;
  shelf: string;
  customRack: string;
  customShelf: string;
  hsn: string;
  gst: string;
  categoryId: string;
  minStock: string;
  reorder: string;
}

export function MedicineForm({ mode, dosageForms, initialCategories, initial, storeId }: Props) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();

  // Decompose rack_location (e.g. "A-3" → master "A" + shelf "3").
  const decomposed = useMemo(() => {
    const raw = (initial?.rack_location ?? '').trim();
    if (!raw) return { masterRack: '', shelf: '', customRack: '', customShelf: '' };
    const [master = '', shelf = ''] = raw.split('-');
    const isStdMaster = (MASTER_RACKS as readonly string[]).includes(master.toUpperCase());
    const isStdShelf = (SHELVES as readonly string[]).includes(shelf);
    return {
      masterRack: isStdMaster ? master.toUpperCase() : '',
      shelf: isStdShelf ? shelf : '',
      customRack: isStdMaster ? '' : master,
      customShelf: isStdShelf ? '' : shelf,
    };
  }, [initial?.rack_location]);

  const [form, setForm] = useState<FormState>({
    name: initial?.name ?? '',
    salt: initial?.salt_composition ?? '',
    manufacturer: initial?.manufacturer ?? '',
    dosageFormId: initial?.dosage_form_id ?? (dosageForms.find((d) => d.name === 'Tablet')?.id ?? dosageForms[0]?.id ?? ''),
    strength: initial?.strength ?? '',
    packUnit: initial?.pack_unit ?? 'Strip',
    packSize: String(initial?.pack_size ?? 10),
    saleMode: initial?.sale_unit_mode === 'both' ? 'both' : 'pack_only',
    unitsPerPack: String(initial?.units_per_pack ?? initial?.pack_size ?? 10),
    masterRack: decomposed.masterRack,
    shelf: decomposed.shelf,
    customRack: decomposed.customRack,
    customShelf: decomposed.customShelf,
    hsn: initial?.hsn_code ?? '',
    gst: String(initial?.default_gst_rate ?? 12),
    categoryId: initial?.category_id ?? '',
    minStock: String(initial?.min_stock_level ?? 10),
    reorder: String(initial?.reorder_level ?? 20),
  });

  const [categories, setCategories] = useState(initialCategories);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);

  const setF = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  }, []);

  const hasStock = !!initial?.hasStock;
  const saleConfigLocked = mode === 'edit' && hasStock;

  // Desktop parity (AddMedicine.tsx:227, :775): Sale Configuration only shows for
  // Tablet / Capsule. All other forms (Syrup, Bottle, Drops, Cream, Injection…)
  // are inherently single-unit and don't get a pack/unit choice.
  const selectedFormName = useMemo(
    () => dosageForms.find((d) => d.id === form.dosageFormId)?.name ?? '',
    [dosageForms, form.dosageFormId],
  );
  const isTabOrCap = useMemo(
    () => ['tablet', 'capsule'].includes(selectedFormName.toLowerCase()),
    [selectedFormName],
  );

  // Desktop parity (AddMedicine.tsx:735-742): picking a dosage form auto-applies
  // sane pack defaults. User can override afterwards.
  const onDosageFormChange = useCallback((id: string) => {
    const dfName = dosageForms.find((d) => d.id === id)?.name ?? '';
    const isTC = ['tablet', 'capsule'].includes(dfName.toLowerCase());
    setForm((f) => ({
      ...f,
      dosageFormId: id,
      packUnit: dfName || f.packUnit,
      packSize: isTC ? '10' : '1',
      // If switching AWAY from tab/cap, force pack-only so the hidden state can't
      // smuggle a stale 'both' into the submit payload.
      saleMode: isTC ? f.saleMode : 'pack_only',
    }));
    setDirty(true);
  }, [dosageForms]);

  // ── Keyboard: Ctrl+S, Alt+arrows, Esc-with-dirty-check ──
  // Reset each render so a hidden Section 2 (non tab/cap) drops out of the walker.
  const sectionRefs = useRef<HTMLElement[]>([]);
  sectionRefs.current = [];
  const collectRef = (el: HTMLElement | null) => { if (el) sectionRefs.current.push(el); };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        formRef.current?.requestSubmit();
        return;
      }
      if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        const sections = sectionRefs.current.filter(Boolean);
        const focused = document.activeElement as HTMLElement | null;
        const currentIdx = sections.findIndex((s) => s.contains(focused));
        const nextIdx = e.key === 'ArrowRight'
          ? Math.min((currentIdx === -1 ? 0 : currentIdx) + 1, sections.length - 1)
          : Math.max((currentIdx === -1 ? 0 : currentIdx) - 1, 0);
        const target = sections[nextIdx];
        target?.querySelector<HTMLElement>('input, select, button:not([disabled])')?.focus();
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (e.key === 'Escape') {
        const popoverOpen = !!document.querySelector('[data-popover-open]');
        if (popoverOpen) return; // popover handles its own Esc
        if (dirty && !confirm('Discard your changes?')) return;
        router.push(initial?.id ? `/dashboard/inventory/${initial.id}` : '/dashboard/inventory');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, router, initial?.id]);

  // ── Computed rack_location ──
  const composedRack = useMemo(() => {
    const master = (form.customRack || form.masterRack).trim().toUpperCase();
    const shelf = (form.customShelf || form.shelf).trim();
    if (!master) return null;
    return shelf ? `${master}-${shelf}` : master;
  }, [form.masterRack, form.shelf, form.customRack, form.customShelf]);

  const formRef = useRef<HTMLFormElement>(null);
  const canSave = form.name.trim().length > 0 && !!form.dosageFormId;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setError(null); setSubmitting(true);
    try {
      if (mode === 'create') {
        const m = await createMedicine(supabase, {
          storeId,
          name: form.name.trim(),
          saltComposition: form.salt.trim(),
          manufacturer: form.manufacturer.trim(),
          dosageFormId: form.dosageFormId,
          strength: form.strength.trim(),
          packSize: Number(form.packSize) || 1,
          packUnit: form.packUnit.trim() || 'Strip',
          unitsPerPack: isTabOrCap && form.saleMode === 'both' ? Number(form.unitsPerPack) || null : null,
          saleUnitMode: isTabOrCap ? form.saleMode : 'pack_only',
          defaultGstRate: Number(form.gst) || 0,
          hsnCode: form.hsn.trim(),
          reorderLevel: Number(form.reorder) || 20,
          minStockLevel: Number(form.minStock) || 10,
        });
        // categoryId + rackLocation aren't on createMedicine; patch via update.
        if (form.categoryId || composedRack) {
          await updateMedicine(supabase, m.id, {
            categoryId: form.categoryId || null,
            rackLocation: composedRack,
          });
        }
        router.push(`/dashboard/inventory/${m.id}`);
      } else if (initial?.id) {
        await updateMedicine(supabase, initial.id, {
          name: form.name.trim(),
          saltComposition: form.salt.trim() || null,
          manufacturer: form.manufacturer.trim(),
          dosageFormId: form.dosageFormId,
          strength: form.strength.trim() || null,
          packSize: Number(form.packSize) || 1,
          packUnit: form.packUnit.trim() || 'Strip',
          unitsPerPack: isTabOrCap && form.saleMode === 'both' ? Number(form.unitsPerPack) || null : null,
          saleUnitMode: isTabOrCap ? form.saleMode : 'pack_only',
          categoryId: form.categoryId || null,
          rackLocation: composedRack,
          hsnCode: form.hsn.trim() || null,
          defaultGstRate: Number(form.gst) || 0,
          minStockLevel: Number(form.minStock) || 10,
          reorderLevel: Number(form.reorder) || 20,
        });
        router.push(`/dashboard/inventory/${initial.id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally { setSubmitting(false); }
  }

  function fillFromMaster(mm: MasterMedicine) {
    const matchForm = dosageForms.find((d) => d.name.toLowerCase() === (mm.dosage_form ?? '').toLowerCase());
    setForm((f) => ({
      ...f,
      name: mm.name,
      salt: mm.salt_composition ?? f.salt,
      manufacturer: mm.manufacturer ?? f.manufacturer,
      strength: mm.strength ?? f.strength,
      packUnit: mm.pack_unit ?? f.packUnit,
      packSize: mm.pack_size != null ? String(mm.pack_size) : f.packSize,
      unitsPerPack: mm.units_per_pack != null ? String(mm.units_per_pack) : f.unitsPerPack,
      hsn: mm.hsn_code ?? f.hsn,
      gst: mm.default_gst_rate != null ? String(mm.default_gst_rate) : f.gst,
      dosageFormId: matchForm?.id ?? f.dosageFormId,
    }));
    setDirty(true);
  }

  async function onCreateCategory(name: string) {
    const c = await createCategory(supabase, { name, storeId: storeId ?? null });
    const fresh = await listCategories(supabase, storeId ?? null);
    setCategories(fresh);
    setForm((f) => ({ ...f, categoryId: c.id }));
    setDirty(true);
  }

  const headerTitle = mode === 'create' ? 'Add New Medicine' : 'Edit Medicine';
  const headerSub = mode === 'create' ? 'Create a new entry in your medicine master' : 'Update this medicine\'s details';

  return (
    <form ref={formRef} onSubmit={onSubmit}>
      {/* Header */}
      <div className="mb-5 flex items-start gap-3">
        <Link href="/dashboard/inventory" className="mt-1 rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-600 transition hover:bg-zinc-50" title="Back to inventory">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{headerTitle}</h1>
          <p className="text-sm text-zinc-500">{headerSub}</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* ── Left column — form sections ─────────────────────── */}
        <div className="space-y-4">
          {/* Section 1: Basic Information */}
          <SectionCard
            ref={collectRef}
            section="basic"
            icon={<svg viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="2"/></svg>}
            iconBg="bg-indigo-100 text-indigo-700"
            title="Basic Information"
          >
            <MasterMedicineField
              value={form.name}
              onChange={(v) => setF('name', v)}
              onPick={fillFromMaster}
            />
            <Field label="Salt / Composition" placeholder="e.g. Paracetamol, Amoxicillin + Clavulanic Acid"
              value={form.salt} onChange={(e) => setF('salt', e.target.value)} />
            <Field label="Manufacturer" placeholder="e.g. Cipla, Sun Pharma"
              value={form.manufacturer} onChange={(e) => setF('manufacturer', e.target.value)} />
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <span className="font-semibold">Why this matters:</span> The salt/composition identifies generic substitutes (Paracetamol = Crocin = Dolo), prevents duplicate entries under different brand names, and powers drug-interaction warnings. Fill it.
            </div>
            <Field label="Strength / Concentration" placeholder="e.g. 500mg, 10mg/5ml"
              value={form.strength} onChange={(e) => setF('strength', e.target.value)} />
            <div className="grid gap-3 sm:grid-cols-3">
              <SelectField label="Dosage Form" required value={form.dosageFormId} onChange={onDosageFormChange}
                options={dosageForms.map((d) => ({ value: d.id, label: d.name }))} />
              <Field label="Pack Unit" value={form.packUnit} onChange={(e) => setF('packUnit', e.target.value)} />
              <Field label="Pack Size" type="number" min={1} value={form.packSize} onChange={(e) => setF('packSize', e.target.value)} />
            </div>
          </SectionCard>

          {/* Section 2: Sale Configuration — only for Tablet / Capsule (desktop parity) */}
          {isTabOrCap && (
          <SectionCard
            ref={collectRef}
            section="sale"
            icon={<svg viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2"/></svg>}
            iconBg="bg-indigo-100 text-indigo-700"
            title="Sale Configuration"
          >
            <div className={`relative grid gap-3 sm:grid-cols-2 ${saleConfigLocked ? 'pointer-events-none opacity-40' : ''}`}>
              <SaleModeCard
                title={`Pack Only (${form.packUnit || 'Strip'})`}
                description="Sold in complete packs only."
                active={form.saleMode === 'pack_only'}
                onClick={() => setF('saleMode', 'pack_only')}
              />
              <SaleModeCard
                title={`Flexible (Unit / ${form.packUnit || 'Strip'})`}
                description="Can sell individual units or full packs."
                active={form.saleMode === 'both'}
                onClick={() => setF('saleMode', 'both')}
              >
                {form.saleMode === 'both' && (
                  <div className="mt-2">
                    <label className="block text-xs font-medium text-zinc-700">Units per Pack</label>
                    <input type="number" min={1} value={form.unitsPerPack}
                      onChange={(e) => setF('unitsPerPack', e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
                    />
                  </div>
                )}
              </SaleModeCard>
            </div>
            {saleConfigLocked && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                Sale configuration is locked because stock exists for this medicine. Changing pack/unit math mid-flight would corrupt stock totals.
              </div>
            )}
          </SectionCard>
          )}

          {/* Section 3: Classification & Storage */}
          <SectionCard
            ref={collectRef}
            section="classification"
            icon={<svg viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M3 7h7v7H3zM14 7h7v7h-7zM3 18h7v3H3zM14 18h7v3h-7z" stroke="currentColor" strokeWidth="1.75"/></svg>}
            iconBg="bg-emerald-100 text-emerald-700"
            title="Classification & Storage"
          >
            <div className="space-y-2.5 rounded-xl bg-slate-50 p-3">
              <div>
                <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-slate-500">Master Rack</div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {MASTER_RACKS.map((r) => (
                    <button key={r} type="button"
                      onClick={() => { setF('masterRack', form.masterRack === r ? '' : r); setF('customRack', ''); }}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${form.masterRack === r ? 'bg-emerald-600 text-white' : 'bg-white text-zinc-700 hover:bg-zinc-100'}`}
                    >{r}</button>
                  ))}
                  <input value={form.customRack} maxLength={6}
                    onChange={(e) => { setF('customRack', e.target.value.toUpperCase()); setF('masterRack', ''); }}
                    placeholder="Custom"
                    className="w-20 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs uppercase placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
              {(form.masterRack || form.customRack) && (
                <div>
                  <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-slate-500">Shelf / Slave Position</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {SHELVES.map((s) => (
                      <button key={s} type="button"
                        onClick={() => { setF('shelf', form.shelf === s ? '' : s); setF('customShelf', ''); }}
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${form.shelf === s ? 'bg-emerald-600 text-white' : 'bg-white text-zinc-700 hover:bg-zinc-100'}`}
                      >{s}</button>
                    ))}
                    <input value={form.customShelf} maxLength={4}
                      onChange={(e) => { setF('customShelf', e.target.value); setF('shelf', ''); }}
                      placeholder="#"
                      className="w-14 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="HSN Code" placeholder="e.g. 3004" maxLength={8} inputMode="numeric"
                value={form.hsn} onChange={(e) => setF('hsn', e.target.value)} />
              <SelectField label="Default GST Rate" value={form.gst} onChange={(v) => setF('gst', v)}
                options={GST_OPTIONS.map((g) => ({ value: String(g.value), label: g.label }))} />
            </div>
            <CategoryField
              value={form.categoryId}
              onChange={(v) => setF('categoryId', v)}
              categories={categories}
              onCreate={onCreateCategory}
            />
          </SectionCard>

          {/* Section 4: Alert Settings */}
          <SectionCard
            ref={collectRef}
            section="alerts"
            icon={<svg viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M12 3l8 4v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V7l8-4z M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/></svg>}
            iconBg="bg-orange-100 text-orange-700"
            title="Alert Settings"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Min Stock Level" type="number" min={0} value={form.minStock}
                onChange={(e) => setF('minStock', e.target.value)}
                hint="Used by low-stock alerts on the dashboard." />
              <Field label="Reorder Level" type="number" min={0} value={form.reorder}
                onChange={(e) => setF('reorder', e.target.value)}
                hint="Used by reorder suggestions in Purchases." />
            </div>
          </SectionCard>

          {error && <Alert variant="error">{error}</Alert>}
        </div>

        {/* ── Right sidebar — sticky ───────────────────────────── */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              Preview
            </div>
            <dl className="space-y-1.5 text-sm">
              <PreviewRow label="Name" value={form.name} />
              <PreviewRow label="Salt" value={form.salt} />
              <PreviewRow label="Manufacturer" value={form.manufacturer} />
              <PreviewRow label="Form" value={dosageForms.find((d) => d.id === form.dosageFormId)?.name ?? ''} />
              <PreviewRow label="Strength" value={form.strength} />
              <PreviewRow
                label="Unit"
                value={isTabOrCap && form.saleMode === 'both' ? `${form.packUnit} + Units` : form.packUnit}
              />
              <PreviewRow label="Rack" value={composedRack ?? ''} mono />
              <PreviewRow label="Category" value={categories.find((c) => c.id === form.categoryId)?.name ?? ''} />
            </dl>
            <Button type="submit" className="mt-4 w-full" disabled={!canSave || submitting} loading={submitting}>
              {mode === 'create' ? 'Save Medicine' : 'Update Medicine'}
            </Button>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Keyboard Shortcuts</div>
            <ul className="space-y-1 text-xs text-zinc-600">
              <li><Kbd>Tab</Kbd> Next field</li>
              <li><Kbd>Ctrl+S</Kbd> Save medicine</li>
              <li><Kbd>Alt+→</Kbd> / <Kbd>Alt+←</Kbd> Walk sections</li>
              <li><Kbd>Esc</Kbd> Cancel</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800">
            <div className="mb-1 font-semibold">Quick tip</div>
            After saving, open the medicine&apos;s detail page to add <strong>batches with stock</strong> and pricing using the Add Stock modal.
          </div>
        </aside>
      </div>
    </form>
  );
}

// ──────────────────────────────────────────────────────────────

interface SectionCardProps {
  section: string;
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  children: React.ReactNode;
}

const SectionCard = forwardRef<HTMLElement, SectionCardProps>(function SectionCard(
  { section, icon, iconBg, title, children },
  ref,
) {
  return (
    <section ref={ref} data-section={section} className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconBg}`}>{icon}</span>
        <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
      </div>
      {children}
    </section>
  );
});

function SaleModeCard({
  title, description, active, onClick, children,
}: { title: string; description: string; active: boolean; onClick: () => void; children?: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-xl border-2 px-4 py-3 text-left transition ${active ? 'border-emerald-500 bg-emerald-50/40' : 'border-zinc-200 bg-white hover:border-zinc-300'}`}
    >
      <div className="text-sm font-semibold text-zinc-900">{title}</div>
      <div className="mt-0.5 text-xs text-zinc-500">{description}</div>
      {children}
    </button>
  );
}

function MasterMedicineField({
  value, onChange, onPick,
}: { value: string; onChange: (v: string) => void; onPick: (mm: MasterMedicine) => void }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<MasterMedicine[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try { setResults(await searchMasterMedicines(supabase, { query: value, limit: 20 })); }
      finally { setLoading(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [value, supabase]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, []);

  return (
    <div ref={wrapRef} className="relative" {...(open ? { 'data-popover-open': true } : {})}>
      <Field
        label="Medicine Name"
        required
        autoFocus
        placeholder="e.g. Paracetamol 500mg, Search ShelfCure Database..."
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => { if (value.trim().length >= 2) setOpen(true); }}
        autoComplete="off"
      />
      {open && (results.length > 0 || loading) && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg">
          {loading && <div className="px-3 py-2 text-xs text-zinc-400">Searching…</div>}
          {results.map((mm) => (
            <button key={mm.id} type="button"
              onClick={() => { onPick(mm); setOpen(false); }}
              className="block w-full border-b border-zinc-100 px-3 py-2 text-left text-sm hover:bg-emerald-50"
            >
              <div className="font-medium text-zinc-900">{mm.name}</div>
              <div className="text-xs text-zinc-500">
                {[mm.salt_composition, mm.strength, mm.manufacturer].filter(Boolean).join(' · ') || '—'}
              </div>
            </button>
          ))}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-zinc-400">No matches in catalog — type a new name to add it.</div>
          )}
        </div>
      )}
    </div>
  );
}

function CategoryField({
  value, onChange, categories, onCreate,
}: { value: string; onChange: (v: string) => void; categories: MedicineCategory[]; onCreate: (name: string) => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  async function commit() {
    if (!newName.trim()) { setAdding(false); return; }
    setSaving(true);
    try { await onCreate(newName.trim()); setNewName(''); setAdding(false); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-zinc-800">Category</label>
      <div className="flex items-center gap-2">
        <select value={value} onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-[15px] text-zinc-900 shadow-sm transition hover:border-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/15"
        >
          <option value="">Uncategorized</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button type="button" onClick={() => setAdding((a) => !a)}
          className="rounded-lg border border-zinc-300 bg-white p-2 text-zinc-600 hover:bg-zinc-50"
          title="Add new category"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"/></svg>
        </button>
      </div>
      {adding && (
        <div data-popover-open className="mt-2 flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2">
          <input value={newName} autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') setAdding(false); }}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New category name"
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
          />
          <button type="button" onClick={commit} disabled={saving || !newName.trim()}
            className="rounded-lg bg-emerald-600 p-1.5 text-white disabled:opacity-40">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M5 12l5 5 9-12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      )}
    </div>
  );
}

function SelectField({
  label, value, onChange, options, required,
}: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-zinc-800">{label}{required ? ' *' : ''}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} required={required}
        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-[15px] text-zinc-900 shadow-sm transition hover:border-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/15"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function PreviewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className={`max-w-[60%] truncate text-right text-zinc-900 ${mono ? 'font-mono text-xs' : ''}`}>{value || '—'}</dd>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-zinc-700 shadow-sm">{children}</kbd>;
}
