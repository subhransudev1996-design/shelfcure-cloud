'use client';

/**
 * POS Phase D — Sale Complete modal.
 * Shows immediately after a successful save with quick print buttons, an
 * inline UPI VPA editor (so the cashier can set it once and have all future
 * bills QR-printed), and a WhatsApp share.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSaleDetail, updateStoreUpi, type SaleDetail } from '@shelfcure/api-client';
import { printRawHtml, renderQrSvgString } from '@shelfcure/ui';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import { Modal } from '../../../../components/ui/modal';
import { Button } from '../../../../components/ui/button';
import {
  buildUpiUri, buildWhatsAppLink, renderTemplate, type PrintTemplate,
} from './print-templates';

interface Props {
  open: boolean;
  saleId: string | null;
  storeId: string;
  onClose: () => void;
  onNewBill: () => void;
}

const TEMPLATES: { id: PrintTemplate; label: string; desc: string }[] = [
  { id: 'thermal80', label: 'Thermal 80mm', desc: 'Standard receipt printer' },
  { id: 'thermal58', label: 'Thermal 58mm', desc: 'Narrow roll' },
  { id: 'compactA6', label: 'Compact A6',   desc: '105 × 148mm half-page' },
  { id: 'a4',        label: 'A4 invoice',   desc: 'Full GST tax invoice' },
];

const TEMPLATE_PREF_KEY = 'shelfcure.pos.printTemplate.v1';

export function SaleCompleteModal({ open, saleId, storeId, onClose, onNewBill }: Props) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState<PrintTemplate>('thermal80');
  const [editingUpi, setEditingUpi] = useState(false);
  const [upiDraft, setUpiDraft] = useState('');
  const [upiSaving, setUpiSaving] = useState(false);

  // Restore preferred template per device.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(TEMPLATE_PREF_KEY);
      if (raw && TEMPLATES.some((t) => t.id === raw)) setTemplate(raw as PrintTemplate);
    } catch {}
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(TEMPLATE_PREF_KEY, template); } catch {}
  }, [template]);

  // Fetch detail on open.
  useEffect(() => {
    if (!open || !saleId) return;
    setLoading(true); setError(null); setDetail(null);
    getSaleDetail(supabase, saleId)
      .then((d) => { setDetail(d); setUpiDraft(d.sale.store_upi_vpa ?? ''); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load sale'))
      .finally(() => setLoading(false));
  }, [open, saleId, supabase]);

  const upiUri = useMemo(() => detail ? buildUpiUri(detail.sale) : null, [detail]);
  const customerPhone = detail?.sale.customer_phone ?? null;
  const whatsappHref = useMemo(() => detail ? buildWhatsAppLink(detail, customerPhone) : '#', [detail, customerPhone]);

  const doPrint = useCallback(async () => {
    if (!detail) return;
    const qrSvg = upiUri ? await renderQrSvgString(upiUri) : '';
    const html = renderTemplate(template, detail, { upiQrSvg: qrSvg });
    printRawHtml(html);
  }, [detail, template, upiUri]);

  async function saveUpi() {
    setUpiSaving(true);
    try {
      const v = await updateStoreUpi(supabase, storeId, upiDraft.trim() || null);
      if (detail) setDetail({ ...detail, sale: { ...detail.sale, store_upi_vpa: v } });
      setEditingUpi(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save UPI ID');
    } finally { setUpiSaving(false); }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={detail ? `Bill ${detail.sale.bill_number}` : 'Saving…'}
      description={detail
        ? `${detail.sale.customer_name} · ${new Date(detail.sale.bill_date).toLocaleString('en-IN')}`
        : 'Fetching saved bill…'}
      maxWidth="xl"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <Button onClick={onNewBill}>New bill · F2</Button>
      </>}
    >
      {loading && <div className="py-8 text-center text-sm text-zinc-400">Loading…</div>}
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {detail && (
        <div className="space-y-4">
          {/* Big total */}
          <div className="rounded-2xl bg-emerald-50 p-4 text-center ring-1 ring-emerald-200">
            <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Paid</div>
            <div className="font-mono text-4xl font-black text-emerald-800">
              ₹{detail.sale.total_amount.toFixed(2)}
            </div>
            <div className="mt-1 text-xs font-bold text-emerald-700">
              {detail.sale.payment_method.toUpperCase()} · {detail.sale.payment_status.toUpperCase()}
              {detail.items.length > 0 && ` · ${detail.items.length} item${detail.items.length === 1 ? '' : 's'}`}
            </div>
          </div>

          {/* Print template picker + Print */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">Print template</div>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES.map((t) => (
                <button key={t.id} type="button" onClick={() => setTemplate(t.id)}
                  className={`rounded-xl border-2 px-3 py-2 text-left transition ${template === t.id ? 'border-indigo-500 bg-indigo-50/40' : 'border-zinc-200 hover:border-zinc-300'}`}
                >
                  <div className="text-sm font-semibold text-zinc-900">{t.label}</div>
                  <div className="text-[10px] text-zinc-500">{t.desc}</div>
                </button>
              ))}
            </div>
            <Button onClick={doPrint} size="lg" className="mt-3 w-full">
              Print · Ctrl+P
            </Button>
          </div>

          {/* UPI VPA inline editor */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">UPI on bill</div>
              {!editingUpi && (
                <button onClick={() => setEditingUpi(true)} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800">
                  {detail.sale.store_upi_vpa ? 'Change' : '+ Set up UPI'}
                </button>
              )}
            </div>
            {editingUpi ? (
              <div className="flex items-center gap-2">
                <input value={upiDraft} onChange={(e) => setUpiDraft(e.target.value)}
                  placeholder="store@upi"
                  className="flex-1 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 font-mono text-sm focus:border-emerald-500 focus:outline-none"
                />
                <button onClick={saveUpi} disabled={upiSaving} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                  {upiSaving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => { setEditingUpi(false); setUpiDraft(detail.sale.store_upi_vpa ?? ''); }} className="text-xs font-semibold text-zinc-500 hover:text-zinc-700">Cancel</button>
              </div>
            ) : detail.sale.store_upi_vpa ? (
              <p className="font-mono text-sm font-semibold text-zinc-800">{detail.sale.store_upi_vpa}</p>
            ) : (
              <p className="text-xs text-zinc-400">No UPI ID set — QR will be skipped on prints. Click &quot;Set up UPI&quot; to add.</p>
            )}
          </div>

          {/* WhatsApp share */}
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-emerald-700">WhatsApp share</div>
                <div className="mt-0.5 text-[11px] text-emerald-700/70">
                  {customerPhone ? `Sends to ${customerPhone}` : 'Opens WhatsApp with the bill text — you pick the contact'}
                </div>
              </div>
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5"><path d="M12 2C6.5 2 2 6.5 2 12c0 1.7.4 3.3 1.2 4.7L2 22l5.5-1.2c1.4.7 3 1.2 4.5 1.2 5.5 0 10-4.5 10-10S17.5 2 12 2z"/></svg>
                Open WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
