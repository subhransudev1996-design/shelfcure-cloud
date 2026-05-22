/**
 * Central registry of every shortcut the Cloud apps support.
 *
 * Used by:
 *   - DashboardShell (web) and AppShell (desktop) — bind the 'global' entries
 *   - ShortcutHelpOverlay — renders the cheatsheet from this same list
 *
 * Keep this in sync with the actual bindings. The help overlay reads from
 * here so adding a binding without adding a registry entry leaves users
 * with an undiscoverable feature.
 *
 * Route paths follow the Cloud route table (`/dashboard/...`), NOT the
 * Offline desktop routes.
 */

export type ShortcutScope = 'global' | 'billing' | 'grid' | 'list' | 'form';
export type ShortcutCategory =
  | 'Navigation'
  | 'Billing'
  | 'Grid'
  | 'Form'
  | 'List'
  | 'Misc';

export interface ShortcutDef {
  keys: string | string[];
  label: string;
  category: ShortcutCategory;
  scope: ShortcutScope;
  /** Optional route — global nav shortcuts use this. */
  path?: string;
  /** Restrict to specific pages (exact pathname match). */
  onPaths?: string[];
  /** If true, omit from help overlay. */
  hide?: boolean;
  /** Show in help overlay greyed-out: 'coming soon'. */
  planned?: boolean;
}

// ─── Global navigation — Marg-style F-keys ─────────────────────────

export const GLOBAL_NAV_SHORTCUTS: ShortcutDef[] = [
  { keys: 'F1', label: 'Help / Show shortcuts', category: 'Misc', scope: 'global' },
  { keys: 'F2', label: 'New Sale (Billing)', category: 'Navigation', scope: 'global', path: '/dashboard/sales/new', planned: true },
  { keys: 'F3', label: 'New Purchase', category: 'Navigation', scope: 'global', path: '/dashboard/purchases/new', planned: true },
  { keys: 'F4', label: 'Stock / Medicines', category: 'Navigation', scope: 'global', path: '/dashboard/medicines' },
  { keys: 'F5', label: 'Receipts', category: 'Navigation', scope: 'global', path: '/dashboard/finance?tab=receipts', planned: true },
  { keys: 'F6', label: 'Payments', category: 'Navigation', scope: 'global', path: '/dashboard/finance?tab=payments', planned: true },
  { keys: 'F7', label: 'Day Book', category: 'Navigation', scope: 'global', path: '/dashboard/reports/daily', planned: true },
  { keys: 'F8', label: 'Sale Return', category: 'Navigation', scope: 'global', path: '/dashboard/sales/returns/new', planned: true },
  { keys: 'F9', label: 'Purchase Return', category: 'Navigation', scope: 'global', path: '/dashboard/purchases/return', planned: true },
  { keys: 'F10', label: 'Reports', category: 'Navigation', scope: 'global', path: '/dashboard/reports', planned: true },
  { keys: 'F11', label: 'Customers', category: 'Navigation', scope: 'global', path: '/dashboard/customers' },
  { keys: 'F12', label: 'Settings', category: 'Navigation', scope: 'global', path: '/dashboard/settings', planned: true },

  { keys: 'Ctrl+H', label: 'Sales History', category: 'Navigation', scope: 'global', path: '/dashboard/sales', planned: true },
  { keys: 'Ctrl+I', label: 'Inventory', category: 'Navigation', scope: 'global', path: '/dashboard/medicines' },
  { keys: 'Ctrl+D', label: 'Dashboard', category: 'Navigation', scope: 'global', path: '/dashboard' },
  { keys: 'Ctrl+U', label: 'Suppliers', category: 'Navigation', scope: 'global', path: '/dashboard/suppliers', planned: true },
  { keys: 'Ctrl+J', label: 'Doctors', category: 'Navigation', scope: 'global', path: '/dashboard/doctors', planned: true },
  { keys: 'Ctrl+,', label: 'Settings', category: 'Navigation', scope: 'global', path: '/dashboard/settings', hide: true, planned: true },

  { keys: ['?', 'Ctrl+/'], label: 'Show shortcuts overlay', category: 'Misc', scope: 'global' },
];

// ─── Billing-screen shortcuts (active inside the POS) ──────────────

