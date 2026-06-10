// @shelfcure/ui/barcode-utils — refactored port of desktop's lib/barcodeUtils.ts.
//
// Cloud differences vs desktop:
//   • Batch / medicine IDs are uuids, so we don't generate SCB ids client-side
//     (the server does it in rpc_save_batch_barcodes). We just *render* them.
//   • QR payload accepts string IDs.
//   • JsBarcode + qrcode are loaded lazily so this module is safe to import
//     server-side (e.g. for typing) without pulling DOM-only deps.

import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';

export type LabelSize = 'small' | 'medium' | 'large' | 'thermal58';

export interface LabelSizeConfig {
  label: string;
  description: string;
  widthMm: number;
  heightMm: number;
  colsPerPage: number;
  rowsPerPage: number;
  barcodeHeight: number;
  barcodeWidth: number;
  fontSize: number;
  nameFontSize: number;
}

export const LABEL_SIZES: Record<LabelSize, LabelSizeConfig> = {
  small: {
    label: 'Small',
    description: '38 × 21mm · 65/page',
    widthMm: 38, heightMm: 21, colsPerPage: 5, rowsPerPage: 13,
    barcodeHeight: 28, barcodeWidth: 1.4, fontSize: 6, nameFontSize: 7,
  },
  medium: {
    label: 'Medium',
    description: '57 × 32mm · 24/page',
    widthMm: 57, heightMm: 32, colsPerPage: 3, rowsPerPage: 8,
    barcodeHeight: 40, barcodeWidth: 2, fontSize: 7, nameFontSize: 8,
  },
  large: {
    label: 'Large',
    description: '74 × 45mm · 10/page',
    widthMm: 74, heightMm: 45, colsPerPage: 2, rowsPerPage: 5,
    barcodeHeight: 55, barcodeWidth: 2.5, fontSize: 8, nameFontSize: 9,
  },
  thermal58: {
    label: 'Thermal 58mm',
    description: '58mm roll · 1 per line',
    widthMm: 58, heightMm: 35, colsPerPage: 1, rowsPerPage: 99,
    barcodeHeight: 45, barcodeWidth: 2.2, fontSize: 8, nameFontSize: 9,
  },
};

export interface LabelData {
  medicineName: string;
  barcodeValue: string;
  mrp?: number | null;
  expiryDate?: string | null;
  quantity: number;
  showName: boolean;
  showBarcodeNumber: boolean;
  showMrp: boolean;
  showExpiry: boolean;
  qrSvgString?: string;
}

/** Renders a barcode to an SVG string. Browser-only (needs DOM). */
export function renderBarcodeToSvgString(
  value: string,
  options: { height?: number; width?: number; displayValue?: boolean; fontSize?: number; margin?: number } = {},
): string {
  if (!value || typeof document === 'undefined') return '';
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  try {
    JsBarcode(svg as unknown as SVGSVGElement, value, {
      format: 'CODE128',
      height: options.height ?? 40,
      width: options.width ?? 2,
      displayValue: options.displayValue ?? false,
      margin: options.margin ?? 0,
      background: '#ffffff',
      lineColor: '#000000',
    });
  } catch {
    return '';
  }
  return svg.outerHTML;
}

