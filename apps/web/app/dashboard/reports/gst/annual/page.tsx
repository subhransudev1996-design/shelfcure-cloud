import Link from 'next/link';

function fiscalYear() {
  const now = new Date();
  const m = now.getMonth();
  const y = now.getFullYear();
  if (m >= 3) return `${y}-${String(y + 1).slice(-2)}`;
  return `${y - 1}-${String(y).slice(-2)}`;
}

export default function GstAnnualPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/reports/gst" className="rounded-lg p-1.5 hover:bg-zinc-100">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-zinc-500"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-fuchsia-50">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-fuchsia-700"><path d="M9 12l2 2 4-4M7 2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8l-6-6ZM7 2v6h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div>
          <h1 className="text-xl font-black text-zinc-900">Annual GST (GSTR-9)</h1>
          <p className="text-xs text-zinc-400">FY {fiscalYear()} — full-year GST summary</p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-fuchsia-200 bg-fuchsia-50/30 py-24">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-fuchsia-100">
          <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-fuchsia-700"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>
        </div>
        <h2 className="mt-4 text-lg font-bold text-zinc-800">Coming Soon</h2>
        <p className="mt-2 max-w-sm text-center text-sm text-zinc-500">
          Annual GSTR-9 compiles all 12 months into a single GSTIN-ready summary. This report is being built for the next release.
        </p>
        <Link href="/dashboard/reports/gst" className="mt-6 rounded-xl border border-fuchsia-200 bg-white px-4 py-2 text-sm font-semibold text-fuchsia-700 hover:bg-fuchsia-50">
          View Monthly GST →
        </Link>
      </div>
    </div>
  );
}
