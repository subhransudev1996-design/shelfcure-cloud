'use client';

import { useCallback, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import {
  PromotionTemplates,
  TEMPLATE_LIST,
  FESTIVAL_DEFAULTS,
  FONT_OPTIONS,
  type FestivalType,
  type TemplateId,
} from './templates';

interface Props {
  storeName: string;
}

type EditData = {
  title: string;
  body: string;
  couponCode: string;
  primaryColor: string;
  secondaryColor: string;
  festivalType: FestivalType;
  festivalVariant: number;
  fontFamily: string;
};

const DEFAULT_EDIT: EditData = {
  title: 'Exclusive Offer!',
  body: 'Special discounts on selected medicines this week. Visit us to avail!',
  couponCode: 'SAVE10',
  primaryColor: '#06b6d4',
  secondaryColor: '#3b82f6',
  festivalType: 'generic',
  festivalVariant: 1,
  fontFamily: "inherit",
};

const FESTIVALS: Array<{ value: FestivalType; label: string }> = [
  { value: 'generic', label: 'General Greetings' },
  { value: 'diwali', label: 'Diwali' },
  { value: 'holi', label: 'Holi' },
  { value: 'eid', label: 'Eid' },
  { value: 'christmas', label: 'Christmas' },
  { value: 'new_year', label: 'New Year' },
  { value: 'durga_puja', label: 'Durga Puja' },
  { value: 'ganesh_puja', label: 'Ganesh Chaturthi' },
  { value: 'shiva_ratri', label: 'Maha Shivaratri' },
  { value: 'janmastami', label: 'Janmashtami' },
];

// Template preview thumbnail backgrounds
const TEMPLATE_COLORS: Record<TemplateId, { from: string; to: string }> = {
  minimal: { from: '#06b6d4', to: '#3b82f6' },
  vibrant: { from: '#050505', to: '#111' },
  festival: { from: '#1a1a1a', to: '#000' },
  coupon: { from: '#0f172a', to: '#0f172a' },
};

export function PromotionsHub({ storeName }: Props) {
  const [view, setView] = useState<'gallery' | 'editor'>('gallery');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>('minimal');
  const [editData, setEditData] = useState<EditData>({ ...DEFAULT_EDIT });
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const set = useCallback(<K extends keyof EditData>(key: K, value: EditData[K]) => {
    setEditData((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateFestival = useCallback((type: FestivalType) => {
    const d = FESTIVAL_DEFAULTS[type];
    setEditData((prev) => ({
      ...prev,
      festivalType: type,
      title: d.title,
      body: d.body,
      primaryColor: d.primary,
      secondaryColor: d.secondary,
      festivalVariant: 1,
    }));
  }, []);

  const handleDownload = useCallback(async () => {
    if (!exportRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(exportRef.current, { cacheBust: true, pixelRatio: 2 });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `promo-${selectedTemplate}-${Date.now()}.png`;
      link.click();
    } catch (err) {
      console.error('Export failed', err);
    } finally {
      setExporting(false);
    }
  }, [selectedTemplate]);

  const handleShareWhatsApp = useCallback(async () => {
    await handleDownload();
    const text = encodeURIComponent(
      `${editData.title}\n\n${editData.body}\n\nFrom: ${storeName}\nPowered by ShelfCure`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }, [handleDownload, editData, storeName]);

  const openEditor = (id: TemplateId) => {
    setSelectedTemplate(id);
    setEditData({ ...DEFAULT_EDIT });
    setView('editor');
  };

  const TemplateComponent = PromotionTemplates[selectedTemplate];
  const previewProps = { ...editData, storeName };

  if (view === 'gallery') {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-black text-zinc-900">Promotions</h1>
          <p className="mt-1 text-sm text-zinc-500">Design and share festival offers, discounts, and announcements with your customers.</p>
        </div>

        {/* Template gallery */}
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {TEMPLATE_LIST.map((t) => {
            const colors = TEMPLATE_COLORS[t.id];
            return (
              <button
                key={t.id}
                onClick={() => openEditor(t.id)}
                className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-all hover:border-indigo-300 hover:shadow-md text-left"
              >
                {/* Template thumbnail */}
                <div
                  className="h-48 w-full relative overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${colors.from}, ${colors.to})` }}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center text-white/60 px-6">
                      <p className="text-xs font-black uppercase tracking-[0.3em] mb-2 opacity-70">{storeName}</p>
                      <p className="text-xl font-black leading-tight">Sample<br/>Promotion</p>
                    </div>
                  </div>
                  <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-black/30 to-transparent" />
                </div>
                {/* Card footer */}
                <div className="p-4">
                  <p className="font-semibold text-zinc-900 group-hover:text-indigo-700 transition-colors">{t.name}</p>
                  <p className="mt-0.5 text-[10px] text-zinc-400">{t.description}</p>
                  <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-indigo-600 group-hover:underline">
                    Use Template →
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Editor view
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setView('gallery')}
          className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-black text-zinc-900">
            {TEMPLATE_LIST.find((t) => t.id === selectedTemplate)?.name ?? 'Edit Promotion'}
          </h1>
          <p className="text-xs text-zinc-400">Customize and download your promotional poster</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleShareWhatsApp}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" /></svg>
            WhatsApp
          </button>
          <button
            onClick={handleDownload}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            {exporting ? 'Exporting…' : 'Download PNG'}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Preview */}
        <div className="flex shrink-0 items-start justify-center">
          <div className="overflow-hidden rounded-2xl shadow-2xl" style={{ width: 400, height: 600 }}>
            <div ref={exportRef}>
              <TemplateComponent {...previewProps} />
            </div>
          </div>
        </div>

        {/* Edit form */}
        <div className="flex-1 space-y-4">
          {/* Template switcher */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-zinc-400">Template</p>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATE_LIST.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplate(t.id)}
                  className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-all ${selectedTemplate === t.id ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50'}`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          {/* Text fields */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Content</p>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1">Title</label>
              <input
                type="text"
                value={editData.title}
                onChange={(e) => set('title', e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1">Body</label>
              <textarea
                value={editData.body}
                onChange={(e) => set('body', e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
            {(selectedTemplate === 'coupon' || selectedTemplate === 'festival') && (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1">Coupon Code</label>
                <input
                  type="text"
                  value={editData.couponCode}
                  onChange={(e) => set('couponCode', e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-mono text-zinc-900 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>
            )}
          </div>

          {/* Colors */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-zinc-400">Colors</p>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-zinc-500">Primary</label>
                <input type="color" value={editData.primaryColor} onChange={(e) => set('primaryColor', e.target.value)} className="h-8 w-10 cursor-pointer rounded border-0 p-0" />
                <span className="font-mono text-[10px] text-zinc-400">{editData.primaryColor}</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-zinc-500">Secondary</label>
                <input type="color" value={editData.secondaryColor} onChange={(e) => set('secondaryColor', e.target.value)} className="h-8 w-10 cursor-pointer rounded border-0 p-0" />
                <span className="font-mono text-[10px] text-zinc-400">{editData.secondaryColor}</span>
              </div>
            </div>
          </div>

          {/* Festival */}
          {selectedTemplate === 'festival' && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Festival Theme</p>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1">Festival</label>
                <select
                  value={editData.festivalType}
                  onChange={(e) => updateFestival(e.target.value as FestivalType)}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                >
                  {FESTIVALS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1">Variant</label>
                <div className="flex gap-2">
                  {[1, 2].map((v) => (
                    <button
                      key={v}
                      onClick={() => set('festivalVariant', v)}
                      className={`rounded-lg border px-4 py-2 text-xs font-semibold transition-all ${editData.festivalVariant === v ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}
                    >
                      Variant {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Font */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Font</label>
            <div className="grid grid-cols-2 gap-2">
              {FONT_OPTIONS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => set('fontFamily', f.value)}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${editData.fontFamily === f.value ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}
                  style={{ fontFamily: f.value }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Variant toggle (non-festival) */}
          {selectedTemplate !== 'festival' && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Design Variant</label>
              <div className="flex gap-2">
                {[1, 2].map((v) => (
                  <button
                    key={v}
                    onClick={() => set('festivalVariant', v)}
                    className={`rounded-xl border px-4 py-2 text-xs font-semibold transition-all ${editData.festivalVariant === v ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}
                  >
                    Variant {v}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
