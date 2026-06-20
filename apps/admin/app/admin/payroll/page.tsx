import { listStaff, listSalaryPayments, tierHasFeature } from '@shelfcure/api-client';
import { getSupabaseServerClient } from '../../../lib/supabase/server';
import { PageHeader } from '../../../components/ui/page-header';
import { EmptyState } from '../../../components/ui/empty-state';
import { RecordPaymentButton } from './record-payment-button';

const ROLE_LABEL: Record<string, string> = {
  store_admin: 'Store admin',
  pharmacist: 'Pharmacist',
  cashier: 'Cashier',
  accountant: 'Accountant',
};

const INR = (n: number) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function PayrollPage() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('user_profiles').select('org_id').eq('id', user.id).maybeSingle()
    : { data: null };
  const { data: org } = profile
    ? await supabase.from('organizations').select('billing_tier_id').eq('id', profile.org_id).maybeSingle()
    : { data: null };
  let features: Record<string, boolean> | null = null;
  if (org?.billing_tier_id) {
    const { data: tier } = await supabase
      .from('billing_tiers')
      .select('features')
      .eq('id', org.billing_tier_id)
      .maybeSingle();
    features = (tier?.features as Record<string, boolean> | null) ?? null;
  }

  if (!tierHasFeature(features, 'staff_payroll')) {
    return (
      <>
        <PageHeader eyebrow="Payroll" title="Pay your staff" />
        <div className="rounded-2xl border-2 border-dashed border-zinc-300 bg-white/60 px-6 py-14 text-center">
          <h2 className="text-base font-semibold text-zinc-900">Payroll isn&apos;t included in your plan</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">
            Upgrade your plan to unlock the payroll module, or contact your ShelfCure account manager.
          </p>
        </div>
      </>
    );
  }

  const [staff, payments, { data: stores }] = await Promise.all([
    listStaff(supabase),
    listSalaryPayments(supabase),
    supabase.from('stores').select('id, code, name').order('code', { ascending: true }),
  ]);

  const payableStaff = staff.filter((s) => s.role !== 'super_admin');
  const storeOptions = stores ?? [];

  const lastPaidByStaff = new Map<string, { amount: number; payment_date: string }>();
  for (const p of payments) {
    if (!lastPaidByStaff.has(p.user_profile_id)) {
      lastPaidByStaff.set(p.user_profile_id, { amount: p.amount, payment_date: p.payment_date });
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Payroll"
        title="Pay your staff"
        description="Record salary payments — each one is logged as a Salaries expense so Finance reports stay in sync."
      />

      {payableStaff.length === 0 ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
              <path
                d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          }
          title="No staff to pay yet"
          description="Add staff from the Staff page first, then come back here to set salaries and record payments."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3">Monthly salary</th>
                <th className="px-4 py-3">Last paid</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {payableStaff.map((s) => {
                const last = lastPaidByStaff.get(s.id);
                return (
                  <tr key={s.id} className="hover:bg-zinc-50/60">
                    <td className="px-4 py-3 font-medium text-zinc-900">{s.full_name}</td>
                    <td className="px-4 py-3 text-zinc-700">{ROLE_LABEL[s.role] ?? s.role}</td>
                    <td className="px-4 py-3 text-zinc-700">
                      {s.store_code ? (
                        <span className="font-mono text-xs text-emerald-700">{s.store_code}</span>
                      ) : (
                        <span className="text-zinc-400">All stores</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
                      {s.monthly_salary != null ? INR(s.monthly_salary) : (
                        <span className="text-zinc-400">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {last ? (
                        <span>
                          {INR(last.amount)} <span className="text-zinc-400">· {fmtDate(last.payment_date)}</span>
                        </span>
                      ) : (
                        <span className="text-zinc-400">Never</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RecordPaymentButton staff={s} stores={storeOptions} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Payment history
        </h2>
        {payments.length === 0 ? (
          <p className="text-sm text-zinc-500">No salary payments recorded yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Staff</th>
                  <th className="px-4 py-3">Store</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-50/60">
                    <td className="px-4 py-3 text-zinc-700">{fmtDate(p.payment_date)}</td>
                    <td className="px-4 py-3 font-medium text-zinc-900">{p.staff_name}</td>
                    <td className="px-4 py-3 text-zinc-700">
                      {p.store_code ? (
                        <span className="font-mono text-xs text-emerald-700">{p.store_code}</span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-900">{INR(p.amount)}</td>
                    <td className="px-4 py-3 text-zinc-600">
                      {p.payment_method
                        ? p.payment_method.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">{p.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
