'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createDoctor, listDoctors, signedPrescriptionUrl, uploadPrescription,
  type Doctor,
} from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';

interface Props {
  storeId: string;
  orgId: string;
  enabled: boolean;
  doctorId: string | null;
  doctorName: string;
  imagePath: string | null;
  onChange: (state: {
    enabled: boolean;
    doctorId: string | null;
    doctorName: string;
    imagePath: string | null;
  }) => void;
}

/**
 * Doctor + Prescription section for POS (WEB_PARITY_PLAN §2.2 Phase B).
 *   • Toggle marks the sale as `is_prescription_sale`.
 *   • Doctor picker (search + quick-add inline).
 *   • Prescription image upload to Supabase Storage bucket `prescriptions/`
 *     (path keyed by org_id per migration 0024 RLS).
 */
export function DoctorPrescriptionSection({
  storeId, orgId, enabled, doctorId, doctorName, imagePath, onChange,
}: Props) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [search, setSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [addingDoctor, setAddingDoctor] = useState(false);
  const [newDoc, setNewDoc] = useState({ name: '', spec: '', phone: '' });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;
    listDoctors(supabase, { storeId }).then(setDoctors).catch(() => setDoctors([]));
  }, [enabled, supabase, storeId]);

  // Click-outside closes the doctor picker.
  useEffect(() => {
    if (!showPicker) return;
    function click(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setShowPicker(false);
    }
    document.addEventListener('mousedown', click);
    return () => document.removeEventListener('mousedown', click);
  }, [showPicker]);

  // Refresh signed URL for the uploaded image preview.
  useEffect(() => {
    let alive = true;
    setPreviewUrl(null);
    if (!imagePath) return;
    signedPrescriptionUrl(supabase, imagePath, 900)
      .then((url) => { if (alive) setPreviewUrl(url); })
      .catch(() => {});
    return () => { alive = false; };
  }, [imagePath, supabase]);

  const filteredDocs = doctors.filter((d) =>
    !search.trim() || d.name.toLowerCase().includes(search.toLowerCase()));

  const selectedDoctor = doctors.find((d) => d.id === doctorId);

  function toggle() {
    onChange({
      enabled: !enabled,
      doctorId: !enabled ? doctorId : null,
      doctorName: !enabled ? doctorName : '',
      imagePath: !enabled ? imagePath : null,
    });
  }

  const onFile = useCallback(async (file: File) => {
    if (file.size > 5 * 1024 * 1024) { setUploadError('Image must be ≤ 5 MB'); return; }
    setUploading(true); setUploadError(null);
    try {
      const { path } = await uploadPrescription(supabase, orgId, file);
      onChange({ enabled, doctorId, doctorName, imagePath: path });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    } finally { setUploading(false); }
  }, [supabase, orgId, enabled, doctorId, doctorName, onChange]);

  async function quickAddDoctor() {
    if (!newDoc.name.trim()) return;
    try {
      const d = await createDoctor(supabase, {
        name: newDoc.name,
        specialization: newDoc.spec || undefined,
        phone: newDoc.phone || undefined,
        store_id: storeId,
      });
      setDoctors((arr) => [...arr, d].sort((a, b) => a.name.localeCompare(b.name)));
      onChange({ enabled, doctorId: d.id, doctorName: d.name, imagePath });
      setAddingDoctor(false); setNewDoc({ name: '', spec: '', phone: '' });
      setShowPicker(false);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Failed to create doctor');
    }
  }

  return (
    <div
      className={`rounded-2xl border ${enabled ? 'border-violet-200 bg-violet-50/30' : 'border-zinc-200 bg-white'} p-4 shadow-sm`}
      data-pos-section="prescription"
    >
      <label className="flex cursor-pointer items-center gap-2.5">
        <input type="checkbox" checked={enabled} onChange={toggle} className="h-4 w-4 accent-violet-600" />
        <div className="flex-1">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">Doctor / Prescription</div>
          <div className="mt-0.5 text-sm font-semibold text-zinc-900">
            {enabled ? 'Prescription sale' : 'Off · regular sale'}
          </div>
        </div>
      </label>

      {enabled && (
        <div className="mt-3 space-y-2.5" ref={wrapRef}>
          {/* Doctor picker */}
          <div className="relative">
            <div
              onClick={() => setShowPicker((v) => !v)}
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm hover:border-zinc-400"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 shrink-0 text-violet-500"><path d="M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M5 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round"/></svg>
              <span className={selectedDoctor ? 'font-semibold text-zinc-900' : 'text-zinc-400'}>
                {selectedDoctor?.name ?? (doctorName || 'Pick doctor…')}
              </span>
              {selectedDoctor && (
                <button type="button" onClick={(e) => { e.stopPropagation(); onChange({ enabled, doctorId: null, doctorName: '', imagePath }); }} className="ml-auto text-zinc-400 hover:text-rose-600">
                  <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5"><path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                </button>
              )}
            </div>

            {showPicker && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 flex max-h-72 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
                <div className="border-b border-zinc-100 p-2">
                  <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search doctor…"
                    className="w-full rounded-lg bg-zinc-50 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
                  />
                </div>
                <div className="overflow-y-auto">
                  {addingDoctor ? (
                    <div className="space-y-2 p-3">
                      <input value={newDoc.name} onChange={(e) => setNewDoc((d) => ({ ...d, name: e.target.value }))}
                        placeholder="Doctor name" autoFocus
                        className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm focus:border-violet-500 focus:outline-none"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input value={newDoc.spec} onChange={(e) => setNewDoc((d) => ({ ...d, spec: e.target.value }))}
                          placeholder="Specialization"
                          className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm focus:border-violet-500 focus:outline-none"
                        />
                        <input value={newDoc.phone} onChange={(e) => setNewDoc((d) => ({ ...d, phone: e.target.value }))}
                          placeholder="Phone" type="tel" inputMode="numeric"
                          className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm focus:border-violet-500 focus:outline-none"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setAddingDoctor(false)} className="rounded-lg px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-100">Cancel</button>
                        <button onClick={quickAddDoctor} disabled={!newDoc.name.trim()} className="rounded-lg bg-violet-600 px-3 py-1 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50">Save</button>
                      </div>
                    </div>
                  ) : filteredDocs.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-zinc-400">
                      No matches. <button onClick={() => setAddingDoctor(true)} className="font-bold text-violet-700 hover:underline">+ Add new doctor</button>
                    </div>
                  ) : (
                    <>
                      {filteredDocs.map((d) => (
                        <button key={d.id} type="button"
                          onClick={() => { onChange({ enabled, doctorId: d.id, doctorName: d.name, imagePath }); setShowPicker(false); setSearch(''); }}
                          className="block w-full px-4 py-2 text-left text-sm hover:bg-violet-50"
                        >
                          <div className="font-semibold text-zinc-900">{d.name}</div>
                          <div className="text-xs text-zinc-500">{[d.specialization, d.phone].filter(Boolean).join(' · ') || '—'}</div>
                        </button>
                      ))}
                      <button onClick={() => setAddingDoctor(true)} className="block w-full border-t border-zinc-100 px-4 py-2 text-left text-xs font-bold text-violet-700 hover:bg-violet-50">
                        + Add new doctor
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Manual doctor name (when no doctor picked but the name field needed) */}
          {!selectedDoctor && (
            <input value={doctorName}
              onChange={(e) => onChange({ enabled, doctorId, doctorName: e.target.value, imagePath })}
              placeholder="…or type doctor's name freehand"
              className="w-full rounded-lg border border-dashed border-zinc-300 bg-white px-2.5 py-1.5 text-sm placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none"
            />
          )}

          {/* Image upload */}
          <div>
            <input
              ref={fileInputRef} type="file" accept="image/*" className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
            {imagePath ? (
              <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white p-2">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local blob/object URL preview, not optimizable by next/image
                  <img src={previewUrl} alt="prescription" className="h-12 w-12 rounded object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded bg-zinc-100 text-zinc-400">
                    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5"><path d="M4 5h16v14H4z M4 15l5-5 4 4 3-3 4 4" stroke="currentColor" strokeWidth="1.5"/></svg>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-zinc-700">Prescription uploaded</div>
                  <div className="truncate text-[10px] text-zinc-400">{imagePath.split('/').pop()}</div>
                </div>
                <button onClick={() => onChange({ enabled, doctorId, doctorName, imagePath: null })} className="text-zinc-400 hover:text-rose-600">
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-violet-300 bg-white px-3 py-2 text-xs font-bold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" fill="none" className={`h-3.5 w-3.5 ${uploading ? 'animate-spin' : ''}`}>
                  {uploading
                    ? <path d="M21 12a9 9 0 1 1-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                    : <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>}
                </svg>
                {uploading ? 'Uploading…' : 'Upload prescription image'}
              </button>
            )}
            {uploadError && <p className="mt-1 text-xs text-rose-600">{uploadError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
