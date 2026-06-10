// Print HTML generators for sale bills. Faithful port of desktop POS.tsx's
// 4 inline templates (A4, Thermal 80, Thermal 58, Compact A6) per
// WEB_PARITY_PLAN §2.2 Phase D / D9.
//
// Pure functions — input is the SaleDetail JSON from rpc_get_sale_detail,
// output is a self-contained HTML string with inline <style>, ready to feed
// into printRawHtml() from @shelfcure/ui (hidden-iframe trick).

import type { SaleDetail } from '@shelfcure/api-client';

export type PrintTemplate = 'a4' | 'thermal80' | 'thermal58' | 'compactA6';

/** UPI deep-link payload per D11. Returns null if no VPA configured. */
export function buildUpiUri(sale: SaleDetail['sale']): string | null {
  const vpa = sale.store_upi_vpa?.trim();
  if (!vpa) return null;
  const pn = encodeURIComponent(sale.store_name);
  const am = sale.total_amount.toFixed(2);
  const tn = encodeURIComponent(sale.bill_number);
  return `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;
}

/** WhatsApp deep-link with a prefilled text summary. */
export function buildWhatsAppLink(detail: SaleDetail, phone?: string | null): string {
  const s = detail.sale;
  const lines = [
    `*${s.store_name}* — Bill ${s.bill_number}`,
    `Date: ${fmtDate(s.bill_date)}`,
    `Items: ${detail.items.filter((i) => !i.is_misc_item).length}`,
    `Total: ₹${s.total_amount.toFixed(2)} · ${s.payment_method.toUpperCase()} · ${s.payment_status.toUpperCase()}`,
    s.org_gstin || s.store_gstin ? `GSTIN: ${s.store_gstin || s.org_gstin}` : '',
    'Thank you for your purchase!',
  ].filter(Boolean);
  const text = encodeURIComponent(lines.join('\n'));
  const cleanPhone = (phone ?? '').replace(/[^0-9]/g, '');
  return cleanPhone ? `https://wa.me/91${cleanPhone}?text=${text}` : `https://wa.me/?text=${text}`;
}

function esc(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return iso; }
}

function inr(n: number): string { return `₹${Number(n || 0).toFixed(2)}`; }

interface RenderOptions {
  /** Embedded UPI QR SVG (already rendered). When omitted, QR section is skipped. */
  upiQrSvg?: string;
}

// ─────────────────────────────────────────────────────────────
// A4 — full GST invoice
// ─────────────────────────────────────────────────────────────

