import type { ReactNode } from 'react';
import { tierHasFeature } from '@shelfcure/api-client';
import { getSupabaseServerClient } from '../../../lib/supabase/server';

export default async function ReportsLayout({ children }: { children: ReactNode }) {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // parent dashboard layout already redirects unauthenticated users

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('org_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) return null;

  const { data: org } = await supabase
    .from('organizations')
    .select('billing_tier_id')
    .eq('id', profile.org_id)
    .maybeSingle();

  let features: Record<string, boolean> | null = null;
  if (org?.billing_tier_id) {
    const { data: tier } = await supabase
      .from('billing_tiers')
      .select('features')
      .eq('id', org.billing_tier_id)
      .maybeSingle();
    features = (tier?.features as Record<string, boolean> | null) ?? null;
  }

  if (!tierHasFeature(features, 'advanced_reports')) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-zinc-300 bg-white/60 px-6 py-14 text-center">
        <h2 className="text-base font-semibold text-zinc-900">Reports aren&apos;t included in your plan</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">
          Upgrade your plan to unlock the Reports section, or contact your ShelfCure account manager.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
