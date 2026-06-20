import { getSupabaseServerClient } from '../../../lib/supabase/server';
import { PageHeader } from '../../../components/ui/page-header';
import { EmptyState } from '../../../components/ui/empty-state';
import { AddStaffButton } from './add-staff-button';
import { RemoveStaffButton } from './remove-staff-button';

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Organization owner',
  store_admin: 'Store admin',
  pharmacist: 'Pharmacist',
  cashier: 'Cashier',
  accountant: 'Accountant',
};

const ROLE_TONE: Record<string, string> = {
  super_admin: 'bg-violet-50 text-violet-700 ring-violet-200',
  store_admin: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  pharmacist: 'bg-sky-50 text-sky-700 ring-sky-200',
  cashier: 'bg-amber-50 text-amber-700 ring-amber-200',
  accountant: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
};

export default async function StaffPage() {
  const supabase = await getSupabaseServerClient();

  const [{ data: profile }, { data: userData }] = await Promise.all([
    supabase.from('user_profiles').select('id, role').single(),
    supabase.auth.getUser(),
  ]);
  const canManage = profile?.role === 'super_admin' || profile?.role === 'store_admin';
  const canRemove = profile?.role === 'super_admin';
  const currentUserId = userData.user?.id;

  const [{ data: staff }, { data: stores }] = await Promise.all([
    supabase.rpc('rpc_list_staff'),
    supabase.from('stores').select('id, code, name').order('code', { ascending: true }),
  ]);

  const rows = (staff ?? []) as Array<{
    id: string;
    full_name: string;
    email: string;
    role: string;
    store_code: string | null;
    store_name: string | null;
    is_active: boolean;
    last_login_at: string | null;
    created_at: string;
  }>;

  return (
    <>
      <PageHeader
        eyebrow="Staff"
        title="Team & access"
        description="Invite store admins, pharmacists, cashiers, and accountants. They sign in with email + password."
        actions={canManage ? <AddStaffButton stores={stores ?? []} canCreateAdmins={profile?.role === 'super_admin'} /> : null}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
              <path
                d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          }
          title="No staff yet"
          description={
            canManage
              ? 'Add your first staff member so they can log in and start working on a store.'
              : 'Your organization owner hasn’t added staff yet.'
          }
          action={canManage ? <AddStaffButton stores={stores ?? []} canCreateAdmins={profile?.role === 'super_admin'} /> : null}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
                {canRemove && <th className="px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-zinc-50/60">
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-900">{s.full_name}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${ROLE_TONE[s.role] ?? 'bg-zinc-100 text-zinc-700 ring-zinc-200'}`}
                    >
                      {ROLE_LABEL[s.role] ?? s.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {s.store_code ? (
                      <span>
                        <span className="font-mono text-xs text-emerald-700">{s.store_code}</span>{' '}
                        <span className="text-zinc-500">· {s.store_name}</span>
                      </span>
                    ) : (
                      <span className="text-zinc-400">All stores</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{s.email}</td>
                  <td className="px-4 py-3">
                    {s.is_active ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" /> Disabled
                      </span>
                    )}
                  </td>
                  {canRemove && (
                    <td className="px-4 py-3 text-right">
                      {s.role !== 'super_admin' && s.id !== currentUserId && (
                        <RemoveStaffButton staffId={s.id} fullName={s.full_name} isActive={s.is_active} />
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
