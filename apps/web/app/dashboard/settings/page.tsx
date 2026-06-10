import { getSupabaseServerClient } from '../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../lib/active-store';
import { PageHeader } from '../../../components/ui/page-header';
import { SettingsClient } from './settings-client';

export default async function SettingsPage() {
  const supabase = await getSupabaseServerClient();

  const [{ data: profile }, { data: org }] = await Promise.all([
    supabase.from('user_profiles').select('*').single(),
    supabase.from('organizations').select('*').single(),
  ]);

  const activeStoreId = await resolveActiveStoreId(supabase);
  const { data: store } = activeStoreId
    ? await supabase.from('stores').select('*').eq('id', activeStoreId).single()
    : { data: null };

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Organization & store"
        description="Manage your business details, store configuration, and your own profile."
      />
      <SettingsClient
        role={profile?.role ?? 'cashier'}
        org={org}
        store={store}
        profile={profile}
      />
    </>
  );
}
