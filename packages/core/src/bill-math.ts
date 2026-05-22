/**
 * Bill math: turn an array of line items into a fully-totalled bill.
 *
 * Sale flow:
 *   1) Each line has MRP × qty − line discount  →  gross
 *   2) GST extracted from gross (MRP-inclusive)
 *   3) Bill-level discount applied to net (after GST)
 *   4) Special discount (per-customer) applied
 *   5) Misc charge added
 *   6) Round-off to nearest rupee
 *   7) total_amount = payable
 */

import { round2, roundOff as calcRoundOff } from './math';
import { calculateLineGst, type GstType, type GstLineItem } from './gst';

export interface BillLineInput {
  mrp: number;
  quantity: number;
  gstPercentage: number;
  /** Line-level discount, percent (0-100). */
  discountPercentage?: number;
  /** Or line-level discount as a flat ₹. Cannot mix with discountPercentage. */
  flatDiscount?: number;
  /** Is this a misc charge (no GST extraction; amount = total)? */
  isMiscItem?: boolean;
}

export interface BillLineOutput extends GstLineItem {
  grossAmount: number; // MRP * qty - line discount
  amount: number; // gross (printed line total)
}

export interface BillSummaryInput {
  lines: BillLineInput[];
  gstType: GstType;
  /** Bill-level percentage discount applied AFTER lines are summed. */
  billDiscountPercentage?: number;
  /** Or flat ₹ bill-level discount. */
  billDiscountFlat?: number;
  /** Per-customer special discount (label printed). */
  specialDiscountAmount?: number;
  /** Misc charge added on top (delivery, packing, etc.). */
  miscCharge?: number;
  /** Apply round-off to whole rupee. */
  roundOff?: boolean;
}

export interface BillSummaryOutput {
  lines: BillLineOutput[];
  subtotal: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  gstAmount: number;
  discountAmount: number;
  specialDiscountAmount: number;
  miscCharge: number;
  roundOff: number;
  totalAmount: number;
}

function computeLine(line: BillLineInput, gstType: GstType): BillLineOutput {
  const rawGross = line.mrp * line.quantity;
  const discounted =
    line.discountPercentage != null
      ? rawGross * (1 - line.discountPercentage / 100)
      : line.flatDiscount != null
        ? rawGross - line.flatDiscount
        : rawGross;
  const grossAmount = round2(Math.max(0, discounted));

  if (line.isMiscItem) {
    return {
      grossAmount,
      amount: grossAmount,
      taxableAmount: grossAmount,
      cgstPercentage: 0,
      sgstPercentage: 0,
      igstPercentage: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      totalGstAmount: 0,
    };
  }

  const gst = calculateLineGst(grossAmount, line.gstPercentage, gstType, true);
  return {
    ...gst,
    grossAmount,
    amount: grossAmount,
  };
}

export function computeBill(input: BillSummaryInput): BillSummaryOutput {
  const lines = input.lines.map((l) => computeLine(l, input.gstType));

  const subtotal = round2(lines.reduce((s, l) => s + l.grossAmount, 0));
  const taxableAmount = round2(lines.reduce((s, l) => s + l.taxableAmount, 0));
  const cgstAmount = round2(lines.reduce((s, l) => s + l.cgstAmount, 0));
  const sgstAmount = round2(lines.reduce((s, l) => s + l.sgstAmount, 0));
  const igstAmount = round2(lines.reduce((s, l) => s + l.igstAmount, 0));
  const gstAmount = round2(cgstAmount + sgstAmount + igstAmount);

  // Bill-level discount on the gross total
  const billDiscount = round2(
    input.billDiscountPercentage != null
      ? subtotal * (input.billDiscountPercentage / 100)
      : (input.billDiscountFlat ?? 0),
  );
  const specialDiscount = round2(input.specialDiscountAmount ?? 0);
  const miscCharge = round2(input.miscCharge ?? 0);
  const discountAmount = round2(billDiscount);

  const beforeRounding = round2(subtotal - discountAmount - specialDiscount + miscCharge);
  const roundOff = input.roundOff ? calcRoundOff(beforeRounding) : 0;
  const totalAmount = round2(beforeRounding + roundOff);

  return {
    lines,
    subtotal,
    taxableAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    gstAmount,
    discountAmount,
    specialDiscountAmount: specialDiscount,
    miscCharge,
    roundOff,
    totalAmount,
  };
}
