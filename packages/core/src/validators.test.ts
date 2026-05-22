import { describe, expect, it } from 'vitest';
import {
  validateGstin,
  validatePincode,
  validateHsn,
  validateIndianPhone,
  validateStoreCode,
  validatePin,
  gstinStateCode,
} from './validators';

describe('validateGstin', () => {
  it('accepts a valid GSTIN', () => {
    expect(validateGstin('27ABCDE1234F1Z5')).toBeNull();
  });
  it('rejects wrong length', () => {
    expect(validateGstin('27ABCDE1234F1Z')).not.toBeNull();
  });
  it('rejects malformed pattern', () => {
    expect(validateGstin('27abcde1234f1z5')).not.toBeNull();
  });
  it('treats empty as valid (optional field)', () => {
    expect(validateGstin('')).toBeNull();
    expect(validateGstin('   ')).toBeNull();
  });
});

describe('validatePincode', () => {
  it('accepts 6-digit pincode', () => {
    expect(validatePincode('400001')).toBeNull();
  });
  it('rejects 5-digit', () => {
    expect(validatePincode('40001')).not.toBeNull();
  });
  it('rejects letters', () => {
    expect(validatePincode('40000A')).not.toBeNull();
  });
});

describe('validateHsn', () => {
  it('accepts 4-8 digit HSN', () => {
    expect(validateHsn('3004')).toBeNull();
    expect(validateHsn('30049011')).toBeNull();
  });
  it('rejects 3-digit', () => {
    expect(validateHsn('300')).not.toBeNull();
  });
  it('rejects 9-digit', () => {
    expect(validateHsn('300490115')).not.toBeNull();
  });
});

describe('validateIndianPhone', () => {
  it('accepts valid 10-digit mobile starting with 6-9', () => {
    expect(validateIndianPhone('9876543210')).toBeNull();
    expect(validateIndianPhone('6543210987')).toBeNull();
  });
  it('accepts +91 prefix', () => {
    expect(validateIndianPhone('+91 9876543210')).toBeNull();
    expect(validateIndianPhone('+91-9876543210')).toBeNull();
  });
  it('rejects starting with 5', () => {
    expect(validateIndianPhone('5876543210')).not.toBeNull();
  });
  it('rejects 9 digits', () => {
    expect(validateIndianPhone('987654321')).not.toBeNull();
  });
});

describe('validateStoreCode', () => {
  it('accepts 2-6 char uppercase alphanumeric', () => {
    expect(validateStoreCode('MUM01')).toBeNull();
    expect(validateStoreCode('AB')).toBeNull();
    expect(validateStoreCode('BLR-A1')).toBeNull();
  });
  it('rejects empty', () => {
    expect(validateStoreCode('')).not.toBeNull();
  });
  it('rejects 7+ chars', () => {
    expect(validateStoreCode('TOOLONG')).not.toBeNull();
  });
});

describe('validatePin', () => {
  it('accepts 4-6 digit PIN', () => {
    expect(validatePin('1234')).toBeNull();
    expect(validatePin('123456')).toBeNull();
  });
  it('rejects letters', () => {
    expect(validatePin('12a4')).not.toBeNull();
  });
});

describe('gstinStateCode', () => {
  it('returns first 2 digits when valid', () => {
    expect(gstinStateCode('27ABCDE1234F1Z5')).toBe('27');
  });
  it('returns null when null/short/invalid', () => {
    expect(gstinStateCode(null)).toBeNull();
    expect(gstinStateCode('A')).toBeNull();
    expect(gstinStateCode('AB12345')).toBeNull();
  });
});
