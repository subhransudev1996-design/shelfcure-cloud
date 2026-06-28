// Ported, function-for-function, from the ShelfCure desktop app's Rust
// implementation: C:\Projects\APPLICATIONS\shelfcure\desktop\src-tauri\src\commands\gemini.rs
// (validateGstin/fixGstinOcr/postprocess* lines ~74-461, repairJson lines ~463-593).
// These are the deterministic fixes that make Gemini's raw extraction usable —
// do not "simplify" them, each one exists because of a specific real-invoice
// failure mode observed in production.

// deno-lint-ignore-file no-explicit-any
type Json = Record<string, any>;

/** Validate an Indian GSTIN using format check + checksum verification. */
export function validateGstin(raw: string): string | null {
  const cleaned = raw
    .split('')
    .filter((c) => /[a-zA-Z0-9]/.test(c))
    .join('')
    .toUpperCase();

  if (cleaned.length !== 15) return null;
  const chars = cleaned.split('');

  const stateCode = parseInt(cleaned.slice(0, 2), 10);
  if (!Number.isInteger(stateCode) || stateCode < 1 || stateCode > 38) return null;

  for (let i = 2; i < 7; i++) {
    if (!/[A-Z]/.test(chars[i]!)) return null;
  }
  for (let i = 7; i < 11; i++) {
    if (!/[0-9]/.test(chars[i]!)) return null;
  }
  if (!/[A-Z]/.test(chars[11]!)) return null;
  if (!/[A-Z0-9]/.test(chars[12]!)) return null;
  if (chars[13] !== 'Z') return null;

  const gstinChars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let total = 0;
  for (let i = 0; i < 14; i++) {
    const idx = gstinChars.indexOf(chars[i]!);
    if (idx === -1) return null;
    const factor = i % 2 === 0 ? 1 : 2;
    const product = idx * factor;
    total += Math.floor(product / 36) + (product % 36);
  }
  const checkVal = (36 - (total % 36)) % 36;
  const expectedCheck = gstinChars[checkVal] ?? '0';

  if (chars[14] !== expectedCheck) return null;
  return cleaned;
}

/** Fix common OCR character substitutions in a GSTIN string. */
export function fixGstinOcr(raw: string): string {
  const cleaned = raw
    .split('')
    .filter((c) => /[a-zA-Z0-9]/.test(c))
    .join('')
    .toUpperCase();
  if (cleaned.length !== 15) return cleaned;

  const chars = cleaned.split('');
  const digitPositions = [0, 1, 7, 8, 9, 10];
  const letterPositions = [2, 3, 4, 5, 6, 11, 13];

  const toDigit: Record<string, string> = { O: '0', I: '1', L: '1', S: '5', B: '8', G: '6', T: '7', Z: '2' };
  const toLetter: Record<string, string> = { '0': 'O', '1': 'I', '5': 'S', '8': 'B', '6': 'G' };

  for (const pos of digitPositions) {
    chars[pos] = toDigit[chars[pos]!] ?? chars[pos]!;
  }
  for (const pos of letterPositions) {
    chars[pos] = toLetter[chars[pos]!] ?? chars[pos]!;
  }
  return chars.join('');
}

/** Validate and correct the supplier_gstin field. */
export function postprocessGstin(parsed: Json): void {
  const raw = parsed.supplier_gstin;
  if (typeof raw !== 'string') return;
  if (raw === '') {
    parsed.supplier_gstin = null;
    return;
  }

  const direct = validateGstin(raw);
  if (direct) {
    parsed.supplier_gstin = direct;
    return;
  }

  const fixed = fixGstinOcr(raw);
  const afterFix = validateGstin(fixed);
  if (afterFix) {
    parsed.supplier_gstin = afterFix;
    return;
  }

  parsed.supplier_gstin = null;
}

/**
 * Fix HSN/batch_number column-shift errors in items. Common AI mistake: when
 * Batch and Expiry columns are blank (*), the AI shifts the HSN code (a pure
 * 6-digit number) into batch_number.
 */
