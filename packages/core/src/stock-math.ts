/**
 * Stock math: pack ↔ unit conversion for "flexible selling" medicines.
 *
 * A strip of 10 tablets:
 *   packSize = 1 (one row in pack accounting)
 *   unitsPerPack = 10
 *
 * Selling 1 pack    → decrements current_quantity by 1
 * Selling 1 unit    → decrements current_quantity by 1/10 of a pack, tracked as
 *                     a separate units-in-strip column in the desktop schema.
 *                     In Cloud v1 we sell whole strips only OR track units
 *                     as a separate fractional column (TBD when POS lands).
 *
 * For now the helpers here handle:
 *   - sellingUnitToPackQty: convert N units → packs+remainder
 *   - mrpPerUnit: split a pack MRP across its units
 */

export interface PackInfo {
  packSize: number; // typically 1 (one strip = one pack accounting row)
  unitsPerPack: number | null; // null = pack-only (sold as whole strips/bottles)
}

/**
 * Convert a quantity of units into whole packs + leftover units.
 * Returns `null` if the medicine is pack-only (cannot sell individual units).
 */
export function unitsToPacks(
  units: number,
  info: PackInfo,
): { packs: number; remainderUnits: number } | null {
  if (!info.unitsPerPack || info.unitsPerPack <= 0) return null;
  const packs = Math.floor(units / info.unitsPerPack);
  const remainderUnits = units - packs * info.unitsPerPack;
  return { packs, remainderUnits };
}

/** Per-unit MRP from a per-pack MRP. */
export function mrpPerUnit(packMrp: number, info: PackInfo): number {
  if (!info.unitsPerPack || info.unitsPerPack <= 0) return packMrp;
  return packMrp / info.unitsPerPack;
}

/** Days until expiry. Negative = already expired. */
export function daysToExpiry(expiry: string | Date, now: Date = new Date()): number {
  const expiryDate = typeof expiry === 'string' ? new Date(expiry) : expiry;
  const ms = expiryDate.getTime() - now.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * Categorise expiry urgency for badges / colors.
 *   expired | critical (<30d) | warning (<60d) | ok | unknown
 */
export type ExpiryUrgency = 'expired' | 'critical' | 'warning' | 'ok' | 'unknown';

export function expiryUrgency(days: number | null): ExpiryUrgency {
  if (days === null) return 'unknown';
  if (days < 0) return 'expired';
  if (days <= 30) return 'critical';
  if (days <= 60) return 'warning';
  return 'ok';
}
