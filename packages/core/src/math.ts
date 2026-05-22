/**
 * Numeric helpers used across GST + bill math.
 */

/** Round to 2 decimal places (paise precision). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Round to whole rupees. */
export function round0(n: number): number {
  return Math.round(n);
}

/**
 * Compute the round-off adjustment applied to make the bill total a whole rupee.
 * Returns the signed delta so that `total + delta = whole rupee`.
 *
 *   roundOff(123.40) →  0.60   (round up to 124)
 *   roundOff(123.20) → -0.20   (round down to 123)
 *   roundOff(100.00) →  0      (already whole)
 */
export function roundOff(amount: number): number {
  return round2(Math.round(amount) - amount);
}
