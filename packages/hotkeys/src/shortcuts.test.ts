import { describe, expect, it } from 'vitest';
import {
  ALL_SHORTCUTS,
  GLOBAL_NAV_SHORTCUTS,
  getScopesForPath,
  shortcutsByCategory,
  shortcutsForPage,
} from './shortcuts';

describe('shortcut registry', () => {
  it('GLOBAL_NAV_SHORTCUTS has F1..F12', () => {
    const fKeys = GLOBAL_NAV_SHORTCUTS.map((s) => s.keys).filter((k): k is string => typeof k === 'string' && /^F\d/.test(k));
    expect(fKeys.length).toBe(12);
  });

  it('every entry has a non-empty label', () => {
    for (const s of ALL_SHORTCUTS) {
      expect(s.label.length).toBeGreaterThan(0);
    }
  });
});

describe('shortcutsByCategory', () => {
  it('groups by category and excludes hidden', () => {
    const grouped = shortcutsByCategory();
    expect(grouped.Navigation.length).toBeGreaterThan(0);
    expect(grouped.Billing.length).toBeGreaterThan(0);
    for (const category of Object.values(grouped)) {
      for (const s of category) {
        expect(s.hide).not.toBe(true);
      }
    }
  });
});

describe('getScopesForPath', () => {
  it('returns billing/grid/form on POS path', () => {
    expect(getScopesForPath('/dashboard/sales/new')).toContain('billing');
    expect(getScopesForPath('/dashboard/sales/new')).toContain('grid');
  });

  it('returns list on inventory pages', () => {
    expect(getScopesForPath('/dashboard/medicines')).toEqual(['list']);
    expect(getScopesForPath('/dashboard/customers')).toEqual(['list']);
    expect(getScopesForPath('/dashboard/stores')).toEqual(['list']);
  });

  it('returns empty for unrelated paths', () => {
    expect(getScopesForPath('/dashboard')).toEqual([]);
    expect(getScopesForPath('/login')).toEqual([]);
  });
});

describe('shortcutsForPage', () => {
  it('returns list-scope entries on a list page (no planned, no hidden)', () => {
    const items = shortcutsForPage('/dashboard/medicines');
    expect(items.length).toBeGreaterThan(0);
    for (const s of items) {
      expect(s.hide).not.toBe(true);
      expect(s.planned).not.toBe(true);
      expect(s.scope).toBe('list');
    }
  });

  it('returns empty on dashboard home (no special scope)', () => {
    expect(shortcutsForPage('/dashboard')).toEqual([]);
  });
});
