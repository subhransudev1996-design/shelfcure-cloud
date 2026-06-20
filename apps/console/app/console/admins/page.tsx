import { listPlatformAdmins } from '@shelfcure/api-client';
import { getSupabaseServerClient } from '../../../lib/supabase/server';
import { PageHeader } from '../../../components/ui/page-header';
import { AddPlatformAdminButton } from './add-platform-admin-button';

export default async function AdminsPage() {
  const supabase = await getSupabaseServerClient();
  const admins = await listPlatformAdmins(supabase);

  return (
    <>
      <PageHeader
        eyebrow="Platform Admins"
        title="ShelfCure staff"
        description="Everyone with access to this Console. Every platform admin has equal, full access."
        actions={<AddPlatformAdminButton />}
      />

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50/50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Added</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {admins.map((a) => (
              <tr key={a.id}>
                <td className="px-5 py-3.5 font-medium text-zinc-900">{a.full_name}</td>
                <td className="px-5 py-3.5 text-zinc-600">{a.email}</td>
                <td className="px-5 py-3.5">
                  {a.is_active ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                      Active
                    </span>
                  ) : (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200">
                      Disabled
                    </span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-zinc-600">{new Date(a.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
