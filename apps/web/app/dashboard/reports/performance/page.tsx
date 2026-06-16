import Link from 'next/link';

export default function PerformancePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/reports" className="rounded-lg p-1.5 hover:bg-zinc-100">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-zinc-500"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-violet-600"><path d="M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2Zm0 0V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10m-6 0a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m0 0V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v14a2 2 0 0 0-2 2h-2a2 2 0 0 0-2-2Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div>
          <h1 className="text-xl font-black text-zinc-900">Overall Performance</h1>
          <p className="text-xs text-zinc-400">Health score, KPIs, inventory & credit health</p>
        </div>
      </div>
      <ComingSoon label="Overall Performance" description="A holistic health score dashboard with KPIs across sales, inventory, credit and operations." />
    </div>
  );
}

function ComingSoon({ label, description }: { label: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-200 py-24">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100">
        <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-zinc-400"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>
      </div>
      <h2 className="mt-4 text-lg font-bold text-zinc-800">{label} — Coming Soon</h2>
      <p className="mt-2 max-w-sm text-center text-sm text-zinc-500">{description}</p>
      <Link href="/dashboard/reports" className="mt-6 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
        ← Back to Reports
      </Link>
    </div>
  );
}
