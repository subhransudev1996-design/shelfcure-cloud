import Link from 'next/link';
import { listOrgs } from '@shelfcure/api-client';
import { getSupabaseServerClient } from '../../../lib/supabase/server';
import { PageHeader } from '../../../components/ui/page-header';
import { EmptyState } from '../../../components/ui/empty-state';
import { CreateOrgButton } from './create-org-button';

const BILLING_STYLES: Record<string, string> = {
  trial: 'bg-blue-50 text-blue-700 ring-blue-200',
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  past_due: 'bg-amber-50 text-amber-700 ring-amber-200',
  cancelled: 'bg-zinc-100 text-zinc-600 ring-zinc-200',
  expired: 'bg-red-50 text-red-700 ring-red-200',
};

export default async function OrgsPage() {
  const supabase = await getSupabaseServerClient();
  const orgs = await listOrgs(supabase);

  return (
    <>
      <PageHeader
        eyebrow="Organizations"
        title="Org directory"
        description="Every organization on the platform — store/staff counts and license status at a glance."
        actions={<CreateOrgButton />}
      />

      {!orgs.length ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
              <path
                d="M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          }
          title="No organizations yet"
          description="Organizations created via self-serve signup or by platform staff will show up here."
          action={<CreateOrgButton />}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                <th className="px-5 py-3">Organization</th>
                <th className="px-5 py-3">Plan</th>
                <th className="px-5 py-3">Billing</th>
                <th className="px-5 py-3">Trial ends</th>
                <th className="px-5 py-3">Stores</th>
                <th className="px-5 py-3">Staff</th>
                <th className="px-5 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {orgs.map((o) => (
                <tr key={o.id} className="transition-colors hover:bg-zinc-50/70">
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/console/orgs/${o.id}`}
                      className="font-medium text-zinc-900 hover:text-indigo-700"
                    >
                      {o.name}
                    </Link>
                    {o.is_suspended && (
                      <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200">
                        Suspended
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-zinc-600">
                    {o.billing_tier_name ?? (
                      <span className="text-zinc-400" title="Pre-dynamic-tiers legacy value">
                        {o.plan_tier} (legacy)
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                        BILLING_STYLES[o.billing_status] ?? 'bg-zinc-100 text-zinc-600 ring-zinc-200'
                      }`}
                    >
                      {o.billing_status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-zinc-600">
                    {o.trial_ends_at ? new Date(o.trial_ends_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-zinc-600">{o.store_count}</td>
                  <td className="px-5 py-3.5 text-zinc-600">{o.staff_count}</td>
                  <td className="px-5 py-3.5 text-zinc-600">
                    {new Date(o.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
