import { listBillingTiers, FEATURE_FLAGS } from '@shelfcure/api-client';
import { getSupabaseServerClient } from '../../../lib/supabase/server';
import { PageHeader } from '../../../components/ui/page-header';
import { EmptyState } from '../../../components/ui/empty-state';
import { LinkButton } from '../../../components/ui/link-button';
import { DeleteTierButton } from './delete-tier-button';

function formatRupees(paise: number | null): string {
  if (paise == null) return 'Contact sales';
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}

export default async function TiersPage() {
  const supabase = await getSupabaseServerClient();
  const tiers = await listBillingTiers(supabase);

  return (
    <>
      <PageHeader
        eyebrow="Billing"
        title="Tiers"
        description="Manage every plan tier from one place — pricing, trial length, store/staff limits, and feature access. Fully dynamic: create, edit, or retire tiers any time."
        actions={
          <LinkButton
            href="/console/tiers/new"
            leadingIcon={
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
              </svg>
            }
          >
            Create tier
          </LinkButton>
        }
      />

      {tiers.length === 0 ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
              <path
                d="M12 2 2 7l10 5 10-5-10-5Z M2 17l10 5 10-5 M2 12l10 5 10-5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          }
          title="No billing tiers yet"
          description="Create your first tier to start assigning trials and licenses to organizations."
          action={<LinkButton href="/console/tiers/new">Create tier</LinkButton>}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                <th className="px-5 py-3">Tier</th>
                <th className="px-5 py-3">Monthly</th>
                <th className="px-5 py-3">Yearly</th>
                <th className="px-5 py-3">Trial</th>
                <th className="px-5 py-3">Limits</th>
                <th className="px-5 py-3">Features</th>
                <th className="px-5 py-3">Orgs</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {tiers.map((t) => (
                <tr key={t.id}>
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-zinc-900">{t.name}</div>
                    <div className="text-xs text-zinc-400">{t.slug}</div>
                  </td>
                  <td className="px-5 py-3.5 text-zinc-700">{formatRupees(t.monthly_price_paise)}</td>
                  <td className="px-5 py-3.5 text-zinc-700">{formatRupees(t.yearly_price_paise)}</td>
                  <td className="px-5 py-3.5 text-zinc-600">{t.trial_days}d</td>
                  <td className="px-5 py-3.5 text-zinc-600">
                    {t.max_stores ?? '∞'} stores · {t.max_staff ?? '∞'} staff · {t.max_ai_scans_per_month ?? '∞'} scans/mo
                  </td>
                  <td className="px-5 py-3.5 text-zinc-600">
                    {FEATURE_FLAGS.filter((f) => t.features[f.key]).map((f) => f.label).join(', ') || '—'}
                  </td>
                  <td className="px-5 py-3.5 text-zinc-600">{t.org_count}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap gap-1">
                      {t.is_default && (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200">
                          Default
                        </span>
                      )}
                      {t.is_active ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                          Active
                        </span>
                      ) : (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200">
                          Inactive
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-1.5">
                      <LinkButton href={`/console/tiers/${t.id}`} variant="secondary" size="sm">
                        Edit
                      </LinkButton>
                      <DeleteTierButton tier={t} />
                    </div>
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
