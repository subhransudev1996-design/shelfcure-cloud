import { describe, expect, it } from 'vitest';
import { unitsToPacks, mrpPerUnit, daysToExpiry, expiryUrgency } from './stock-math';

describe('unitsToPacks', () => {
  it('splits 25 units into 2 packs + 5 remainder for 10-per-pack', () => {
    expect(unitsToPacks(25, { packSize: 1, unitsPerPack: 10 })).toEqual({
      packs: 2,
      remainderUnits: 5,
    });
  });

  it('exact pack count has 0 remainder', () => {
    expect(unitsToPacks(30, { packSize: 1, unitsPerPack: 10 })).toEqual({
      packs: 3,
      remainderUnits: 0,
    });
  });

  it('returns null for pack-only medicines', () => {
    expect(unitsToPacks(25, { packSize: 1, unitsPerPack: null })).toBeNull();
    expect(unitsToPacks(25, { packSize: 1, unitsPerPack: 0 })).toBeNull();
  });
});

describe('mrpPerUnit', () => {
  it('splits ₹150 strip MRP across 10 tablets', () => {
    expect(mrpPerUnit(150, { packSize: 1, unitsPerPack: 10 })).toBeCloseTo(15, 2);
  });

  it('returns pack MRP when no unit split is configured', () => {
    expect(mrpPerUnit(150, { packSize: 1, unitsPerPack: null })).toBe(150);
  });
});

describe('daysToExpiry', () => {
  it('positive for future expiry', () => {
    const today = new Date('2026-05-22');
    expect(daysToExpiry('2026-08-20', today)).toBeGreaterThan(0);
  });

  it('negative for past expiry', () => {
    const today = new Date('2026-05-22');
    expect(daysToExpiry('2026-01-01', today)).toBeLessThan(0);
  });
});

describe('expiryUrgency', () => {
  it('expired for negative days', () => {
    expect(expiryUrgency(-1)).toBe('expired');
  });
  it('critical for 0-30 days', () => {
    expect(expiryUrgency(0)).toBe('critical');
    expect(expiryUrgency(15)).toBe('critical');
    expect(expiryUrgency(30)).toBe('critical');
  });
  it('warning for 31-60 days', () => {
    expect(expiryUrgency(31)).toBe('warning');
    expect(expiryUrgency(60)).toBe('warning');
  });
  it('ok for 60+ days', () => {
    expect(expiryUrgency(61)).toBe('ok');
    expect(expiryUrgency(365)).toBe('ok');
  });
  it('unknown for null', () => {
    expect(expiryUrgency(null)).toBe('unknown');
  });
});
