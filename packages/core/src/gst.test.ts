import { describe, expect, it } from 'vitest';
import {
  calculateLineGst,
  getGstType,
  isInterState,
  sumGstLines,
  GST_RATES,
} from './gst';

describe('isInterState', () => {
  it('uses GSTIN state code when both are present', () => {
    expect(isInterState('Karnataka', 'Maharashtra', '29ABCDE1234F1Z5', '27ABCDE1234F1Z5')).toBe(true);
    expect(isInterState('Karnataka', 'Maharashtra', '27ABCDE1234F1Z5', '27ABCDE1234F1Z5')).toBe(false);
  });

  it('falls back to state names', () => {
    expect(isInterState('Maharashtra', 'Karnataka')).toBe(true);
    expect(isInterState('MH', 'maharashtra')).toBe(false);
    expect(isInterState('TN', 'tamil nadu')).toBe(false);
  });

  it('normalises whitespace and case', () => {
    expect(isInterState('  Maharashtra  ', 'maharashtra')).toBe(false);
    expect(isInterState('MAHARASHTRA', 'Karnataka')).toBe(true);
  });

  it('defaults to intra-state when info missing', () => {
    expect(isInterState(null, 'Maharashtra')).toBe(false);
    expect(isInterState('Maharashtra', null)).toBe(false);
    expect(isInterState(null, null)).toBe(false);
  });
});

describe('getGstType', () => {
  it('returns cgst_sgst for same state, igst for different', () => {
    expect(getGstType('Maharashtra', 'Maharashtra')).toBe('cgst_sgst');
    expect(getGstType('Maharashtra', 'Karnataka')).toBe('igst');
  });
});

describe('calculateLineGst (MRP-inclusive)', () => {
  it('12% GST on ₹100 splits into ₹89.29 taxable + ₹10.71 GST', () => {
    const r = calculateLineGst(100, 12, 'cgst_sgst', true);
    expect(r.taxableAmount).toBeCloseTo(89.29, 2);
    expect(r.totalGstAmount).toBeCloseTo(10.71, 2);
    expect(r.cgstPercentage).toBe(6);
    expect(r.sgstPercentage).toBe(6);
    expect(r.cgstAmount + r.sgstAmount).toBeCloseTo(10.71, 2);
  });

  it('IGST puts the whole rate on igst, leaves cgst/sgst at 0', () => {
    const r = calculateLineGst(100, 12, 'igst', true);
    expect(r.igstPercentage).toBe(12);
    expect(r.igstAmount).toBeCloseTo(10.71, 2);
    expect(r.cgstAmount).toBe(0);
    expect(r.sgstAmount).toBe(0);
  });

  it('0% GST passes through cleanly', () => {
    const r = calculateLineGst(100, 0, 'cgst_sgst');
    expect(r.taxableAmount).toBe(100);
    expect(r.totalGstAmount).toBe(0);
  });

  it('exclusive mode (purchases) adds GST on top', () => {
    const r = calculateLineGst(100, 12, 'cgst_sgst', false);
    expect(r.taxableAmount).toBe(100);
    expect(r.totalGstAmount).toBeCloseTo(12, 2);
  });

  it('CGST + SGST always sum exactly to total GST (no drift)', () => {
    for (const rate of GST_RATES) {
      if (rate === 0) continue;
      const r = calculateLineGst(123.45, rate, 'cgst_sgst');
      expect(r.cgstAmount + r.sgstAmount).toBeCloseTo(r.totalGstAmount, 2);
    }
  });
});

describe('sumGstLines', () => {
  it('aggregates multiple lines into a single summary', () => {
    const lines = [
      calculateLineGst(100, 12, 'cgst_sgst'),
      calculateLineGst(200, 5, 'cgst_sgst'),
    ];
    const sum = sumGstLines(lines);
    expect(sum.taxableAmount).toBeCloseTo(lines[0]!.taxableAmount + lines[1]!.taxableAmount, 2);
    expect(sum.totalGstAmount).toBeCloseTo(lines[0]!.totalGstAmount + lines[1]!.totalGstAmount, 2);
  });
});
