// scan-purchase-bill Edge Function
// ---------------------------------------------------------------------------
// Ports the ShelfCure desktop app's "AI Scan Purchase Bill" feature
// (C:\Projects\APPLICATIONS\shelfcure\desktop\src-tauri\src\commands\gemini.rs,
// `scan_purchase_bill`) into this cloud codebase. Why an Edge Function and not
// a direct browser→Gemini call? Calling Gemini requires GEMINI_API_KEY, which
// must never reach the browser. So:
//
//   1. Browser uploads a bill image (base64) with its own JWT.
//   2. We verify the JWT via a user-scoped client (same pattern as
//      create-staff/index.ts) and run the quota check/record RPCs through
//      that same client, so normal RLS/role checks (store access, org
//      membership) apply exactly as they do for every other store action —
//      no separate permission logic needed here.
//   3. We call Gemini directly with the service secret, then run the same
//      deterministic post-processing the desktop app applies before ever
//      showing the result to a user.
//   4. Only on full success do we consume one quota credit.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { postprocessScannedBill, repairJson } from '../_shared/bill-scan-postprocess.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB, same ceiling as desktop
const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf'];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

interface ScanInput {
  store_id: string;
  mime_type: string;
  image_base64: string;
}

function validate(input: any): ScanInput | string {
  if (!input || typeof input !== 'object') return 'invalid_payload';
  const { store_id, mime_type, image_base64 } = input;
  if (typeof store_id !== 'string' || store_id.length < 10) return 'invalid_store_id';
  if (typeof mime_type !== 'string' || !ALLOWED_MIME_PREFIXES.some((p) => mime_type.startsWith(p))) {
    return 'invalid_mime_type';
  }
  if (typeof image_base64 !== 'string' || image_base64.length < 10) return 'invalid_image';
  // base64 is ~4/3 the byte size; this is a fast upper-bound check, not exact.
  if (image_base64.length * 0.75 > MAX_IMAGE_BYTES) return 'image_too_large';
  return { store_id, mime_type, image_base64 };
}