export function postprocessHsnBatch(parsed: Json): void {
  const items = parsed.items;
  if (!Array.isArray(items)) return;

  for (const item of items as Json[]) {
    const batchVal = typeof item.batch_number === 'string' ? item.batch_number : '';
    const hsnVal = typeof item.hsn_code === 'string' ? item.hsn_code : '';

    const batchIsHsn = batchVal.length === 6 && /^[0-9]+$/.test(batchVal);
    if (batchIsHsn) {
      if (hsnVal === '') item.hsn_code = batchVal;
      item.batch_number = null;
    }

    const hsnHasLetters = hsnVal !== '' && /[a-zA-Z]/.test(hsnVal);
    if (hsnHasLetters) {
      const currentBatch = typeof item.batch_number === 'string' ? item.batch_number : '';
      if (currentBatch === '' || item.batch_number == null) {
        item.batch_number = hsnVal;
      }
      item.hsn_code = null;
    }
  }
}

/**
 * Remove duplicate line items caused by the AI splitting a single physical
 * bill row into two. A row is a split-duplicate of its predecessor only when
 * medicine_name AND quantity AND purchase_rate AND mrp AND amount all match.
 */
export function postprocessDedupSplitRows(parsed: Json): void {
  const items = parsed.items;
  if (!Array.isArray(items)) return;

  const norm = (s: string) => s.trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ');
  const fnum = (v: Json, key: string): number => {
    const n = v[key];
    return typeof n === 'number' ? n : NaN;
  };
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

  const kept: Json[] = [];
  for (const item of items as Json[]) {
    const name = norm(typeof item.medicine_name === 'string' ? item.medicine_name : '');
    const prev = kept[kept.length - 1];
    const isDup =
      name !== '' &&
      !!prev &&
      norm(typeof prev.medicine_name === 'string' ? prev.medicine_name : '') === name &&
      near(fnum(item, 'quantity'), fnum(prev, 'quantity')) &&
      near(fnum(item, 'purchase_rate'), fnum(prev, 'purchase_rate')) &&
      near(fnum(item, 'mrp'), fnum(prev, 'mrp')) &&
      near(fnum(item, 'amount'), fnum(prev, 'amount'));
    if (!isDup) kept.push(item);
  }

  parsed.items = kept;
  parsed.total_items = kept.length;
}

/** Infer / correct missing or zero 'amount' (Gross Amount) in items. */
export function postprocessItemAmounts(parsed: Json): void {
  const items = parsed.items;
  if (!Array.isArray(items)) return;

  for (const item of items as Json[]) {
    const amount = typeof item.amount === 'number' ? item.amount : 0;
    if (amount < 0.01) {
      const rate = typeof item.purchase_rate === 'number' ? item.purchase_rate : 0;
      const qty = typeof item.quantity === 'number' ? item.quantity : 0;
      if (rate > 0.01 && qty > 0) {
        item.amount = Math.round(rate * qty * 100) / 100;
      }
    }
  }
}

/**
 * Infer / correct discounts when AI misses them. Four strategies, in order:
 * back-calculate per-item discount_percentage; compute bill_discount from
 * per-item discounts; infer bill_discount from subtotal vs taxable sum;
 * infer from bill-level totals (most reliable).
 */
