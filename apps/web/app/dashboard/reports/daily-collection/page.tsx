import Link from 'next/link';

export default function DailyCollectionPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/reports" className="rounded-lg p-1.5 hover:bg-zinc-100">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-zinc-500"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-indigo-600"><path d="M12 3v1m0 16v1M4.22 4.22l.7.7m12.02 12.02.7.7M1 12h1m18 0h1M4.22 19.78l.7-.7M18.36 5.64l-.7.7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>
        </div>
        <h1 className="text-xl font-black text-zinc-900">Daily Collection</h1>
      </div>
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-200 py-24">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50">
          <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-indigo-300"><path d="M12 3v1m0 16v1M4.22 4.22l.7.7m12.02 12.02.7.7M1 12h1m18 0h1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>
        </div>
        <h2 className="mt-4 text-lg font-bold text-zinc-800">Daily Collection — Coming Soon</h2>
        <p className="mt-2 max-w-sm text-center text-sm text-zinc-500">Per-day Cash / UPI / Card tally for daily reconciliation and cash-drawer balancing.</p>
        <Link href="/dashboard/reports" className="mt-6 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">← Back to Reports</Link>
      </div>
    </div>
  );
}
