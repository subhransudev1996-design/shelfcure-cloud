/**
 * Strict medicine-name matching, ported verbatim from the ShelfCure desktop
 * app's AI bill-scan review screen:
 * C:\Projects\APPLICATIONS\shelfcure\desktop\src\pages\purchases\ScanBill.tsx (lines 52-139).
 *
 * Prevents dangerous mismatches like "VERTIN 15MG" → "VERTIN 16MG". Normalizes
 * both names, then verifies: (1) exact match (case-insensitive,
 * whitespace-normalized), or (2) all numeric tokens (dosages) match exactly
 * AND at least 80% of alpha tokens (brand/form) match. This is a pharmacy
 * safety matter — wrong dosage = wrong medicine — so this is intentionally
 * strict rather than a generic fuzzy-match: a miss falls through to manual
 * review instead of risking a silent wrong link.
 */

export interface MedicineMatchCandidate {
  id: string;
  name: string;
}

function normalizeMedicineName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.\-/\\,;:()[\]{}'"]+/g, ' ') // replace punctuation with spaces
    .replace(/\s+/g, ' ') // collapse multiple spaces
    .trim();
}

/** Extract all numeric tokens from a medicine name (e.g. "15mg", "500", "0.5ml", "2.5") */
function extractNumericTokens(name: string): string[] {
  const normalized = normalizeMedicineName(name);
  const matches = normalized.match(/\d+(?:\.\d+)?(?:\s*(?:mg|mcg|ml|gm|g|iu|%|lakh|cr|units?))?/gi);
  return (matches || []).map((m) => m.replace(/\s/g, '').toLowerCase());
}

/** Extract alpha-only tokens (brand name, dosage form) */
function extractAlphaTokens(name: string): string[] {
  const normalized = normalizeMedicineName(name);
  const withoutNums = normalized.replace(
    /\d+(?:\.\d+)?(?:\s*(?:mg|mcg|ml|gm|g|iu|%|lakh|cr|units?))?/gi,
    ' ',
  );
  return withoutNums.split(/\s+/).filter((t) => t.length > 0);
}

const ALPHA_FORM_ALIASES: Record<string, string> = {
  tab: 'tablet',
  tabs: 'tablet',
  cap: 'capsule',
  caps: 'capsule',
  inj: 'injection',
  syr: 'syrup',
  susp: 'suspension',
  drp: 'drops',
  crm: 'cream',
  oint: 'ointment',
  gel: 'gel',
  pwd: 'powder',
  sol: 'solution',
  liq: 'liquid',
  lot: 'lotion',
  inh: 'inhaler',
};

/**
 * Find the (single) candidate medicine a scanned name safely matches, or
 * null if no candidate is a confident-enough match — leave unlinked for
 * manual review rather than guessing.
 */
export function matchMedicineName<T extends MedicineMatchCandidate>(
  scannedName: string,
  candidates: T[],
): T | null {
  const normalizedScanned = normalizeMedicineName(scannedName);

  // Pass 1: exact match (case-insensitive, whitespace-normalized).
  for (const med of candidates) {
    if (normalizeMedicineName(med.name) === normalizedScanned) {
      return med;
    }
  }

  // Pass 2: strict token-based match. ALL numeric tokens (dosages) must
  // match exactly, AND the core brand tokens must be present.
  const scannedNums = extractNumericTokens(scannedName);
  const scannedAlphas = extractAlphaTokens(scannedName);

  for (const med of candidates) {
    const candidateNums = extractNumericTokens(med.name);
    const candidateAlphas = extractAlphaTokens(med.name);

    if (scannedNums.length !== candidateNums.length) continue;
    const numsMatch = scannedNums.length === 0 || scannedNums.every((n, i) => n === candidateNums[i]);
    if (!numsMatch) continue;

    const normalizeToken = (t: string): string => ALPHA_FORM_ALIASES[t] || t;
    const scannedAlphaNorm = new Set(scannedAlphas.map(normalizeToken));
    const candidateAlphaNorm = new Set(candidateAlphas.map(normalizeToken));

    const matchingAlphas = [...scannedAlphaNorm].filter((t) => candidateAlphaNorm.has(t));
    const alphaMatchRatio = scannedAlphaNorm.size > 0 ? matchingAlphas.length / scannedAlphaNorm.size : 1;

    if (alphaMatchRatio >= 0.8) {
      return med;
    }
  }

  // No safe match found — leave unlinked for manual review.
  return null;
}