/** Renders a QR payload to an SVG string (sync — uses qrcode's toString). */
export async function renderQrSvgString(payload: string): Promise<string> {
  if (!payload) return '';
  try {
    return await QRCode.toString(payload, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
  } catch { return ''; }
}

/**
 * Builds the compact JSON payload for a batch QR code.
 * Byte-identical to desktop so the same scanner reads both. v:1 marker.
 */
export function generateBatchQrData(batch: {
  batch_id: string;
  medicine_id: string;
  medicine_name: string;
  batch_number: string;
  expiry_date?: string | null;
  mrp?: number | null;
  gst_percentage?: number | null;
}): string {
  const payload: Record<string, unknown> = {
    sc: 1,
    bid: batch.batch_id,
    mid: batch.medicine_id,
    med: batch.medicine_name,
    b: batch.batch_number,
  };
  if (batch.expiry_date) payload.e = batch.expiry_date.slice(0, 7);
  if (batch.mrp != null) payload.mrp = batch.mrp;
  if (batch.gst_percentage != null) payload.g = batch.gst_percentage;
  return JSON.stringify(payload);
}

/** Generates complete print HTML for a sheet of barcode labels. */
export function generateLabelPrintHtml(labels: LabelData[], sizeKey: LabelSize): string {
  const size = LABEL_SIZES[sizeKey];
  const isThermal = sizeKey === 'thermal58';

  const expanded: LabelData[] = [];
  for (const l of labels) {
    for (let i = 0; i < Math.max(1, l.quantity); i++) expanded.push(l);
  }
  if (expanded.length === 0) return '';

  const labelHtmls = expanded.map((l) => {
    const svgStr = renderBarcodeToSvgString(l.barcodeValue, {
      height: size.barcodeHeight,
      width: size.barcodeWidth,
      displayValue: false,
      margin: 0,
    });
    const nameLine = l.showName
      ? `<div class="med-name">${escapeHtml(truncate(l.medicineName, 28))}</div>` : '';
    const barcodeLine = svgStr
      ? `<div class="barcode-wrap">${svgStr}</div>`
      : `<div class="barcode-missing">NO BARCODE</div>`;
    const codeLine = l.showBarcodeNumber
      ? `<div class="barcode-num">${escapeHtml(l.barcodeValue)}</div>` : '';
    const mrpLine = l.showMrp && l.mrp != null
      ? `<div class="mrp">MRP: ₹${Number(l.mrp).toFixed(2)}</div>` : '';
    const expiryLine = l.showExpiry && l.expiryDate
      ? `<div class="expiry">Exp: ${formatExpiryForLabel(l.expiryDate)}</div>` : '';
    const qrLine = l.qrSvgString ? `<div class="qr-wrap">${l.qrSvgString}</div>` : '';
    return `<div class="label">${nameLine}${barcodeLine}${codeLine}${mrpLine}${expiryLine}${qrLine}</div>`;
  });

  const pageStyle = isThermal
    ? `@page { size: 58mm auto; margin: 2mm; }
       .label-grid { display: flex; flex-direction: column; gap: 3mm; width: 54mm; }
       .label { width: 54mm; padding: 1mm; border: 0.5px solid #ccc; border-radius: 1mm; page-break-inside: avoid; break-inside: avoid; }`
    : `@page { size: A4; margin: 5mm; }
       .label-grid { display: grid; grid-template-columns: repeat(${size.colsPerPage}, 1fr); gap: 1mm; width: 100%; }
       .label { width: ${size.widthMm}mm; height: ${size.heightMm}mm; overflow: hidden; padding: 1mm;
                border: 0.4px solid #bbb; border-radius: 0.8mm; page-break-inside: avoid; break-inside: avoid;
                display: flex; flex-direction: column; align-items: center; justify-content: center; }`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Barcode Labels</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; background: #fff; color: #000; }
  ${pageStyle}
  .med-name { font-size: ${size.nameFontSize}pt; font-weight: 700; text-align: center; line-height: 1.1;
              margin-bottom: 0.5mm; overflow: hidden; display: -webkit-box;
              -webkit-line-clamp: 2; -webkit-box-orient: vertical; width: 100%; }
  .barcode-wrap { display: flex; justify-content: center; width: 100%; }
  .barcode-wrap svg { max-width: 100%; height: auto; }
  .barcode-missing { font-size: 6pt; color: #999; border: 1px dashed #ccc; padding: 2mm 4mm; margin: 1mm 0; }
  .barcode-num { font-size: ${size.fontSize}pt; font-family: 'Courier New', monospace; letter-spacing: 0.5px; text-align: center; margin-top: 0.3mm; }
  .mrp { font-size: ${size.fontSize}pt; font-weight: 700; text-align: center; }
  .expiry { font-size: ${size.fontSize - 1}pt; text-align: center; color: #555; }
  .qr-wrap { display: flex; justify-content: center; margin-top: 1mm; width: 100%; }
  .qr-wrap svg { max-width: 20mm; max-height: 20mm; width: 20mm; height: 20mm; }
</style></head><body><div class="label-grid">${labelHtmls.join('\n')}</div></body></html>`;
}

/** Prints raw HTML via a hidden iframe. Works in any browser context. */
export function printRawHtml(html: string): void {
  if (typeof document === 'undefined' || !html) return;
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) { document.body.removeChild(iframe); return; }
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => {
    try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch { /* print dialog unavailable */ }
    setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* iframe already removed */ } }, 2000);
  }, 250);
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
function formatExpiryForLabel(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    const month = d.toLocaleString('en-IN', { month: 'short' });
    return `${month} ${d.getFullYear()}`;
  } catch { return isoDate; }
}
