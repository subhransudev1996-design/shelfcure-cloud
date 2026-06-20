import Link from 'next/link';
import { notFound } from 'next/navigation';
import { listBillingTiers } from '@shelfcure/api-client';
import { getSupabaseServerClient } from '../../../../lib/supabase/server';
import { PageHeader } from '../../../../components/ui/page-header';
import { EditTierForm } from './edit-tier-form';

export default async function EditTierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const tiers = await listBillingTiers(supabase);
  const tier = tiers.find((t) => t.id === id);
  if (!tier) notFound();

  return (
    <>
      <div className="mb-4">
        <Link href="/console/tiers" className="text-sm font-medium text-zinc-500 hover:text-zinc-800">
          ← Back to tiers
        </Link>
      </div>

      <PageHeader
        eyebrow="Billing"
        title={`Edit ${tier.name}`}
        description={`${tier.org_count} organization(s) are currently on this tier — changes apply to them immediately.`}
      />

      <EditTierForm tier={tier} />
    </>
  );
}
