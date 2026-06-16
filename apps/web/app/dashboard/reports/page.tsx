import Link from 'next/link';

function fiscalYear() {
  const now = new Date();
  const m = now.getMonth(); // 0-indexed, March = 2
  const y = now.getFullYear();
  // Indian FY: Apr–Mar. If month >= March (index 2), FY starts this year
  if (m >= 3) return `${y}-${String(y + 1).slice(-2)}`;
  return `${y - 1}-${String(y).slice(-2)}`;
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

const REPORT_CARDS = [
  {
    id: 1, title: 'Overall Performance', desc: 'Health score, KPIs, inventory & credit health',
    path: '/dashboard/reports/performance', color: 'bg-violet-50', iconColor: 'text-violet-600',
    icon: 'M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2Zm0 0V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10m-6 0a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m0 0V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v14a2 2 0 0 0-2 2h-2a2 2 0 0 0-2-2Z',
  },
  {
    id: 2, title: 'Daily / Weekly / Monthly', desc: 'Period summary: sales, profit, GST, payments',
    path: '/dashboard/reports/sales', color: 'bg-emerald-50', iconColor: 'text-emerald-600',
    icon: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  },
  {
    id: 3, title: 'Profit Tracking', desc: 'P&L, daily trend, top earners, margin & loss makers',
    path: '/dashboard/reports/profit', color: 'bg-green-50', iconColor: 'text-green-700',
    icon: 'M3 17l4-8 4 4 4-6 4 4',
  },
  {
    id: 4, title: 'Cash vs Credit', desc: 'Sales split, credit aging & top debtors',
    path: '/dashboard/reports/cash-credit', color: 'bg-blue-50', iconColor: 'text-blue-600',
    icon: 'M2 5h20v14H2z M2 10h20',
  },
  {
    id: 5, title: 'Daily Collection', desc: 'Per-day Cash / UPI / Card tally for reconciliation',
    path: '/dashboard/reports/daily-collection', color: 'bg-indigo-50', iconColor: 'text-indigo-600',
    icon: 'M12 3v1m0 16v1M4.22 4.22l.7.7m12.02 12.02.7.7M1 12h1m18 0h1M4.22 19.78l.7-.7M18.36 5.64l-.7.7',
  },
  {
    id: 6, title: 'Hourly Report', desc: 'Peak hours, hour-of-day patterns & heatmap',
    path: '/dashboard/reports/hourly', color: 'bg-sky-50', iconColor: 'text-sky-600',
    icon: 'M12 6v6l4 2m-4-8a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z',
  },
  {
    id: 7, title: 'Growth Trend', desc: 'Period-over-period growth & 12-month trajectory',
    path: '/dashboard/reports/growth', color: 'bg-teal-50', iconColor: 'text-teal-600',
    icon: 'M22 12h-4l-3 9L9 3l-3 9H2',
  },
  {
    id: 8, title: 'Stock Summary', desc: 'Inventory valuation, movement & low-stock alert',
    path: '/dashboard/reports/stock', color: 'bg-amber-50', iconColor: 'text-amber-700',
    icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z',
  },
  {
    id: 9, title: 'Stock Movement', desc: 'Inflow / outflow / net change per medicine',
    path: '/dashboard/reports/stock-movement', color: 'bg-orange-50', iconColor: 'text-orange-600',
    icon: 'M7 16V4m0 0L3 8m4-4 4 4M17 8v12m0 0 4-4m-4 4-4-4',
  },
  {
    id: 10, title: 'Stock Velocity', desc: 'Fast-moving, slow-moving & dead stock detection',
    path: '/dashboard/reports/velocity', color: 'bg-rose-50', iconColor: 'text-rose-600',
    icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8Z',
  },
  {
    id: 11, title: 'Shortage Report', desc: 'Out-of-stock & low items — by supplier and company',
    path: '/dashboard/reports/shortage', color: 'bg-red-50', iconColor: 'text-red-600',
    icon: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z M12 9v4M12 17h.01',
  },
  {
    id: 12, title: 'Expiry Report', desc: 'Batches nearing or past expiry with value loss',
    path: '/dashboard/reports/expiry', color: 'bg-yellow-50', iconColor: 'text-yellow-700',
    icon: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z M12 14h.01M8 14h.01M16 14h.01M12 18h.01M8 18h.01M16 18h.01',
  },
  {
    id: 13, title: 'Expense Analysis', desc: 'Operational costs breakdown by category',
    path: '/dashboard/finance', color: 'bg-zinc-50', iconColor: 'text-zinc-600',
    icon: 'M2 5h20v14H2z M2 10h20 M6 15h4M14 15h4',
  },
  {
    id: 14, title: 'GST Summary', desc: 'Input / output tax breakdown for monthly filing',
    path: '/dashboard/reports/gst', color: 'bg-purple-50', iconColor: 'text-purple-700',
    icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z M14 2v6h6 M16 13H8M16 17H8M10 9H8',
  },
  {
    id: 15, title: 'Annual GST (GSTR-9)', desc: 'Full financial-year GST summary — GSTR-9 ready',
    path: '/dashboard/reports/gst/annual', color: 'bg-fuchsia-50', iconColor: 'text-fuchsia-700',
    icon: 'M9 12l2 2 4-4M7 2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8l-6-6Z M7 2v6h10',
  },
  {
    id: 16, title: 'Sales Returns', desc: 'Refunds, credit notes & restocked inventory',
    path: '/dashboard/reports/returns', color: 'bg-cyan-50', iconColor: 'text-cyan-700',
    icon: 'M1 4v6h6M23 20v-6h-6 M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15',
  },
  {
    id: 17, title: 'Purchase Returns', desc: 'Debit notes & items reverted to suppliers',
    path: '/dashboard/reports/purchase-returns', color: 'bg-lime-50', iconColor: 'text-lime-700',
    icon: 'M3 7h13l3 4h2v7h-2a2 2 0 1 1-4 0H10a2 2 0 1 1-4 0H3V7Z M3 11h13',
  },
  {
    id: 18, title: 'Doctor Prescriptions', desc: 'Revenue & bills earned through doctor recommendations',
    path: '/dashboard/reports/doctors', color: 'bg-pink-50', iconColor: 'text-pink-600',
    icon: 'M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M5 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1 M17 8l1.5 1.5M17 8l-1.5 1.5M17 8v3',
  },
];

export default async function ReportsPage() {
  const now = new Date();
  const fy = fiscalYear();
  const time = fmtTime(now);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50">
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-indigo-600">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-black text-zinc-900">Reports & Analytics</h1>
            <p className="text-xs text-zinc-500">Business intelligence for your pharmacy</p>
          </div>
        </div>

        {/* Meta bar */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 font-medium text-zinc-600 shadow-sm">
            FY {fy}
          </span>
          <span className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 font-medium text-zinc-600 shadow-sm">
            Updated {time}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
            </span>
            Live Engine
          </span>
        </div>
      </div>

      {/* 18-card grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {REPORT_CARDS.map((card) => (
          <Link
            key={card.id}
            href={card.path}
            className="group flex flex-col rounded-2xl border border-zinc-200 bg-white shadow-sm transition-all hover:border-indigo-300 hover:shadow-md"
          >
            <div className="flex items-start gap-3 p-5">
              <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.color}`}>
                <svg viewBox="0 0 24 24" fill="none" className={`h-5 w-5 ${card.iconColor}`}>
                  <path d={card.icon} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-zinc-900 group-hover:text-indigo-700 transition-colors">{card.title}</p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400">{card.desc}</p>
              </div>
            </div>
            <div className="mt-auto flex items-center justify-between border-t border-zinc-100 px-5 py-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-300">Report #{card.id}</span>
              <span className="text-xs font-semibold text-indigo-600 group-hover:underline">Open Report →</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