// The exact prompt from gemini.rs:607-1053 — see that file's header comment
// for the production-tested anti-error rules this encodes. Do not weaken or
// "clean up" this prompt without re-validating against real invoices.
const PROMPT = `You are an expert Indian pharmacy invoice OCR and data extractor. Your task is to read the provided pharmacy GST invoice image and extract ALL data with 100% accuracy.

=== MASTER RULE: EXTRACT ONLY — NEVER CALCULATE ===
You must ONLY extract values that are physically PRINTED on the bill.
Do NOT perform ANY arithmetic. Do NOT compute any amounts.
If a field is not printed on the bill, return null for that field.
Every number you return must be a number you can point to on the printed bill.

=== STEP -1: VERIFY THIS IS A PURCHASE/SUPPLY INVOICE (DO THIS BEFORE STEP 0) ===
This tool is ONLY for purchase invoices — documents where a supplier SOLD/SUPPLIED goods to the pharmacy.
Check the document's title/heading for an EXPLICIT printed label showing it is something else, such as:
- "SALES RETURN", "RETURN", "CREDIT NOTE", "DEBIT NOTE" (goods being returned, not purchased — saving this as a purchase would wrongly ADD stock for items that were actually removed)
- "QUOTATION", "PROFORMA INVOICE", "ESTIMATE" (not a finalized transaction)
- "DELIVERY CHALLAN" with no rate/amount/GST columns at all (not a billable invoice)
If the document EXPLICITLY prints one of these labels prominently, set:
  "is_purchase_invoice": false
  "document_type_note": a short plain-English description of what the document actually is (e.g. "This is a Sales Return / Credit Note for breakage/expiry, not a purchase invoice.")
Still extract supplier/items/totals as best you can even when is_purchase_invoice is false — the user may still want to see the data.
Otherwise (the normal case — a regular tax/GST/purchase invoice), set "is_purchase_invoice": true and "document_type_note": null.
Do NOT guess false just because a bill looks unusual or hard to read — only set false when there is a clear, explicit printed label proving it is not a purchase invoice.

=== STEP 0 (DO THIS AFTER STEP -1) ===
Before extracting any data, COUNT the number of line items in the item table:
1. Look at the SN (serial number) column on the LEFT side of the table.
2. Find the LAST numbered row. That number = total_items.
3. You MUST return EXACTLY that many objects in the "items" array.
4. If any SN row has unusual data (batch=*, expiry blank, non-medicine product like diapers/condoms), you MUST STILL include it.
5. Two items with the same brand but different sizes (e.g. "MANFORCE CONDOM 3'S" at SN 1 and "MANFORCE CONDOM 10'S" at SN 4) are SEPARATE items — extract BOTH with their OWN row data.
6. items.length MUST EQUAL total_items. If it doesn't, you have a bug — go re-read the table.
7. NEVER split ONE physical row into TWO items. One SN row = exactly ONE item object = ONE batch number, ONE quantity, ONE amount.
8. items.length MUST NOT EXCEED total_items. If you produced MORE items than there are SN rows, you duplicated a row — go re-read and delete the extra.

=== ANTI-ROW-SPLITTING RULE (CRITICAL — DO NOT DUPLICATE ROWS) ===
A batch number is a SINGLE token that belongs to exactly ONE row. It may contain hyphens, slashes, dots or spaces (examples: "OFC-25001", "AB/2024", "K26.00091", "OFC 25001"). Such punctuation does NOT mean two batches — it is still ONE batch number for ONE line item.
- Do NOT read "OFC-25001" as two values "OFC-25001" and "OFC25001".
- Do NOT create a second line item for the same medicine just because the batch text looks split, smudged, or wrapped onto two visual lines.
- If you see the same medicine name appear to repeat with the SAME quantity, SAME rate, SAME MRP and SAME amount, it is ONE row that you mistakenly duplicated — keep only ONE.
- The ONLY way a medicine legitimately appears twice is as two SEPARATE numbered SN rows, each with its OWN distinct quantity/rate/amount printed on the bill.

**IMPORTANT: Each row is INDEPENDENT.** When you extract SN 1, you read ONLY the cells in physical row 1. When you extract SN 4, you read ONLY the cells in physical row 4. NEVER copy or inherit a value from one row to another row, even if the product names look similar.

CRITICAL: Return ONLY valid JSON. No markdown, no code blocks, no explanations. Starting { ending }. Pure JSON only.

=== OUTPUT SCHEMA ===
{
  "is_purchase_invoice": true or false,
  "document_type_note": "string or null",
  "supplier_name": "string or null",
  "supplier_gstin": "string or null",
  "supplier_phone": "string or null",
  "supplier_address": "string or null",
  "supplier_city": "string or null",
  "supplier_state": "string or null",
  "bill_number": "string or null",
  "bill_date": "YYYY-MM-DD or null",
  "payment_type": "CREDIT or CASH",
  "subtotal": number or null,
  "bill_discount": number or null,
  "bill_cgst": number or null,
  "bill_sgst": number or null,
  "bill_igst": number or null,
  "bill_round_off": number or null,
  "total_amount": number or null,
  "gst_amount": number or null,
  "total_items": number,
  "items": [
    {
      "sn": number,
      "medicine_name": "string",
      "hsn_code": "string or null",
      "manufacturer_code": "string or null",
      "batch_number": "string or null",
      "expiry_date": "YYYY-MM-DD or null",
      "quantity": number,
      "free_quantity": number or null,
      "purchase_rate": number,
      "mrp": number,
      "gst_percentage": number or null,
      "discount_percentage": number or null,
      "amount": number,
      "taxable_amount": number or null,
      "cgst_amount": number or null,
      "sgst_amount": number or null,
      "igst_amount": number or null,
      "net_amount": number or null
    }
  ]
}
NOTE: "total_items" = the count from STEP 0. "sn" = the serial number of each row. items.length MUST equal total_items.

=== RULE 1: SUPPLIER vs BUYER (CRITICAL — READ CAREFULLY) ===
Indian GST invoices have TWO parties printed on them. You MUST distinguish them:

**SUPPLIER (SELLER):**
- Usually the LARGEST, BOLDEST heading at the TOP-LEFT or TOP-CENTER of the invoice.
- The company that SOLD/DISPATCHED the goods.
- Often labeled: company name in large font, with "GST Invoice", "Tax Invoice", "Wholesale" in the heading.
- Their GSTIN appears near their name/address block, labeled "GSTIN", "GST No", "GST IN", "GSTIN/UIN".
- This is the GSTIN you MUST extract as supplier_gstin.

**BUYER (PURCHASER):**
- Usually on the RIGHT side or below the supplier block.
- Commonly labeled: "M/s", "Bill To", "Buyer", "Ship To", "Party", "Sold To", "Consignee".
- Their GSTIN appears in the buyer section.
- IGNORE the buyer's GSTIN completely — do NOT extract it.

**HOW TO IDENTIFY THE SUPPLIER GSTIN (step by step):**
1. Find the main company header (largest text at top) — this is the SUPPLIER.
2. Locate the GSTIN printed IN or NEAR this supplier header block.
3. That is supplier_gstin.
4. If you see another GSTIN in the "Bill To" / "M/s" / buyer section → IGNORE it.
5. If the invoice has "Sold By" and "Sold To" — "Sold By" party's GSTIN = supplier_gstin.

**GSTIN FORMAT (15 characters exactly):**
- Characters 1-2: State code (2 digits, 01 to 38). Examples: 21=Odisha, 27=Maharashtra, 29=Karnataka, 07=Delhi, 09=UP, 33=TN
- Characters 3-7: Five uppercase letters (first 5 chars of PAN)
- Characters 8-11: Four digits (PAN digits)
- Character 12: One uppercase letter (PAN check letter)
- Character 13: One alphanumeric (entity identifier, usually 1-9 or A-Z)
- Character 14: Always the letter "Z"
- Character 15: Checksum character (alphanumeric, computed by govt algorithm)
- Valid example: 21AABCT1332L1ZS, 27AAACR5055K1ZQ
- INVALID patterns: random numbers, less than 15 chars, no "Z" at position 14

**COMMON OCR MISTAKES in GSTIN — be extra careful:**
- Letter "O" misread as digit "0" (and vice versa)
- Letter "I" or "l" misread as digit "1"
- Letter "S" misread as digit "5"
- Letter "B" misread as digit "8"
- Letter "Z" misread as digit "2"
- If unsure about a character, prefer the one that makes the GSTIN structurally valid (letters where letters expected, digits where digits expected).

=== RULE 2: BILL HEADER ===
- bill_number: value after "Invoice No", "Inv No", "Bill No", "GST Invoice:" — e.g. "ASP/933", "C-10710"
- bill_date: convert all formats to YYYY-MM-DD. "12-03-2026" → "2026-03-12". "27/09/25" → "2025-09-27"
- payment_type: look for "CREDIT" or "CASH" printed explicitly on the bill

=== RULE 3: COLUMN IDENTIFICATION (READ HEADER ROW CAREFULLY) ===
Step 1: Read the header row of the item table to find ALL column labels.
Step 2: Note the LEFT-TO-RIGHT order of columns. Column order varies between vendors — DO NOT assume a fixed layout.
Step 3: For EACH data row, extract each value by its column position — do NOT shift columns.

**KNOWN LAYOUTS** (always confirm by reading the actual header row):
- Layout A (most common): SN | MFG | PRODUCT | PACK | QTY | FR | Batch | Exp | HSN | MRP | Rate | Disc% | GST% | Amount
- Layout B (Odisha / east-India wholesalers, e.g. SWARAJ PHARMACEUTICALS): S.N | QTY | FR | ITEM NAME | PACK | BATCH NO | EXP.DT | HSN | M.R.P | RATE | Disc % | Gst % | Amount
- Layout C: SN | PRODUCT | HSN | Batch | Exp | MRP | Rate | QTY | FR | Disc% | GST% | Amount

In **Layout B**, the QTY and FR columns are BEFORE the item name. After S.N, the next number is QTY and the one after that is FR. Do NOT mistake QTY for an item count or skip the FR column because it sits early in the row.

Common column labels and what they map to:
- "PRODUCT", "Particulars", "Description", "Item" → medicine_name
- "MFG", "Mfg.", "Manufacturer" → manufacturer_code (2-3 letter code like BLA, ALK, TOR, P&G)
- "HSN", "HSN Code" → hsn_code (4, 6, or 8 digit NUMBER like 3004, 300490, 30049011)
- "Batch", "Batch No", "BATCH", "LOT" → batch_number (alphanumeric like BGR12AAA, ACB025007, D0692a026)
- "Exp", "EXP.", "Expiry" → expiry_date
- "QTY", "Qty" → quantity (integer)
- "FR", "F/R", "Free" → free_quantity
- "Rate", "RATE", "P.Rate" → purchase_rate
- "MRP", "M.R.P" → mrp
- "Disc%", "DIS%", "SCH", "DISC", "SPEC DISC", "SPL DISC", "CD%", "Scheme" → discount_percentage
- "GST%", "GST", "Tax%" → gst_percentage
- "Amount", "AMOUNT", "Amt" → amount (this is the GROSS amount = Rate × Qty, BEFORE discount, BEFORE GST)
- "Taxable", "Taxable Amt", "Taxable Val", "Net Val", "Net Value", "Tax Value" → taxable_amount (AFTER discount, BEFORE GST)
- "CGST Amt", "CGST", "CGST Rs" → cgst_amount (CGST rupee amount for THIS line)
- "SGST Amt", "SGST", "SGST Rs" → sgst_amount (SGST rupee amount for THIS line)
- "IGST Amt", "IGST", "IGST Rs" → igst_amount (IGST rupee amount for THIS line)
- "Net Amt", "Net Amount", "Total", "Line Total", "FINAL" → net_amount (FINAL amount for this line = taxable + GST)
- "PACK", "Pack" → pack size info (usually ignore, just for reference)

=== RULE 4: DISTINGUISHING BATCH NUMBER vs HSN CODE (CRITICAL — #1 ERROR SOURCE) ===
HSN codes and Batch numbers are DIFFERENT columns. Do NOT mix them up. Do NOT shift values between columns.

HSN code characteristics:
- A pure NUMBER, typically 4, 6, or 8 digits (Indian GST allows all three lengths).
  Common examples: 3004, 3005 (4-digit chapter), 300420, 300490, 210690, 401410 (6-digit subheading), 30049011 (8-digit tariff item).
- Found in the column labeled "HSN" or "HSN Code"
- Many medicines on the same bill share the SAME HSN (e.g. tablets often all = 3004 or 300490)
- Never contains letters
- Common pharmacy HSN codes: 3004, 3005, 300490, 300420, 300410, 304200, 340111, 401410, 961900, 210690

Batch number characteristics:
- Usually alphanumeric: BGR12AAA, ACB025007, D0692a026, PCM23S05, C5038, CPO251024, A71LY019, etc.
- Found in the column labeled "Batch" or "Batch No"
- UNIQUE per product/row — each item has a DIFFERENT batch number (don't copy it from another row)
- Often mixes letters and digits, but CAN be pure numbers too — e.g. 25444818, 60002654, 517, 260, 68 are all valid batch numbers
- Length varies (1 digit up to 12+ characters). DO NOT reject a batch just because it's short.
- The deciding factor is the COLUMN POSITION, not the length or digit-pattern of the value.
- SPECIAL VALUES that mean "no batch": *, //, ////, -, N/A, blank → batch_number = null

**ANTI-COLUMN-SHIFT RULE (CRITICAL — READ THREE TIMES):**
When a row has BLANK or * in the Batch column AND BLANK or * in the Expiry column, the NEXT column (usually HSN) will contain a 6-digit number. Do NOT shift that number left into the Batch field. Each value STAYS in its OWN column position regardless of whether previous columns are blank.

**PROCEDURE for each row:**
1. Identify the COLUMN POSITION of "Batch", "Exp", "HSN" from the HEADER ROW
2. For the data row, read the cell at the Batch column position → that is batch_number
3. Read the cell at the Exp column position → that is expiry_date
4. Read the cell at the HSN column position → that is hsn_code
5. A blank/asterisk at Batch position means batch_number = null. It does NOT mean the HSN shifts into Batch.

**CONCRETE EXAMPLE (this exact error happens in real invoices):**
Header:  | SN | MFG | PRODUCT              | PACK | QTY | FR | Batch      | EXP. | HSN    | MRP   | ...
Row 1:   | 1  | MP  | MANFORCE CONDOM 3'S  | 1PC  | 20  | 6  | A71LY019   | 3/28 | 401410 | 30.00 | ...
Row 4:   | 4  | MAN | MANFORCE CONDOM 10'S | 10'S | 5   | 0  | *          | *    | 401410 | 90.00 | ...

CORRECT extraction for Row 4:
  { "batch_number": null, "expiry_date": null, "hsn_code": "401410" }

WRONG extraction for Row 4 (column shift error — DO NOT DO THIS):
  { "batch_number": "401410", "expiry_date": null, "hsn_code": null }

The 401410 is in the HSN COLUMN POSITION, not the Batch column. A blank Batch does NOT cause values to shift left.

RULE OF THUMB (use only when the column position is ambiguous):
- A 6-digit or 8-digit pure number standing alone in the HSN column position → it is the hsn_code.
- A 4-digit pure number like 3004 / 3005 in the HSN column position → it is also an hsn_code (Indian GST allows 4-digit chapter codes).
- A pure number in the Batch column position is a VALID batch_number regardless of length (e.g. "517", "260", "68" are batches when they appear under "Batch No.").
- NEVER override COLUMN POSITION based on the value's appearance. The position wins.

=== RULE 5: MRP vs RATE column order ===
IMPORTANT: In some bills MRP comes BEFORE Rate. In others, Rate comes before MRP.
- Always check the COLUMN HEADER to know which is which
- MRP (Maximum Retail Price) is always HIGHER than purchase Rate
- If MRP column is BEFORE Rate column in the bill, still put the right values in the right fields
- Example from this bill type: columns are ... | MRP | RATE | — so MRP value > Rate value

=== RULE 6: DISCOUNT COLUMNS (CRITICAL — MOST COMMON ERROR) ===
Multiple discount-related columns may appear:
- "SCH" or "Scheme" = scheme discount percentage
- "DISC" or "Disc%" or "DIS%" or "Disc" = trade discount percentage
- "SPEC" or "SPEC DISC" or "SPL DISC" = special discount percentage
- "CD%" = cash discount percentage
- "Disc Amt" = discount rupee amount (per item or total)
SOME BILLS split the discount into TWO sub-columns under one header: e.g. "SPEC | DISC" as two adjacent columns.
  → In this case, read BOTH and ADD them: discount_percentage = SPEC_value + DISC_value
  → Example: SPEC=5.00, DISC=0.00 → discount_percentage = 5
  → Example: SPEC=0.00, DISC=0.00 → discount_percentage = 0 (or null)
If a cell is blank/empty/asterisk (*) under any discount column → treat as 0 for that row.

**CRITICAL DISCOUNT EXTRACTION RULE:**
- If the Disc% column exists in the item table and a ROW shows a NUMBER like 5.0 or 7.00, you MUST extract that as discount_percentage = 5 or 7.
- Do NOT return discount_percentage = 0 or null when the printed cell clearly shows a non-zero value.
- Read EACH row's discount cell INDEPENDENTLY — different items may have different discount percentages.
- Common values: 5.0, 7.0, 10.0, 12.5, 15.0, 20.0 — these are ALL valid discount percentages.

**BILL-LEVEL DISCOUNT (bill_discount field):**
At the BOTTOM of the bill, look for the TOTAL discount amount:
- Labeled: "Disc Amt", "Disc Amount", "Total Discount", "Discount", "Less Discount", "Less Disc"
- Also check the summary row: e.g. "Prd Value 21159.90  Disc Amt 1481.19" → bill_discount = 1481.19
- This is the TOTAL discount in RUPEES across all items, NOT a percentage.
- If this value exists on the bill, you MUST extract it into bill_discount. NEVER return 0 or null when a discount amount is clearly printed.

**CROSS-VALIDATION:** If your extracted items ALL have discount_percentage > 0 (e.g. 5%) but you set bill_discount to null or 0, STOP and re-read the bill's summary section — there is almost certainly a printed "Disc Amt" or "Discount" line you missed.

=== RULE 7: GST PERCENTAGE (CRITICAL) ===
CASE A — Single "GST%" column in item table → use value directly (e.g. 5)
CASE B — Separate "SGST%" and "CGST%" columns per item → add them: gst% = SGST% + CGST%
CASE C — No % per item, only rupee GST amounts in item table:
  → Find the GST CLASS table (usually at bottom or side of bill)
  → CLASS section shows: GST 5.00, GST 12.00, GST 28.00 etc. with amounts
  → Match each item's amount to the GST class to determine its rate
  → Commonly: medicines = 5%, some items = 12% or 18%

For the summary at bottom:
- Look for "CGST PAYABLE", "SGST PAYABLE", "CGST AMT", "SGST AMT" → bill_cgst, bill_sgst
- "TOTAL GST" or sum of CGST+SGST → gst_amount
- "GRAND TOTAL" → total_amount

=== RULE 8: QUANTITY AND FREE QUANTITY (CRITICAL — COMMON ERROR SOURCE) ===

**STEP 1 — Locate BOTH columns in the header row.**
- "QTY" / "Qty" / "Quantity" → quantity
- "FR" / "F/R" / "FREE" / "Free" / "FRE" / "Sch Qty" / "Sch.Qty" / "Bonus" → free_quantity

These are TWO SEPARATE columns. They may be adjacent or far apart, and the FR column may be ONE character wide (just the letters "FR"). Do not skip a narrow column just because the heading is short.

**STEP 2 — Note WHERE in the table the QTY and FR columns sit.**

Bills come in TWO common layouts. You MUST recognise which one you are reading:

**LAYOUT A — QTY/FR on the RIGHT (after the item name):**
| SN | MFG | PRODUCT | PACK | QTY | FR | Batch | EXP. | HSN | MRP | Rate | ... | Amount |
Here the QTY column is roughly mid-table and FR sits next to it.

**LAYOUT B — QTY/FR on the LEFT (BEFORE the item name) — THIS LAYOUT IS COMMON ON ODISHA / EAST INDIA WHOLESALER BILLS:**
| S.N | QTY | FR | ITEM NAME | PACK | BATCH NO | EXP.DT | HSN | M.R.P | RATE | Disc % | Gst % | Amount |
Here QTY is the 2nd column (immediately after S.N) and FR is the 3rd column (immediately after QTY, BEFORE the item name).

When you encounter LAYOUT B, the SECOND number on the row is QTY and the THIRD number is FR. Do NOT assume the item name comes right after S.N. ALWAYS read the header row first to confirm.

**STEP 3 — Per-row extraction.**
For each data row, read the cells STRICTLY by column position from the header:
- FR cell with an integer like 1, 2, 6, 11 → free_quantity = that integer
- FR cell with 0 → free_quantity = 0
- FR cell with "*", "-", "/", "//", blank, or empty → free_quantity = 0 (NOT null)
- NEVER copy the QTY value into FR. They are independent cells.
- NEVER drop the FR value because it is small or because the column is narrow.

**STEP 4 — Combined "QTY/FR" cell.**
Some bills combine both into ONE cell separated by "/" or "+":
- "5/0" → quantity=5, free_quantity=0
- "5/2" → quantity=5, free_quantity=2
- "20+2" → quantity=20, free_quantity=2
- "5" alone → quantity=5, free_quantity=0

**CONCRETE EXAMPLE — LAYOUT B (left-side QTY/FR):**
Header:  | S.N | QTY | FR | ITEM NAME             | PACK | BATCH NO | EXP.DT  | HSN      | M.R.P  | RATE   | Disc % | Gst % | Amount |
Row 1:   | 1   | 6   | 0  | LEVEPSY-500           | 15S  | 5SN0416  | 01-2028 | 30049082 | 180.27 | 137.36 | 4      | 5     | 824.16 |
Row 2:   | 2   | 11  | 1  | NOBEL SPAS NEW TAB    | 10   | K1AG2002 | 06-2027 | 30049099 | 97.93  | 74.61  | 4      | 5     | 820.71 |
Row 7:   | 7   | 11  | 1  | MONTAIR LC TAB        | 10   | 95Y053   | 11-2027 | 30049099 | 149.58 | 113.97 | 4      | 5     | 1253.67|

CORRECT extraction for Row 1: { "quantity": 6,  "free_quantity": 0, "medicine_name": "LEVEPSY-500", "batch_number": "5SN0416", ... }
CORRECT extraction for Row 2: { "quantity": 11, "free_quantity": 1, "medicine_name": "NOBEL SPAS NEW TAB", "batch_number": "K1AG2002", ... }
CORRECT extraction for Row 7: { "quantity": 11, "free_quantity": 1, "medicine_name": "MONTAIR LC TAB", "batch_number": "95Y053", ... }

WRONG extractions to avoid:
  ❌ { "quantity": 11, "free_quantity": 0 } — you dropped the FR=1
  ❌ { "quantity": 1,  "free_quantity": 0 } — you swallowed FR into QTY
  ❌ { "quantity": 0,  "free_quantity": 11 } — you swapped QTY and FR
  ❌ Putting "LEVEPSY-500" as quantity because you misaligned columns

**FINAL CHECK on every row:** Before finalising, ask yourself "did this row actually have a number in the FR column?" If yes, free_quantity MUST be that number. If FR was 0 or blank, free_quantity = 0.

=== RULE 9: EXPIRY DATE ===
Convert ALL formats to YYYY-MM-DD, always use 01 as the day:
- "6/27" or "06/27" = 2027-06-01
- "9/26" = 2026-09-01
- "10/26" = 2026-10-01
- "01/28" = 2028-01-01
- "3/28" = 2028-03-01
- "3/27" = 2027-03-01
- "12/2026" = 2026-12-01
- "JAN-27" = 2027-01-01
SPECIAL: If the expiry cell contains "*", "-", "N/A", or is blank → expiry_date = null

=== RULE 10: AMOUNT vs TAXABLE_AMOUNT vs NET_AMOUNT (CRITICAL — READ CAREFULLY) ===
Indian pharmacy bills typically have MULTIPLE amount-related columns per line item. These are all DIFFERENT values.

**amount** (Gross Amount):
- The column usually labeled "Amount", "Amt", "AMOUNT"
- This is the GROSS amount = Rate × Qty (BEFORE discount, BEFORE GST)
- Extract EXACTLY what is printed. Do NOT calculate.

**taxable_amount** (After Discount, Before GST):
- The column usually labeled "Taxable", "Taxable Amt", "Taxable Val", "Net Value", "Tax Value", "Net Val"
- This is = amount MINUS discount (but BEFORE GST is added)
- Extract EXACTLY what is printed. If this column does not exist on the bill → null

**cgst_amount / sgst_amount / igst_amount** (Per-line GST rupee values):
- Columns labeled "CGST", "CGST Amt", "SGST", "SGST Amt", "IGST", "IGST Amt"
- These are the actual rupee amounts of GST for THIS specific line item
- Extract EXACTLY what is printed. If these columns do not exist on this bill → null

**net_amount** (Final Line Total):
- The column usually labeled "Net Amt", "Net Amount", "Total", "Line Total", "FINAL", or the LAST numeric column in the item table
- This is = taxable_amount + CGST + SGST (or taxable_amount + IGST) — the FINAL amount for this line
- This is what the pharmacist actually pays for this line item
- Extract EXACTLY what is printed. If this column does not exist → null
- HINT: On many Indian pharmacy bills, the LAST column in the item table IS the net_amount (final total per line). Read it carefully.

**IMPORTANT DISTINCTION:**
- If the bill has ONLY ONE amount column (e.g. just "Amount") → put it in "amount", and set taxable_amount and net_amount to null
- If the bill has TWO amount columns (e.g. "Amount" and "Net Amt") → "Amount" = amount (gross), last column = net_amount
- If the bill has THREE amount columns (e.g. "Amount", "Taxable", "Net Amt") → extract all three separately
- NEVER calculate these. ONLY extract what is physically printed in each column.

=== RULE 11: BLANK/NULL FIELDS & ASTERISK (*) ===
- ASTERISK (*) in ANY cell = that cell is blank/not applicable → use null for that field
- Examples: batch_number="*" → null, expiry_date="*" → null, hsn_code="*" → null
- A BLANK/EMPTY cell → use null (not 0, not "")
- Exception: free_quantity with * or blank → use 0 (not null)
- If field truly cannot be read → null

**CRITICAL ROW-LEVEL APPLICATION:**
The asterisk (*) or blank applies ONLY to the specific row where it appears. Do NOT propagate or swap it.
Example: If SN 1 shows Batch="A71LY019" and SN 4 shows Batch="*":
  → SN 1: batch_number = "A71LY019"
  → SN 4: batch_number = null
Do NOT accidentally swap them. SN 1 keeps its own batch, SN 4 keeps its own batch (null).

=== RULE 12: BILL SUMMARY SECTION (EXTRACT EXACTLY — MOST IMPORTANT) ===
At the BOTTOM of the bill, there is a summary section. Extract EACH value EXACTLY as printed:

**subtotal:** The value labeled "Sub Total", "Gross Total", "Total Before Tax", "Total Amount", "Prd Value", "Product Value", "Goods Value" (before GST). This is the sum of all line-level amounts BEFORE discount. Extract the printed number.

**bill_discount:** The value labeled "Discount", "Disc Amt", "Disc Amount", "Total Discount", "Less Discount", "Less Disc", "Trade Discount".
- This is the TOTAL discount in RUPEES (not a percentage).
- IMPORTANT: Many Indian pharmacy bills show this in a summary ROW format like:
  "Prd Value  21159.90  Disc Amt  1481.19  Tax Free  0.00"
  → In this case: subtotal = 21159.90, bill_discount = 1481.19
- If no discount line exists → null. But NEVER return 0 or null when a non-zero discount is clearly printed.

**bill_cgst:** The value labeled "CGST Payable", "CGST Amount", "CGST Amt", "Total CGST", "CGST". Extract the printed number. If not shown → null.

**bill_sgst:** The value labeled "SGST Payable", "SGST Amount", "SGST Amt", "Total SGST", "SGST". Extract the printed number. If not shown → null.

**bill_igst:** The value labeled "IGST Payable", "IGST Amount", "IGST Amt", "Total IGST", "IGST". Extract the printed number. If not shown → null.

**gst_amount:** The value labeled "Total Tax", "GST Amount", "Total GST". If not explicitly printed, look for bill_cgst + bill_sgst or bill_igst. If neither → null.

**bill_round_off:** The value labeled "Round Off", "Rounding", "Adj", "Rnd". Can be positive or negative (e.g. -0.45 or +0.55 or 0.35). If not shown → null.

**total_amount:** The value labeled "Grand Total", "Net Payable", "Bill Amount", "Total Payable", "FINAL AMOUNT", "Balance Including", "Net Amt" (the last/largest number in the summary). This is what the pharmacist must pay. Extract EXACTLY.

CONCRETE EXAMPLE (this exact format appears on real bills):
  Prd Value    Disc Amt    Tax Free    12%Amt     Tax Amt    5%Amt      Tax Amt    ...    Gross     Rnd     Net Amt
  21159.90     1481.19     0.00        0.00       19678.71   983.94     ...        ...    20662.65  0.35    20663.00
  → subtotal = 21159.90
  → bill_discount = 1481.19
  → total_amount = 20663.00
  → bill_round_off = 0.35

CRITICAL: Do NOT calculate any of these. If "Grand Total" says 5247.00 on the bill, return 5247.00 — even if your mental math says it should be 5248.12. The PRINTED value wins.

=== RULE 13: FINAL VALIDATION (do this mentally before returning) ===
For each item, verify:
1. batch_number contains letters OR is clearly alphanumeric (not a 6-digit pure number) — if it's //// or * → null
2. hsn_code is a 6-digit pure number (like 300490) — if empty/unreadable → null
3. purchase_rate < mrp (rate should be lower than MRP)
4. gst_percentage is one of: 0, 5, 12, 18, 28 (common pharma rates)
5. If net_amount exists on the bill, it should be the LARGEST per-line amount (since it includes tax)
6. All amounts match what is PRINTED — you have NOT calculated anything

=== RULE 14: ITEM COUNT VERIFICATION (CRITICAL) ===
After extracting all items, COUNT them:
1. Find the LAST serial number (SN) in the item table
2. Your items array MUST have exactly that many items
3. If you have fewer items than the last SN → you MISSED a row. Go back and find it.
4. Common mistakes:
   - Merging two rows with similar names (e.g. "PAMPERS 8PC(M) PKT" and "PAMPERS 8PC(S) PKT" are 2 items)
   - Skipping rows where batch/expiry is blank or unusual
   - Skipping non-medicine items (diapers, surgical supplies, condoms, etc.)
5. EVERY row in the printed table = one object in the items array, no exceptions.

=== RULE 15: GSTIN FINAL CHECK ===
Before returning, verify supplier_gstin:
1. It must be EXACTLY 15 characters (no spaces).
2. The 14th character (index 13) must be "Z".
3. Characters 1-2 must be a valid Indian state code (01-38).
4. Characters 3-12 must follow PAN format (5 uppercase letters + 4 digits + 1 uppercase letter).
5. If the GSTIN you extracted does not match this pattern, re-read the bill carefully.
6. Make sure you are reading the SUPPLIER's GSTIN (the seller at the top), NOT the buyer's GSTIN.

=== RULE 16: STRICT ROW-BY-ROW EXTRACTION (CRITICAL — PREVENTS DATA SWAPPING) ===
You MUST extract items ONE ROW AT A TIME, using ONLY the data physically printed in that row.

**PROCEDURE — follow this exactly for EACH serial number:**
1. Find the physical row for SN X on the printed invoice.
2. Move your eyes horizontally across ONLY that row.
3. Read each cell value under its column header — Batch, Exp, Qty, FR, Rate, MRP, etc.
4. Record those values for SN X. Move to SN X+1.

**NEVER DO THIS:**
- ❌ Copy a batch number from SN 1 to SN 4 (even if both are the same brand)
- ❌ Copy an expiry date from SN 1 to SN 4
- ❌ Assume that if SN 1 has batch "A71LY019", then SN 4 also has "A71LY019" — it might have "*" (null)
- ❌ Assume that similar product names share any column values
- ❌ "Fill in" missing batch/expiry by borrowing from another row
- ❌ Calculate any amount — ONLY read what is printed

**SAME-BRAND PRODUCTS ARE NOT THE SAME ITEM.** Different pack sizes, strengths, or variants = different rows = different data. Each row is an independent universe.

Return ONLY the JSON object starting with { and ending with } — nothing else.`;

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: `unhandled: ${msg}` }, 500);
  }
});

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonResponse({ error: 'missing_authorization' }, 401);
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return jsonResponse({ error: 'invalid_token' }, 401);

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  const parsedInput = validate(payload);
  if (typeof parsedInput === 'string') return jsonResponse({ error: parsedInput }, 400);

  // Quota check — before spending any Gemini cost.
  const { data: quota, error: quotaErr } = await userClient.rpc('rpc_check_ai_scan_quota', {
    p_store_id: parsedInput.store_id,
  });
  if (quotaErr) return jsonResponse({ error: quotaErr.message, code: quotaErr.code }, 400);
  if (!(quota as any)?.allowed) {
    return jsonResponse(
      { error: 'OUT_OF_SCAN_CREDITS', used: (quota as any)?.used, limit: (quota as any)?.limit },
      402,
    );
  }

  // Call Gemini.
  const requestBody = {
    contents: [
      {
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: parsedInput.mime_type, data: parsedInput.image_base64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.05,
      responseMimeType: 'application/json',
    },
  };

  const geminiRes = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!geminiRes.ok) {
    const text = await geminiRes.text().catch(() => '');
    return jsonResponse({ error: `gemini_error: ${geminiRes.status} ${text}` }, 502);
  }

  const geminiJson = await geminiRes.json().catch(() => null);
  const text = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string' || text.length === 0) {
    return jsonResponse({ error: 'empty_gemini_response' }, 502);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch (firstErr) {
    try {
      parsed = JSON.parse(repairJson(text));
    } catch {
      const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      return jsonResponse({ error: `parse_failed: ${msg}` }, 502);
    }
  }

  postprocessScannedBill(parsed);

  // Only consume a credit after a fully successful scan.
  const clientUuid = crypto.randomUUID();
  const { data: usage, error: usageErr } = await userClient.rpc('rpc_record_ai_scan_usage', {
    p_store_id: parsedInput.store_id,
    p_client_uuid: clientUuid,
  });
  if (usageErr) return jsonResponse({ error: usageErr.message, code: usageErr.code }, 400);

  const documentWarning =
    parsed?.is_purchase_invoice === false
      ? parsed.document_type_note || 'This document does not look like a purchase invoice.'
      : null;

  return jsonResponse({ ok: true, scanned: parsed, usage, document_warning: documentWarning });
}
