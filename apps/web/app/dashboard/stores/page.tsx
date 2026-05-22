import { getSupabaseServerClient } from '../../../lib/supabase/server';
import { PageHeader } from '../../../components/ui/page-header';
import { EmptyState } from '../../../components/ui/empty-state';
import { AddStoreButton } from './add-store-button';

export default async function StoresPage() {
  const supabase = await getSupabaseServerClient();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .single();
  const canManage = profile?.role === 'super_admin';

  const { data: stores } = await supabase
    .from('stores')
    .select('id, code, name, city, state, phone, gstin, is_active, created_at')
    .order('code', { ascending: true });

  return (
    <>
      <PageHeader
        eyebrow="Stores"
        title="Your locations"
        description="Add and manage the pharmacies under your organization."
        actions={canManage ? <AddStoreButton /> : null}
      />

      {!stores?.length ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
              <path
                d="M3 9l9-6 9 6v11a2 2 0 0 1-2 2h-4v-7H10v7H6a2 2 0 0 1-2-2V9Z"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
              />
            </svg>
          }
          title="No stores yet"
          description={
            canManage
              ? 'Add your first store to start managing medicines, customers, and sales.'
              : 'Ask your organization owner to add a store and assign you to it.'
          }
          action={canManage ? <AddStoreButton /> : null}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((s) => (
            <li
              key={s.id}
              className="group relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-xs font-medium uppercase tracking-wider text-emerald-700">
                    {s.code}
                  </div>
                  <div className="mt-1 truncate text-base font-semibold text-zinc-900">{s.name}</div>
                  {(s.city || s.state) && (
                    <div className="mt-0.5 text-sm text-zinc-500">
                      {[s.city, s.state].filter(Boolean).join(', ')}
                    </div>
                  )}
                </div>
                {!s.is_active && (
                  <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200">
                    Disabled
                  </span>
                )}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-zinc-400">Phone</dt>
                  <dd className="mt-0.5 truncate text-zinc-700">{s.phone || '—'}</dd>
                </div>
                <div>
                  <dt className="text-zinc-400">GSTIN</dt>
                  <dd className="mt-0.5 truncate font-mono text-zinc-700">{s.gstin || '—'}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