export function postprocessDiscount(parsed: Json): void {
  const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

  const billDiscount = num(parsed.bill_discount);
  const subtotal = num(parsed.subtotal);

  const items = Array.isArray(parsed.items) ? (parsed.items as Json[]) : [];

  // Strategy 2: back-calculate per-item discount_percentage.
  for (const item of items) {
    const discPct = num(item.discount_percentage);
    const amount = num(item.amount);
    const taxable = num(item.taxable_amount);
    if (discPct < 0.01 && amount > 0.01 && taxable > 0.01 && amount > taxable + 0.5) {
      const inferredPct = Math.round(((amount - taxable) / amount) * 100 * 100) / 100;
      if (inferredPct >= 0.5 && inferredPct <= 50) {
        item.discount_percentage = inferredPct;
      }
    }
  }

  // Strategy 3: compute bill_discount from per-item discount_percentage.
  if (billDiscount < 0.01) {
    const totalDiscount = items.reduce((sum, item) => {
      const discPct = num(item.discount_percentage);
      const amount = num(item.amount);
      return discPct > 0.01 && amount > 0.01 ? sum + (amount * discPct) / 100 : sum;
    }, 0);
    if (totalDiscount > 0.5) {
      parsed.bill_discount = Math.round(totalDiscount * 100) / 100;
    }
  }

  // Strategy 1: infer bill_discount from subtotal vs per-item taxable sum.
  const currentBillDiscount = num(parsed.bill_discount);
  if (currentBillDiscount < 0.01 && subtotal > 0.01) {
    const taxableSum = items.reduce((sum, item) => {
      const taxable = item.taxable_amount;
      return sum + (typeof taxable === 'number' ? taxable : num(item.amount));
    }, 0);
    if (taxableSum > 0.01 && subtotal > taxableSum + 0.5) {
      parsed.bill_discount = Math.round((subtotal - taxableSum) * 100) / 100;
    }
  }

  // Strategy 4 (most reliable): infer from bill-level totals.
  const finalBillDiscount = num(parsed.bill_discount);
  if (finalBillDiscount < 0.01 && subtotal > 0.01) {
    const totalAmount = num(parsed.total_amount);
    const gstAmount = num(parsed.gst_amount);
    const roundOff = num(parsed.bill_round_off);

    if (totalAmount > 0.01 && gstAmount > 0.01) {
      const taxableValue = totalAmount - gstAmount - roundOff;
      if (subtotal > taxableValue + 0.5) {
        const inferred = Math.round((subtotal - taxableValue) * 100) / 100;
        if (inferred > 0 && inferred < subtotal) {
          parsed.bill_discount = inferred;

          const discPct = Math.round((inferred / subtotal) * 100 * 100) / 100;
          if (discPct >= 0.5 && discPct <= 50) {
            for (const item of items) {
              if (num(item.discount_percentage) < 0.01) {
                item.discount_percentage = discPct;
              }
            }
          }
        }
      }
    }
  }
}

/**
 * Repair common JSON defects in Gemini output: strips markdown code fences,
 * inserts a missing `}` before `, {` inside arrays, removes trailing commas
 * before `]` or `}`.
 */
export function repairJson(raw: string): string {
  let s = raw.trim();

  if (s.startsWith('```')) {
    const firstNewline = s.indexOf('\n');
    if (firstNewline !== -1) s = s.slice(firstNewline + 1);
    if (s.endsWith('```')) s = s.slice(0, -3).trimEnd();
  }

  // Fix 1: missing `}` before `, {` in arrays.
  let result = '';
  let bracketDepth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;

    if (escapeNext) {
      result += c;
      escapeNext = false;
      continue;
    }
    if (c === '\\' && inString) {
      result += c;
      escapeNext = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      result += c;
      continue;
    }
    if (inString) {
      result += c;
      continue;
    }

    if (c === '[') bracketDepth++;
    else if (c === ']') bracketDepth--;

    if (c === ',') {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j]!)) j++;
      if (j < s.length && s[j] === '{' && bracketDepth > 0) {
        const trimmedEnd = result.replace(/\s+$/, '');
        const lastChar = trimmedEnd[trimmedEnd.length - 1];
        if (lastChar !== '}' && lastChar !== ']') {
          result += '}';
        }
      }
    }

    result += c;
  }

  // Fix 2: trailing commas before `]` or `}`.
  let fixed = '';
  for (let i = 0; i < result.length; i++) {
    if (result[i] === ',') {
      let k = i + 1;
      while (k < result.length && /[ \n\r\t]/.test(result[k]!)) k++;
      if (k < result.length && (result[k] === ']' || result[k] === '}')) {
        continue;
      }
    }
    fixed += result[i];
  }

  return fixed;
}

/** Runs all post-processing passes in the same order as the desktop app. */
export function postprocessScannedBill(parsed: Json): Json {
  postprocessGstin(parsed);
  postprocessHsnBatch(parsed);
  postprocessItemAmounts(parsed);
  postprocessDedupSplitRows(parsed);
  postprocessDiscount(parsed);
  return parsed;
}
