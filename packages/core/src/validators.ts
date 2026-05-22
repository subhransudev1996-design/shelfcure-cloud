/**
 * Pure validation helpers. Each returns a string error message on failure,
 * or null on success — so they compose cleanly into form-level validators.
 */

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PINCODE_REGEX = /^[0-9]{6}$/;
const HSN_REGEX = /^[0-9]{4,8}$/;
const INDIAN_PHONE_REGEX = /^(?:\+91[-\s]?)?[6-9][0-9]{9}$/;
const STORE_CODE_REGEX = /^[A-Z0-9-]{2,6}$/;
const PIN_REGEX = /^[0-9]{4,6}$/;

export type Validator<T> = (value: T) => string | null;

export const validateGstin: Validator<string> = (value) => {
  const trimmed = value.trim();
  if (!trimmed) return null; // optional in many places
  if (trimmed.length !== 15) return 'GSTIN must be exactly 15 characters';
  if (!GSTIN_REGEX.test(trimmed)) return 'GSTIN format is invalid';
  return null;
};

export const validatePincode: Validator<string> = (value) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!PINCODE_REGEX.test(trimmed)) return 'Pincode must be 6 digits';
  return null;
};

export const validateHsn: Validator<string> = (value) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!HSN_REGEX.test(trimmed)) return 'HSN must be 4–8 digits';
  return null;
};

/** Indian mobile: optional +91 prefix, then 10 digits starting with 6/7/8/9. */
export const validateIndianPhone: Validator<string> = (value) => {
  const cleaned = value.replace(/[\s-]/g, '');
  if (!cleaned) return null;
  if (!INDIAN_PHONE_REGEX.test(cleaned)) return 'Phone must be a valid Indian mobile (10 digits)';
  return null;
};

export const validateStoreCode: Validator<string> = (value) => {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return 'Store code is required';
  if (!STORE_CODE_REGEX.test(trimmed)) return 'Store code: 2–6 chars, uppercase letters/digits/hyphen';
  return null;
};

export const validatePin: Validator<string> = (value) => {
  if (!value) return 'PIN is required';
  if (!PIN_REGEX.test(value)) return 'PIN must be 4–6 digits';
  return null;
};

/** Returns the 2-digit state code from a GSTIN, or null if invalid. */
export function gstinStateCode(gstin: string | null | undefined): string | null {
  if (!gstin || gstin.length < 2) return null;
  const code = gstin.substring(0, 2);
  return /^\d{2}$/.test(code) ? code : null;
}
