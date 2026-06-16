import Link from 'next/link';

export default function CashCreditPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/reports" className="rounded-lg p-1.5 hover:bg-zinc-100">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-zinc-500"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-blue-600"><path d="M2 5h20v14H2z M2 10h20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <h1 className="text-xl font-black text-zinc-900">Cash vs Credit</h1>
      </div>
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-200 py-24">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
          <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-blue-300"><path d="M2 5h20v14H2z M2 10h20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>
        </div>
        <h2 className="mt-4 text-lg font-bold text-zinc-800">Cash vs Credit — Coming Soon</h2>
        <p className="mt-2 max-w-sm text-center text-sm text-zinc-500">Sales split by payment mode, credit aging buckets and top outstanding debtors.</p>
        <Link href="/dashboard/reports" className="mt-6 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">← Back to Reports</Link>
      </div>
    </div>
  );
}