export function renderA4(d: SaleDetail, opts: RenderOptions = {}): string {
  const s = d.sale;
  const realItems = d.items.filter((i) => !i.is_misc_item);
  const miscItems = d.items.filter((i) => i.is_misc_item);
  const upiQr = opts.upiQrSvg ?? '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Invoice ${esc(s.bill_number)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 11pt; line-height: 1.4; }
  .h-band { display: flex; justify-content: space-between; gap: 16pt; border-bottom: 2pt solid #000; padding-bottom: 8pt; margin-bottom: 8pt; }
  .h-band h1 { font-size: 16pt; margin-bottom: 2pt; }
  .small { font-size: 9pt; color: #444; line-height: 1.3; }
  .right { text-align: right; }
  .row3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10pt; padding: 6pt 0; border-bottom: 1pt dashed #888; margin-bottom: 8pt; }
  .row3 .label { font-size: 8pt; color: #666; text-transform: uppercase; letter-spacing: 0.5pt; }
  .row3 .val { font-size: 10pt; font-weight: bold; }
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 8pt; }
  table.items th, table.items td { border-bottom: 1pt solid #ccc; padding: 5pt 4pt; text-align: left; font-size: 9pt; }
  table.items th { background: #f0f0f0; font-weight: bold; text-transform: uppercase; font-size: 8pt; }
  table.items td.r { text-align: right; font-family: 'Courier New', monospace; }
  table.items td.c { text-align: center; }
  .footer-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12pt; margin-top: 10pt; }
  .totals { font-family: 'Courier New', monospace; font-size: 10pt; }
  .totals .line { display: flex; justify-content: space-between; padding: 2pt 0; }
  .totals .grand { border-top: 2pt solid #000; padding-top: 6pt; margin-top: 6pt; font-size: 13pt; font-weight: bold; }
  .qr { text-align: center; }
  .qr svg { width: 30mm; height: 30mm; }
  .qr .lbl { font-size: 8pt; margin-top: 4pt; color: #666; }
  .remarks { font-size: 9pt; color: #444; padding-top: 6pt; }
  .bottom-band { margin-top: 16pt; padding-top: 8pt; border-top: 1pt solid #000; text-align: center; font-size: 8pt; color: #666; }
</style></head><body>
  <div class="h-band">
    <div>
      <h1>${esc(s.store_name)}</h1>
      <div class="small">
        ${esc([s.store_address, s.store_city, s.store_state, s.store_pincode].filter(Boolean).join(', '))}<br/>
        ${s.store_phone ? `Phone: ${esc(s.store_phone)}` : ''}
        ${s.store_email ? ` · Email: ${esc(s.store_email)}` : ''}<br/>
        ${s.store_gstin ? `GSTIN: ${esc(s.store_gstin)}` : ''}
        ${s.store_drug_license ? ` · DL: ${esc(s.store_drug_license)}` : ''}
      </div>
    </div>
    <div class="right">
      <h1>TAX INVOICE</h1>
      <div class="small">
        Bill #: <strong>${esc(s.bill_number)}</strong><br/>
        Date: ${esc(fmtDate(s.bill_date))}
      </div>
    </div>
  </div>

  <div class="row3">
    <div><div class="label">Bill to</div>
      <div class="val">${esc(s.customer_name)}</div>
      ${s.customer_phone ? `<div class="small">${esc(s.customer_phone)}</div>` : ''}
      ${s.customer_address ? `<div class="small">${esc(s.customer_address)}</div>` : ''}
    </div>
    <div><div class="label">Customer GSTIN</div>
      <div class="val">${esc(s.customer_gstin || '—')}</div>
      ${s.customer_state ? `<div class="small">State: ${esc(s.customer_state)}</div>` : ''}
    </div>
    <div>
      ${s.is_prescription_sale ? `<div class="label">Prescription</div>
        <div class="val">${esc(s.doctor_name_resolved || 'Doctor on file')}</div>
        ${s.doctor_specialization ? `<div class="small">${esc(s.doctor_specialization)}</div>` : ''}` : ''}
    </div>
  </div>

  <table class="items">
    <thead><tr>
      <th>#</th><th>Medicine</th><th>HSN</th><th>Batch</th><th>Exp</th>
      <th class="r">Qty</th><th class="r">MRP</th><th class="r">GST%</th><th class="r">Taxable</th><th class="r">Amount</th>
    </tr></thead>
    <tbody>
      ${realItems.map((it, i) => `<tr>
        <td>${i + 1}</td>
        <td>${esc(it.medicine_name)}</td>
        <td>${esc(it.hsn_code || '')}</td>
        <td>${esc(it.batch_number || '')}</td>
        <td>${esc(it.expiry_date ? it.expiry_date.slice(0, 7) : '')}</td>
        <td class="r">${it.quantity}</td>
        <td class="r">${inr(it.mrp)}</td>
        <td class="r">${Number(it.gst_percentage).toFixed(0)}%</td>
        <td class="r">${inr(it.taxable_amount)}</td>
        <td class="r">${inr(it.amount)}</td>
      </tr>`).join('')}
      ${miscItems.map((it) => `<tr>
        <td colspan="8">${esc(it.misc_note || 'Misc')}</td>
        <td class="r"></td><td class="r">${inr(it.amount)}</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <div class="footer-grid">
    <div class="remarks">
      ${s.is_prescription_sale ? '<div>Rx sale — prescription on file.</div>' : ''}
      <div>For terms & conditions visit our store.</div>
    </div>
    <div class="qr">
      ${upiQr ? `${upiQr}<div class="lbl">Pay via UPI</div>` : ''}
    </div>
    <div class="totals">
      <div class="line"><span>Subtotal</span><span>${inr(s.subtotal)}</span></div>
      ${s.discount_amount > 0 ? `<div class="line"><span>Discount</span><span>−${inr(s.discount_amount)}</span></div>` : ''}
      ${s.cgst_amount > 0 ? `<div class="line"><span>CGST</span><span>${inr(s.cgst_amount)}</span></div>` : ''}
      ${s.sgst_amount > 0 ? `<div class="line"><span>SGST</span><span>${inr(s.sgst_amount)}</span></div>` : ''}
      ${s.igst_amount > 0 ? `<div class="line"><span>IGST</span><span>${inr(s.igst_amount)}</span></div>` : ''}
      ${(s.special_discount_amount ?? 0) > 0 ? `<div class="line"><span>${esc(s.special_discount_label || 'Special discount')}</span><span>−${inr(s.special_discount_amount!)}</span></div>` : ''}
      ${(s.misc_charge ?? 0) > 0 ? `<div class="line"><span>Misc charges</span><span>${inr(s.misc_charge!)}</span></div>` : ''}
      ${s.round_off !== 0 ? `<div class="line"><span>Round off</span><span>${inr(s.round_off)}</span></div>` : ''}
      <div class="line grand"><span>TOTAL</span><span>${inr(s.total_amount)}</span></div>
      <div class="line" style="margin-top:6pt"><span>Paid (${esc(s.payment_method.toUpperCase())})</span><span>${inr(s.paid_amount)}</span></div>
    </div>
  </div>

  <div class="bottom-band">
    Thank you for your purchase! — ${esc(s.store_name)}
    ${s.created_by_name ? ` · Cashier: ${esc(s.created_by_name)}` : ''}
  </div>
</body></html>`;
}

// ─────────────────────────────────────────────────────────────
// Thermal 80mm — common pharmacy receipt printer
// ─────────────────────────────────────────────────────────────

export function renderThermal80(d: SaleDetail, opts: RenderOptions = {}): string {
  const s = d.sale;
  const upiQr = opts.upiQrSvg ?? '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Receipt ${esc(s.bill_number)}</title>
<style>
  @page { size: 80mm auto; margin: 3mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', monospace; color: #000; font-size: 10pt; line-height: 1.35; width: 74mm; }
  h1 { font-size: 12pt; text-align: center; margin-bottom: 2pt; }
  .ctr { text-align: center; }
  .sm { font-size: 8pt; }
  .dash { border-top: 1pt dashed #000; margin: 3pt 0; }
  table { width: 100%; border-collapse: collapse; }
  table td { padding: 1pt 0; vertical-align: top; font-size: 9pt; }
  td.r { text-align: right; }
  .totals .line { display: flex; justify-content: space-between; font-size: 9pt; padding: 1pt 0; }
  .totals .grand { font-size: 12pt; font-weight: bold; border-top: 1pt dashed #000; padding-top: 3pt; margin-top: 3pt; }
  .qr { text-align: center; margin-top: 4pt; }
  .qr svg { width: 22mm; height: 22mm; }
</style></head><body>
  <h1>${esc(s.store_name)}</h1>
  <div class="ctr sm">${esc([s.store_address, s.store_city].filter(Boolean).join(', '))}</div>
  ${s.store_phone ? `<div class="ctr sm">Phone: ${esc(s.store_phone)}</div>` : ''}
  ${s.store_gstin ? `<div class="ctr sm">GSTIN: ${esc(s.store_gstin)}</div>` : ''}
  ${s.store_drug_license ? `<div class="ctr sm">DL: ${esc(s.store_drug_license)}</div>` : ''}
  <div class="dash"></div>
  <div class="sm">Bill: <strong>${esc(s.bill_number)}</strong></div>
  <div class="sm">Date: ${esc(fmtDate(s.bill_date))}</div>
  <div class="sm">Customer: ${esc(s.customer_name)}</div>
  ${s.customer_phone ? `<div class="sm">Phone: ${esc(s.customer_phone)}</div>` : ''}
  ${s.is_prescription_sale && s.doctor_name_resolved ? `<div class="sm">Dr: ${esc(s.doctor_name_resolved)}</div>` : ''}
  <div class="dash"></div>
  <table>
    ${d.items.map((it) => `<tr>
      <td colspan="3">${esc(it.medicine_name)}${it.batch_number ? ` <span class="sm">[${esc(it.batch_number)}]</span>` : ''}</td>
    </tr>
    <tr>
      <td class="sm">${it.is_misc_item ? '—' : `${it.quantity} × ${inr(it.mrp)}`}</td>
      <td class="sm">${it.gst_percentage > 0 ? `GST ${Number(it.gst_percentage).toFixed(0)}%` : ''}</td>
      <td class="r">${inr(it.amount)}</td>
    </tr>`).join('')}
  </table>
  <div class="dash"></div>
  <div class="totals">
    <div class="line"><span>Subtotal</span><span>${inr(s.subtotal)}</span></div>
    ${s.discount_amount > 0 ? `<div class="line"><span>Discount</span><span>−${inr(s.discount_amount)}</span></div>` : ''}
    ${s.gst_amount > 0 ? `<div class="line"><span>GST</span><span>${inr(s.gst_amount)}</span></div>` : ''}
    ${(s.special_discount_amount ?? 0) > 0 ? `<div class="line"><span>${esc(s.special_discount_label || 'Sp Disc')}</span><span>−${inr(s.special_discount_amount!)}</span></div>` : ''}
    ${(s.misc_charge ?? 0) > 0 ? `<div class="line"><span>Misc</span><span>${inr(s.misc_charge!)}</span></div>` : ''}
    ${s.round_off !== 0 ? `<div class="line"><span>R/O</span><span>${inr(s.round_off)}</span></div>` : ''}
    <div class="line grand"><span>TOTAL</span><span>${inr(s.total_amount)}</span></div>
    <div class="line sm"><span>Paid (${esc(s.payment_method.toUpperCase())})</span><span>${inr(s.paid_amount)}</span></div>
  </div>
  ${upiQr ? `<div class="qr">${upiQr}<div class="sm">Scan to pay (UPI)</div></div>` : ''}
  <div class="dash"></div>
  <div class="ctr sm">Thank you — visit again!</div>
  ${s.created_by_name ? `<div class="ctr sm">Cashier: ${esc(s.created_by_name)}</div>` : ''}
</body></html>`;
}

// ─────────────────────────────────────────────────────────────
// Thermal 58mm — narrow receipt printer
// ─────────────────────────────────────────────────────────────

export function renderThermal58(d: SaleDetail, opts: RenderOptions = {}): string {
  const s = d.sale;
  const upiQr = opts.upiQrSvg ?? '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Receipt ${esc(s.bill_number)}</title>
<style>
  @page { size: 58mm auto; margin: 2mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', monospace; color: #000; font-size: 9pt; line-height: 1.3; width: 54mm; }
  h1 { font-size: 10pt; text-align: center; margin-bottom: 2pt; }
  .ctr { text-align: center; }
  .sm { font-size: 7pt; }
  .dash { border-top: 1pt dashed #000; margin: 2pt 0; }
  table { width: 100%; border-collapse: collapse; }
  td { font-size: 8pt; padding: 0.5pt 0; vertical-align: top; }
  td.r { text-align: right; }
  .line { display: flex; justify-content: space-between; font-size: 8pt; }
  .grand { font-size: 11pt; font-weight: bold; border-top: 1pt dashed #000; padding-top: 2pt; margin-top: 2pt; }
  .qr { text-align: center; margin-top: 3pt; }
  .qr svg { width: 18mm; height: 18mm; }
</style></head><body>
  <h1>${esc(s.store_name)}</h1>
  ${s.store_phone ? `<div class="ctr sm">${esc(s.store_phone)}</div>` : ''}
  ${s.store_gstin ? `<div class="ctr sm">GSTIN: ${esc(s.store_gstin)}</div>` : ''}
  <div class="dash"></div>
  <div class="sm">Bill: <strong>${esc(s.bill_number)}</strong></div>
  <div class="sm">${esc(fmtDate(s.bill_date))}</div>
  <div class="sm">${esc(s.customer_name)}${s.customer_phone ? ` · ${esc(s.customer_phone)}` : ''}</div>
  <div class="dash"></div>
  <table>
    ${d.items.map((it) => `<tr>
      <td colspan="2">${esc(it.medicine_name).slice(0, 26)}</td>
    </tr>
    <tr>
      <td class="sm">${it.is_misc_item ? 'misc' : `${it.quantity}x${inr(it.mrp)}`}</td>
      <td class="r">${inr(it.amount)}</td>
    </tr>`).join('')}
  </table>
  <div class="dash"></div>
  <div class="line"><span>Sub</span><span>${inr(s.subtotal)}</span></div>
  ${s.gst_amount > 0 ? `<div class="line"><span>GST</span><span>${inr(s.gst_amount)}</span></div>` : ''}
  ${(s.special_discount_amount ?? 0) > 0 ? `<div class="line"><span>Disc</span><span>−${inr(s.special_discount_amount!)}</span></div>` : ''}
  ${s.round_off !== 0 ? `<div class="line"><span>R/O</span><span>${inr(s.round_off)}</span></div>` : ''}
  <div class="line grand"><span>TOTAL</span><span>${inr(s.total_amount)}</span></div>
  <div class="sm">Paid ${esc(s.payment_method.toUpperCase())}</div>
  ${upiQr ? `<div class="qr">${upiQr}<div class="sm">UPI</div></div>` : ''}
  <div class="dash"></div>
  <div class="ctr sm">Thank you!</div>
</body></html>`;
}

// ─────────────────────────────────────────────────────────────
// Compact A6 — 105 × 148 mm half-page
// ─────────────────────────────────────────────────────────────

export function renderCompactA6(d: SaleDetail, opts: RenderOptions = {}): string {
  const s = d.sale;
  const upiQr = opts.upiQrSvg ?? '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Bill ${esc(s.bill_number)}</title>
<style>
  @page { size: A6; margin: 5mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; color: #000; font-size: 8pt; line-height: 1.3; }
  h1 { font-size: 11pt; text-align: center; margin-bottom: 2pt; }
  .ctr { text-align: center; }
  .sm { font-size: 7pt; color: #444; }
  .dash { border-top: 1pt dashed #888; margin: 3pt 0; }
  .row { display: flex; justify-content: space-between; gap: 4pt; padding: 1pt 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { font-size: 7pt; padding: 2pt 1pt; border-bottom: 0.5pt solid #ddd; text-align: left; }
  td.r { text-align: right; font-family: 'Courier New', monospace; }
  th { background: #f0f0f0; font-size: 6.5pt; text-transform: uppercase; }
  .totals { font-family: 'Courier New', monospace; font-size: 8pt; }
  .grand { font-size: 11pt; font-weight: bold; border-top: 1pt solid #000; padding-top: 3pt; margin-top: 3pt; }
  .qr { text-align: center; margin-top: 3pt; }
  .qr svg { width: 20mm; height: 20mm; }
</style></head><body>
  <h1>${esc(s.store_name)}</h1>
  <div class="ctr sm">${esc([s.store_phone, s.store_gstin].filter(Boolean).join(' · '))}</div>
  <div class="dash"></div>
  <div class="row sm">
    <span>Bill: <strong>${esc(s.bill_number)}</strong></span>
    <span>${esc(fmtDate(s.bill_date))}</span>
  </div>
  <div class="sm">${esc(s.customer_name)}${s.customer_phone ? ` · ${esc(s.customer_phone)}` : ''}</div>
  ${s.is_prescription_sale && s.doctor_name_resolved ? `<div class="sm">Dr: ${esc(s.doctor_name_resolved)}</div>` : ''}
  <table style="margin-top:3pt">
    <thead><tr><th>Item</th><th>Qty</th><th class="r">Amount</th></tr></thead>
    <tbody>
      ${d.items.map((it) => `<tr>
        <td>${esc(it.medicine_name).slice(0, 30)}${it.batch_number ? ` <span class="sm">[${esc(it.batch_number)}]</span>` : ''}</td>
        <td>${it.is_misc_item ? '—' : it.quantity}</td>
        <td class="r">${inr(it.amount)}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  <div class="dash"></div>
  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${inr(s.subtotal)}</span></div>
    ${s.gst_amount > 0 ? `<div class="row"><span>GST</span><span>${inr(s.gst_amount)}</span></div>` : ''}
    ${(s.special_discount_amount ?? 0) > 0 ? `<div class="row"><span>${esc(s.special_discount_label || 'Special')}</span><span>−${inr(s.special_discount_amount!)}</span></div>` : ''}
    ${s.round_off !== 0 ? `<div class="row"><span>Round off</span><span>${inr(s.round_off)}</span></div>` : ''}
    <div class="row grand"><span>TOTAL</span><span>${inr(s.total_amount)}</span></div>
    <div class="row sm"><span>${esc(s.payment_method.toUpperCase())} · ${esc(s.payment_status)}</span><span>${inr(s.paid_amount)}</span></div>
  </div>
  ${upiQr ? `<div class="qr">${upiQr}<div class="sm">Scan to pay</div></div>` : ''}
  <div class="dash"></div>
  <div class="ctr sm">Thanks for shopping with ${esc(s.store_name)}</div>
</body></html>`;
}

// Dispatcher
export function renderTemplate(t: PrintTemplate, d: SaleDetail, opts: RenderOptions = {}): string {
  switch (t) {
    case 'a4':         return renderA4(d, opts);
    case 'thermal80':  return renderThermal80(d, opts);
    case 'thermal58':  return renderThermal58(d, opts);
    case 'compactA6':  return renderCompactA6(d, opts);
  }
}
