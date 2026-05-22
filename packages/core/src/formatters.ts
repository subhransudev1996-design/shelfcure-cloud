/**
 * Display formatters — currency, date/time in IST.
 * Pure: no React, no Tauri, no DOM.
 */

const IST = 'Asia/Kolkata';

export function formatCurrency(amount: number, options?: { fractionDigits?: number }): string {
  const fd = options?.fractionDigits ?? 2;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: fd,
    maximumFractionDigits: fd,
  }).format(amount);
}

/** Whole-rupee currency, handy for cash payouts. */
export function formatCurrencyRounded(amount: number): string {
  return formatCurrency(Math.round(amount), { fractionDigits: 0 });
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-IN').format(n);
}

/**
 * Parse any date/time string (SQLite, ISO, etc.) into a Date object.
 *
 *   "2026-05-22"               → 2026-05-22 00:00 IST
 *   "2026-05-22 18:30:00"      → SQLite datetime UTC → add Z
 *   "2026-05-22T18:30:00"      → ISO without zone → assume UTC
 *   "2026-05-22T18:30:00Z"     → ISO UTC
 *   "2026-05-22T18:30:00+05:30" → ISO with offset
 */
function parseDate(input: string | Date): Date {
  if (input instanceof Date) return input;
  let s = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T00:00:00+05:30');
  if (s.includes(' ')) s = s.replace(' ', 'T');
  if (!s.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(s)) s += 'Z';
  return new Date(s);
}

export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return '—';
  return parseDate(input).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: IST,
  });
}

export function formatDateTime(input: string | Date | null | undefined): string {
  if (!input) return '—';
  return parseDate(input).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: IST,
  });
}

export function formatTime(input: string | Date | null | undefined): string {
  if (!input) return '—';
  return parseDate(input).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: IST,
  });
}

/** Today's date in IST as 'YYYY-MM-DD'. */
export function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: IST });
}

/** Indian financial year code for a given date. e.g. 2026-05-22 → "2627" (Apr 2026–Mar 2027). */
export function financialYear(input: string | Date = new Date()): string {
  const d = parseDate(input);
  // Use IST month to handle midnight edge case
  const istParts = d.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: '2-digit',
    timeZone: IST,
  }).split('/');
  const month = Number(istParts[0]);
  const year = Number(istParts[1] ?? istParts[0]);
  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;
  return `${startYear % 100}${endYear % 100}`.padStart(4, '0');
}
