import Link from 'next/link';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../../lib/active-store';
import { reportCashCredit, type CashCreditReport } from '@shelfcure/api-client';

const INR = (n: number) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function presetRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  if (preset === 'today') return { from: today, to: today };
  if (preset === 'week') {
    const day = now.getDay();
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((day + 6) % 7));
    return { from: mon.toISOString().slice(0, 10), to: today };
  }
  if (preset === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    const y = now.getFullYear();
    const startMonth = q * 3;
    return { from: `${y}-${String(startMonth + 1).padStart(2, '0')}-01`, to: today };
  }
  if (preset === '30d') {
    const d = new Date(now);
    d.setDate(now.getDate() - 29);
    return { from: d.toISOString().slice(0, 10), to: today };
  }
  // default: this month
  const y = now.getFullYear(), m = now.getMonth();
  return { from: `${y}-${String(m + 1).padStart(2, '0')}-01`, to: today };
}

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'quarter', label: 'This Quarter' },
  { key: '30d', label: 'Last 30 Days' },
];

export default async function CashCreditPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const preset = sp.preset ?? 'month';
  const range = sp.from && sp.to ? { from: sp.from, to: sp.to } : presetRange(preset);

  const supabase = await getSupabaseServerClient();
  const storeId = await resolveActiveStoreId(supabase);
  if (!storeId) return <div className="py-16 text-center text-sm text-zinc-500">No store available.</div>;

  const data = await reportCashCredit(supabase, storeId, range.from, range.to).catch(
    () => null as CashCreditReport | null,
  );

  const totalSales = data ? data.cash_sales_amount + data.credit_sales_total : 0;
  const cashPct = data && totalSales > 0 ? (data.cash_sales_amount / totalSales) * 100 : 0;
  const creditPct = data && totalSales > 0 ? (data.credit_sales_total / totalSales) * 100 : 0;
  const totalAging = data
    ? data.snapshot.aging_0_30 + data.snapshot.aging_31_60 + data.snapshot.aging_61_90 + data.snapshot.aging_90_plus
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/reports" className="rounded-lg p-1.5 hover:bg-zinc-100">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-zinc-500"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-blue-600"><path d="M2 5h20v14H2z M2 10h20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-black text-zinc-900">Cash vs Credit</h1>
          <p className="text-xs text-zinc-400">Payment-mode split, credit collection, and debt aging</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
          {PRESETS.map((p) => (
            <Link key={p.key} href={`/dashboard/reports/cash-credit?preset=${p.key}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${preset === p.key && !sp.from ? 'bg-blue-50 text-blue-800' : 'text-zinc-600 hover:bg-zinc-50'}`}>
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="py-16 text-center text-sm text-zinc-500">Failed to load cash/credit data.</div>
      ) : (
        <>
          <p className="text-xs text-zinc-400">
            {fmtDate(data.period.from)} → {fmtDate(data.period.to)}
          </p>

          {/* Cash vs Credit split */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Cash Sales</p>
              <p className="mt-1 text-xl font-black tabular-nums text-emerald-700">{INR(data.cash_sales_amount)}</p>
              <p className="mt-0.5 text-[10px] text-zinc-400">{data.cash_sales_count} bill{data.cash_sales_count === 1 ? '' : 's'}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Credit Sales</p>
              <p className="mt-1 text-xl font-black tabular-nums text-amber-700">{INR(data.credit_sales_total)}</p>
              <p className="mt-0.5 text-[10px] text-zinc-400">{data.credit_sales_count} bill{data.credit_sales_count === 1 ? '' : 's'}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Credit Collected</p>
              <p className="mt-1 text-xl font-black tabular-nums text-blue-700">{INR(data.credit_collected)}</p>
              <p className="mt-0.5 text-[10px] text-zinc-400">received in period</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Unpaid (Period Credit)</p>
              <p className="mt-1 text-xl font-black tabular-nums text-red-700">{INR(data.credit_unpaid_portion)}</p>
              <p className="mt-0.5 text-[10px] text-zinc-400">still owed from this period</p>
            </div>
          </div>

          {/* Split bar */}
          {totalSales > 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex justify-between text-xs">
                <span className="font-semibold text-emerald-700">Cash {cashPct.toFixed(0)}%</span>
                <span className="font-semibold text-amber-700">Credit {creditPct.toFixed(0)}%</span>
              </div>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-zinc-100">
                <div className="h-full bg-emerald-400" style={{ width: `${cashPct}%` }} />
                <div className="h-full bg-amber-400" style={{ width: `${creditPct}%` }} />
              </div>
            </div>
          )}

          {/* Snapshot + Aging */}
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-widest text-zinc-500">Debt Snapshot (current, all-time)</p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Total Outstanding</p>
                  <p className="mt-1 text-xl font-black tabular-nums text-amber-700">{INR(data.snapshot.total_outstanding)}</p>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Customers with Balance</p>
                  <p className="mt-1 text-xl font-black tabular-nums text-zinc-900">{data.snapshot.customers_with_balance}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Aging (all unpaid sales)</p>
                <div className="space-y-2">
                  {[
                    { label: '0–30 days', value: data.snapshot.aging_0_30, cls: 'bg-emerald-400' },
                    { label: '31–60 days', value: data.snapshot.aging_31_60, cls: 'bg-amber-400' },
                    { label: '61–90 days', value: data.snapshot.aging_61_90, cls: 'bg-orange-400' },
                    { label: '90+ days', value: data.snapshot.aging_90_plus, cls: 'bg-red-400' },
                  ].map((row) => {
                    const pct = totalAging > 0 ? (Number(row.value) / totalAging) * 100 : 0;
                    return (
                      <div key={row.label}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-zinc-600">{row.label}</span>
                          <span className="font-mono font-semibold text-zinc-800">{INR(row.value)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-zinc-100">
                          <div className={`h-full rounded-full ${row.cls}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Daily trend */}
          {data.daily.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500">Daily Cash / Credit Split</h3>
              </div>
              <div className="flex items-end gap-1 overflow-x-auto px-4 py-4" style={{ minHeight: 120 }}>
                {(() => {
                  const maxAmount = Math.max(...data.daily.map((d) => d.cash_amount + d.credit_amount), 1);
                  return data.daily.map((d) => {
                    const cashH = Math.max(0, (d.cash_amount / maxAmount) * 100);
                    const creditH = Math.max(0, (d.credit_amount / maxAmount) * 100);
                    return (
                      <div key={d.day} className="flex flex-col items-center gap-1" style={{ minWidth: 28 }}>
                        <div className="flex h-20 w-full flex-col items-center justify-end">
                          <div className="flex w-4 flex-col-reverse" style={{ height: '100%' }}>
                            <div className="w-full rounded-b bg-emerald-400" style={{ height: `${cashH}%` }} title={`Cash: ${INR(d.cash_amount)}`} />
                            <div className="w-full rounded-t bg-amber-400" style={{ height: `${creditH}%` }} title={`Credit: ${INR(d.credit_amount)}`} />
                          </div>
                        </div>
                        <span className="text-[9px] text-zinc-400">{fmtDateShort(d.day)}</span>
                      </div>
                    );
                  });
                })()}
              </div>
              <table className="w-full text-sm">
                <thead className="border-t border-zinc-100 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                  <tr>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2 text-right">Cash</th>
                    <th className="px-4 py-2 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {data.daily.map((d) => (
                    <tr key={d.day} className="hover:bg-zinc-50/60">
                      <td className="px-4 py-2 text-xs text-zinc-700">{fmtDate(d.day)}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-emerald-700">{INR(d.cash_amount)} <span className="text-zinc-400">({d.cash_count})</span></td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-amber-700">{INR(d.credit_amount)} <span className="text-zinc-400">({d.credit_count})</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Top debtors + Open credit bills */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-100 bg-amber-50/40 px-4 py-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-amber-700">Top Debtors</h3>
              </div>
              {data.top_debtors.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-zinc-400">No outstanding balances — good news!</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                    <tr>
                      <th className="px-4 py-2">Customer</th>
                      <th className="px-4 py-2 text-right">Outstanding</th>
                      <th className="px-4 py-2 text-right">Last Sale</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {data.top_debtors.map((row) => (
                      <tr key={row.customer_id} className="hover:bg-zinc-50/60">
                        <td className="px-4 py-2 text-xs font-semibold text-zinc-800">
                          {row.customer}
                          {row.phone && <span className="ml-1 text-zinc-400">· {row.phone}</span>}
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-semibold text-amber-700">{INR(row.outstanding)}</td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-zinc-500">
                          {row.days_since_last_sale === null ? '—' : `${row.days_since_last_sale}d ago`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-100 bg-red-50/40 px-4 py-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-red-700">Open Credit Bills (this period)</h3>
              </div>
              {data.credit_bills.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-zinc-400">No open credit bills in this period</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                    <tr>
                      <th className="px-4 py-2">Bill</th>
                      <th className="px-4 py-2 text-right">Total</th>
                      <th className="px-4 py-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {data.credit_bills.map((b) => (
                      <tr key={b.sale_id} className="hover:bg-zinc-50/60">
                        <td className="px-4 py-2 text-xs">
                          <span className="font-semibold text-zinc-800">{b.bill_number}</span>
                          <span className="ml-1 text-zinc-400">{fmtDateShort(b.bill_date)} · {b.customer}</span>
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-zinc-600">{INR(b.total)}</td>
                        <td className="px-4 py-2 text-right font-mono font-semibold text-red-700">{INR(b.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
