import { describe, expect, it } from 'vitest';
import { computeBill } from './bill-math';

describe('computeBill', () => {
  it('one line, no discount, no extras', () => {
    const r = computeBill({
      lines: [{ mrp: 50, quantity: 2, gstPercentage: 12 }],
      gstType: 'cgst_sgst',
    });
    expect(r.subtotal).toBe(100);
    expect(r.totalAmount).toBe(100);
    expect(r.cgstAmount + r.sgstAmount).toBeCloseTo(10.71, 2);
    expect(r.taxableAmount).toBeCloseTo(89.29, 2);
  });

  it('applies bill-level percent discount', () => {
    const r = computeBill({
      lines: [{ mrp: 100, quantity: 1, gstPercentage: 12 }],
      gstType: 'cgst_sgst',
      billDiscountPercentage: 10,
    });
    expect(r.discountAmount).toBe(10);
    expect(r.totalAmount).toBe(90);
  });

  it('applies special discount and misc charge', () => {
    const r = computeBill({
      lines: [{ mrp: 200, quantity: 1, gstPercentage: 12 }],
      gstType: 'cgst_sgst',
      specialDiscountAmount: 20,
      miscCharge: 50,
    });
    // subtotal 200 - 0 - 20 + 50 = 230
    expect(r.specialDiscountAmount).toBe(20);
    expect(r.miscCharge).toBe(50);
    expect(r.totalAmount).toBe(230);
  });

  it('round-off pushes total to nearest whole rupee', () => {
    const r = computeBill({
      lines: [{ mrp: 99.6, quantity: 1, gstPercentage: 12 }],
      gstType: 'cgst_sgst',
      roundOff: true,
    });
    expect(Number.isInteger(r.totalAmount)).toBe(true);
    expect(r.roundOff).not.toBe(0);
  });

  it('misc-item line: no GST extraction, full amount is the charge', () => {
    const r = computeBill({
      lines: [
        { mrp: 100, quantity: 1, gstPercentage: 12 },
        { mrp: 30, quantity: 1, gstPercentage: 0, isMiscItem: true },
      ],
      gstType: 'cgst_sgst',
    });
    expect(r.lines[1]!.totalGstAmount).toBe(0);
    expect(r.lines[1]!.taxableAmount).toBe(30);
    expect(r.subtotal).toBe(130);
  });

  it('multiple lines, all aggregated', () => {
    const r = computeBill({
      lines: [
        { mrp: 100, quantity: 2, gstPercentage: 12 },  // 200
        { mrp: 50, quantity: 1, gstPercentage: 5 },    // 50
      ],
      gstType: 'cgst_sgst',
    });
    expect(r.subtotal).toBe(250);
    expect(r.lines.length).toBe(2);
  });

  it('line discount reduces gross before GST extraction', () => {
    const r = computeBill({
      lines: [{ mrp: 100, quantity: 1, gstPercentage: 12, discountPercentage: 10 }],
      gstType: 'cgst_sgst',
    });
    expect(r.lines[0]!.grossAmount).toBe(90);
    expect(r.subtotal).toBe(90);
  });
});
