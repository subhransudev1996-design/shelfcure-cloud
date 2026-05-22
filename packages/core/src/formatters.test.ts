import { describe, expect, it } from 'vitest';
import {
  formatCurrency,
  formatCurrencyRounded,
  formatNumber,
  formatDate,
  todayIST,
  financialYear,
} from './formatters';

describe('formatCurrency', () => {
  it('formats with ₹ and 2 decimals', () => {
    const out = formatCurrency(1234.5);
    expect(out).toContain('₹');
    expect(out).toContain('1,234.50');
  });

  it('rounded form has no decimals', () => {
    expect(formatCurrencyRounded(1234.5)).not.toContain('.');
  });
});

describe('formatNumber', () => {
  it('uses Indian grouping (lakh)', () => {
    expect(formatNumber(100000)).toBe('1,00,000');
  });
});

describe('formatDate', () => {
  it('formats ISO date', () => {
    const out = formatDate('2026-05-22');
    expect(out).toContain('May');
    expect(out).toContain('2026');
  });

  it('handles null gracefully', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
  });
});

describe('todayIST', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(todayIST()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('financialYear', () => {
  it('April-onwards starts the new FY', () => {
    expect(financialYear('2026-04-01')).toBe('2627');
    expect(financialYear('2026-12-31')).toBe('2627');
  });
  it('March belongs to the previous FY', () => {
    expect(financialYear('2026-03-31')).toBe('2526');
    expect(financialYear('2026-01-15')).toBe('2526');
  });
});