export const BILLING_SHORTCUTS: ShortcutDef[] = [
  { keys: '↑ / ↓', label: 'Previous / next bill row', category: 'Grid', scope: 'billing' },
  { keys: '← / →', label: 'Move between cells in a row', category: 'Grid', scope: 'billing' },
  { keys: 'Insert', label: 'Jump to medicine search (add row)', category: 'Grid', scope: 'billing' },
  { keys: 'Delete', label: 'Remove the selected row', category: 'Grid', scope: 'billing' },
  { keys: '+', label: 'Increase quantity by 1', category: 'Grid', scope: 'billing' },
  { keys: '-', label: 'Decrease quantity by 1', category: 'Grid', scope: 'billing' },
  { keys: '*', label: 'Jump to medicine search', category: 'Billing', scope: 'billing' },
  { keys: 'Enter', label: 'In cell: back to search · In empty search: save bill', category: 'Form', scope: 'billing' },
  { keys: 'Ctrl+A', label: 'Save / complete the bill (Accept)', category: 'Billing', scope: 'billing' },
  { keys: 'Ctrl+P', label: 'Print bill (after completion)', category: 'Billing', scope: 'billing' },
  { keys: 'Ctrl+F', label: 'Focus medicine search', category: 'Billing', scope: 'billing' },
  { keys: 'Ctrl+R', label: 'Focus customer search', category: 'Billing', scope: 'billing' },
  { keys: 'Ctrl+Enter', label: 'Complete sale', category: 'Billing', scope: 'billing' },
];

// ─── List / form helpers ──────────────────────────────────────────

export const LIST_SHORTCUTS: ShortcutDef[] = [
  { keys: '/', label: 'Focus search box', category: 'List', scope: 'list' },
  { keys: 'n', label: 'Add new (medicine / customer / supplier / doctor)', category: 'List', scope: 'list' },
  { keys: 'Ctrl+F', label: 'Focus search box (alternate)', category: 'List', scope: 'list' },
  { keys: '↑ / ↓', label: 'Previous / next row', category: 'List', scope: 'list' },
  { keys: 'Enter', label: 'Open selected row', category: 'List', scope: 'list' },
  { keys: '← / →', label: 'Previous / next page', category: 'List', scope: 'list' },
];

export const ALL_SHORTCUTS: ShortcutDef[] = [
  ...GLOBAL_NAV_SHORTCUTS,
  ...BILLING_SHORTCUTS,
  ...LIST_SHORTCUTS,
];

export function shortcutsByCategory(): Record<ShortcutCategory, ShortcutDef[]> {
  const out: Record<ShortcutCategory, ShortcutDef[]> = {
    Navigation: [],
    Billing: [],
    Grid: [],
    Form: [],
    List: [],
    Misc: [],
  };
  for (const s of ALL_SHORTCUTS) {
    if (s.hide) continue;
    out[s.category].push(s);
  }
  return out;
}

export function getScopesForPath(pathname: string): ShortcutScope[] {
  if (pathname.startsWith('/dashboard/sales/new') || pathname.startsWith('/dashboard/sales/pos')) {
    return ['billing', 'grid', 'form'];
  }
  if (pathname.startsWith('/dashboard/purchases/new') || pathname.startsWith('/dashboard/purchases/manual')) {
    return ['billing', 'grid', 'form'];
  }
  if (pathname.startsWith('/dashboard/sales/returns/new')) return ['billing'];
  if (pathname === '/dashboard/purchases/return') return ['billing'];
  if (
    pathname === '/dashboard/medicines' ||
    pathname === '/dashboard/customers' ||
    pathname === '/dashboard/suppliers' ||
    pathname === '/dashboard/doctors' ||
    pathname === '/dashboard/purchases' ||
    pathname === '/dashboard/stores'
  ) {
    return ['list'];
  }
  return [];
}

export function shortcutsForPage(pathname: string): ShortcutDef[] {
  const scopes = getScopesForPath(pathname);
  if (scopes.length === 0) return [];
  return ALL_SHORTCUTS.filter((s) => {
    if (s.hide || s.planned) return false;
    if (!scopes.includes(s.scope)) return false;
    if (s.onPaths && !s.onPaths.includes(pathname)) return false;
    return true;
  });
}
