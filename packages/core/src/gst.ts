/**
 * GST (Goods & Services Tax) math for Indian pharmacies.
 *
 * Indian Legal Metrology rule: MRP is inclusive of all taxes for retail.
 * Purchase rates from suppliers are usually exclusive of tax.
 *
 * - Same-state transaction → CGST + SGST (rate split in half each)
 * - Inter-state transaction → IGST (full rate)
 */

import { round2 } from './math';

export type GstType = 'cgst_sgst' | 'igst';

export interface GstLineItem {
  taxableAmount: number;
  cgstPercentage: number;
  sgstPercentage: number;
  igstPercentage: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalGstAmount: number;
}

export interface GstSummary {
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalGstAmount: number;
}

export const GST_RATES = [0, 5, 12, 18, 28] as const;
export type GstRate = (typeof GST_RATES)[number];

/**
 * Indian state name normaliser. The same state can appear as "MH" / "Maharashtra"
 * / "maharashtra" / "MAHARASHTRA " — we normalise to a lowercase canonical form
 * before comparing.
 */
export const INDIAN_STATE_ALIASES: Record<string, string> = {
  an: 'andaman and nicobar islands',
  ap: 'andhra pradesh',
  ar: 'arunachal pradesh',
  as: 'assam',
  br: 'bihar',
  ch: 'chandigarh',
  ct: 'chhattisgarh',
  cg: 'chhattisgarh',
  dn: 'dadra and nagar haveli and daman and diu',
  dd: 'daman and diu',
  dl: 'delhi',
  'new delhi': 'delhi',
  ga: 'goa',
  gj: 'gujarat',
  hr: 'haryana',
  hp: 'himachal pradesh',
  jk: 'jammu and kashmir',
  jh: 'jharkhand',
  ka: 'karnataka',
  kl: 'kerala',
  la: 'ladakh',
  ld: 'lakshadweep',
  mp: 'madhya pradesh',
  mh: 'maharashtra',
  mn: 'manipur',
  ml: 'meghalaya',
  mz: 'mizoram',
  nl: 'nagaland',
  or: 'odisha',
  od: 'odisha',
  py: 'puducherry',
  pb: 'punjab',
  rj: 'rajasthan',
  sk: 'sikkim',
  tn: 'tamil nadu',
  tg: 'telangana',
  ts: 'telangana',
  tr: 'tripura',
  up: 'uttar pradesh',
  ut: 'uttarakhand',
  uk: 'uttarakhand',
  wb: 'west bengal',
};

function normaliseState(s: string): string {
  const lower = s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '');
  return INDIAN_STATE_ALIASES[lower] ?? lower;
}

/**
 * Is this an inter-state transaction (IGST applies)?
 *
 * Prefers GSTIN comparison (first 2 chars are the state code) since it's
 * authoritative. Falls back to normalised state names. Defaults to false
 * (intra-state) when info is missing.
 */
export function isInterState(
  otherState: string | null | undefined,
  ownState: string | null | undefined,
  otherGstin?: string | null,
  ownGstin?: string | null,
): boolean {
  if (otherGstin && ownGstin) {
    const oCode = otherGstin.substring(0, 2);
    const pCode = ownGstin.substring(0, 2);
    if (/^\d{2}$/.test(oCode) && /^\d{2}$/.test(pCode)) {
      return oCode !== pCode;
    }
  }
  if (!otherState || !ownState) return false;
  return normaliseState(otherState) !== normaliseState(ownState);
}

export function getGstType(
  ownState: string | null | undefined,
  otherState: string | null | undefined,
  ownGstin?: string | null,
  otherGstin?: string | null,
): GstType {
  return isInterState(otherState, ownState, otherGstin, ownGstin) ? 'igst' : 'cgst_sgst';
}

/**
 * Calculate GST for a sale line (MRP-inclusive).
 *
 * @param baseAmount MRP × qty × (1 − discount%)
 * @param gstRate    in percent (e.g. 12 for 12%)
 * @param gstType    'cgst_sgst' or 'igst'
 * @param inclusive  default true (sale). Set false for purchase math.
 */
export function calculateLineGst(
  baseAmount: number,
  gstRate: number,
  gstType: GstType,
  inclusive: boolean = true,
): GstLineItem {
  if (gstRate <= 0) {
    return {
      taxableAmount: round2(baseAmount),
      cgstPercentage: 0,
      sgstPercentage: 0,
      igstPercentage: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      totalGstAmount: 0,
    };
  }

  const taxableAmount = inclusive
    ? round2(baseAmount / (1 + gstRate / 100))
    : round2(baseAmount);
  const totalGst = inclusive
    ? round2(baseAmount - taxableAmount)
    : round2(taxableAmount * (gstRate / 100));

  if (gstType === 'igst') {
    return {
      taxableAmount,
      cgstPercentage: 0,
      sgstPercentage: 0,
      igstPercentage: gstRate,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: totalGst,
      totalGstAmount: totalGst,
    };
  }

  // CGST + SGST: split evenly. Avoid rounding drift by computing one side then subtracting.
  const halfRate = gstRate / 2;
  const half = round2(totalGst / 2);
  return {
    taxableAmount,
    cgstPercentage: halfRate,
    sgstPercentage: halfRate,
    igstPercentage: 0,
    cgstAmount: half,
    sgstAmount: round2(totalGst - half),
    igstAmount: 0,
    totalGstAmount: totalGst,
  };
}

/**
 * Rate-drift guard for purchase entry.
 *
 * Compares a new purchase_rate against the last known rate for the same
 * medicine/supplier and returns a severity level:
 *   ok      < 10 % change
 *   warn    ≥ 10 %  (highlight in UI)
 *   danger  ≥ 25 %  (strong warning)
 *   block   ≥ 50 %  (require confirmation before saving)
 */
export type RateDriftLevel = 'ok' | 'warn' | 'danger' | 'block';

export function evaluateRateDrift(rate: number, lastRate: number): RateDriftLevel {
  if (!lastRate || lastRate <= 0 || !rate || rate <= 0) return 'ok';
  const pct = (Math.abs(rate - lastRate) / lastRate) * 100;
  if (pct >= 50) return 'block';
  if (pct >= 25) return 'danger';
  if (pct >= 10) return 'warn';
  return 'ok';
}

export function sumGstLines(items: GstLineItem[]): GstSummary {
  return items.reduce<GstSummary>(
    (acc, line) => ({
      taxableAmount: round2(acc.taxableAmount + line.taxableAmount),
      cgstAmount: round2(acc.cgstAmount + line.cgstAmount),
      sgstAmount: round2(acc.sgstAmount + line.sgstAmount),
      igstAmount: round2(acc.igstAmount + line.igstAmount),
      totalGstAmount: round2(acc.totalGstAmount + line.totalGstAmount),
    }),
    { taxableAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalGstAmount: 0 },
  );
}
