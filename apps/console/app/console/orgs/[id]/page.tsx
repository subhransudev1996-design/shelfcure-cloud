import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOrgDetail, listOrgInvoices, DomainError } from '@shelfcure/api-client';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { PageHeader } from '../../../../components/ui/page-header';
import { EditLicenseButton } from './edit-license-button';
import { StartSubscriptionButton } from './start-subscription-button';
import { CancelSubscriptionButton } from './cancel-subscription-button';
import { RecordManualPaymentButton } from './record-manual-payment-button';
import { SuspendOrgButton } from './suspend-org-button';
import { DeleteOrgButton } from './delete-org-button';

export default async function OrgDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();

  let detail;
  try {
    detail = await getOrgDetail(supabase, id);
  } catch (e) {
    if (e instanceof DomainError && e.message.includes('not_found')) notFound();
    throw e;
  }

  const { org, stores, staff } = detail;
  const invoices = await listOrgInvoices(supabase, id);

  return (
    <>
      <div className="mb-4">
        <Link href="/console/orgs" className="text-sm font-medium text-zinc-500 hover:text-zinc-800">
          ← Back to org directory
        </Link>
      </div>

      <PageHeader
        eyebrow="Organization"
        title={org.name}
        description={org.legal_name && org.legal_name !== org.name ? org.legal_name : undefined}
        actions={
          <div className="flex items-center gap-2">
            <EditLicenseButton org={org} />
            <SuspendOrgButton orgId={org.id} isSuspended={org.is_suspended} />
            <DeleteOrgButton orgId={org.id} orgName={org.name} />
          </div>
        }
      />

      {org.is_suspended && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="font-medium">Suspended</span> since{' '}
          {org.suspended_at ? new Date(org.suspended_at).toLocaleString() : 'unknown'} — staff cannot sign in to
          apps/web or apps/admin until this is lifted.
        </div>
      )}

      <dl className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Tier"
          value={org.billing_tier ? org.billing_tier.name : `${capitalize(org.plan_tier)} (legacy)`}
        />
        <Stat label="Billing status" value={org.billing_status} />
        <Stat
          label={org.billing_status === 'trial' ? 'Trial ends' : 'License valid until'}
          value={org.trial_ends_at ? new Date(org.trial_ends_at).toLocaleDateString() : '—'}
        />
        <Stat label="GSTIN (default)" value={org.gstin_default ?? '—'} mono />
      </dl>

      {org.billing_tier && (org.billing_tier.max_stores != null || org.billing_tier.max_staff != null) && (
        <div className="mb-8 rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Tier limits</div>
          <div className="mt-1 text-zinc-700">
            {stores.length}/{org.billing_tier.max_stores ?? '∞'} stores · {staff.length}/
            {org.billing_tier.max_staff ?? '∞'} staff
          </div>
        </div>
      )}

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Billing</h2>
          <div className="flex items-center gap-2">
            <RecordManualPaymentButton orgId={org.id} currentBillingTierId={org.billing_tier_id} />
            {org.razorpay_subscription_id ? (
              <CancelSubscriptionButton orgId={org.id} />
            ) : (
              <StartSubscriptionButton orgId={org.id} />
            )}
          </div>
        </div>

        {org.razorpay_subscription_id ? (
          <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm">
            <div className="text-zinc-500">Razorpay subscription</div>
            <div className="mt-0.5 font-mono text-zinc-900">{org.razorpay_subscription_id}</div>
          </div>
        ) : (
          <p className="mb-4 text-sm text-zinc-500">No active subscription.</p>
        )}

        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Invoices ({invoices.length})
        </h3>
        {invoices.length === 0 ? (
          <p className="text-sm text-zinc-500">No invoices yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50/50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Tier</th>
                  <th className="px-5 py-3">Method</th>
                  <th className="px-5 py-3">Cycle</th>
                  <th className="px-5 py-3">Subtotal</th>
                  <th className="px-5 py-3">GST (18%)</th>
                  <th className="px-5 py-3">Total</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-5 py-3 text-zinc-600">
                      {new Date(inv.created_at).toLocaleDateString()}
                      {inv.recorded_by_name && (
                        <div className="text-xs text-zinc-400">by {inv.recorded_by_name}</div>
                      )}
                      {inv.notes && <div className="text-xs text-zinc-400">{inv.notes}</div>}
                    </td>
                    <td className="px-5 py-3 text-zinc-600">{inv.tier_name_snapshot ?? '—'}</td>
                    <td className="px-5 py-3 capitalize text-zinc-600">{inv.payment_method.replace('_', ' ')}</td>
                    <td className="px-5 py-3 capitalize text-zinc-600">{inv.billing_cycle ?? '—'}</td>
                    <td className="px-5 py-3 text-zinc-700">₹{(inv.amount_subtotal_paise / 100).toLocaleString('en-IN')}</td>
                    <td className="px-5 py-3 text-zinc-700">₹{(inv.gst_paise / 100).toLocaleString('en-IN')}</td>
                    <td className="px-5 py-3 font-medium text-zinc-900">₹{(inv.total_paise / 100).toLocaleString('en-IN')}</td>
                    <td className="px-5 py-3 capitalize text-zinc-600">{inv.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Stores ({stores.length})
        </h2>
        {stores.length === 0 ? (
          <p className="text-sm text-zinc-500">No stores yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50/50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                  <th className="px-5 py-3">Code</th>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">City</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {stores.map((s) => (
                  <tr key={s.id}>
                    <td className="px-5 py-3 font-mono text-xs text-zinc-700">{s.code}</td>
                    <td className="px-5 py-3 text-zinc-900">{s.name}</td>
                    <td className="px-5 py-3 text-zinc-600">{[s.city, s.state].filter(Boolean).join(', ') || '—'}</td>
                    <td className="px-5 py-3">
                      {s.is_active ? (
                        <span className="text-emerald-700">Active</span>
                      ) : (
                        <span className="text-red-600">Disabled</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Staff ({staff.length})
        </h2>
        {staff.length === 0 ? (
          <p className="text-sm text-zinc-500">No staff yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50/50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {staff.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-3 text-zinc-900">{p.full_name}</td>
                    <td className="px-5 py-3 text-zinc-600">{p.email}</td>
                    <td className="px-5 py-3 text-zinc-600">{p.role}</td>
                    <td className="px-5 py-3">
                      {p.is_active ? (
                        <span className="text-emerald-700">Active</span>
                      ) : (
                        <span className="text-red-600">Disabled</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-1 text-base font-semibold text-zinc-900 ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
