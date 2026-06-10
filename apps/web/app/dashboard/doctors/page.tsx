import { getSupabaseServerClient } from '../../../lib/supabase/server';
import { PageHeader } from '../../../components/ui/page-header';
import { EmptyState } from '../../../components/ui/empty-state';
import { AddDoctorButton } from './add-doctor-button';

export default async function DoctorsPage() {
  const supabase = await getSupabaseServerClient();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .single();
  const canManage = ['super_admin', 'store_admin', 'pharmacist'].includes(profile?.role ?? '');

  const { data } = await supabase.rpc('rpc_list_doctors');
  const rows = (data ?? []) as Array<{
    id: string;
    name: string;
    specialization: string | null;
    phone: string | null;
    clinic_name: string | null;
    is_active: boolean;
  }>;

  return (
    <>
      <PageHeader
        eyebrow="Doctors"
        title="Prescribers"
        description="Doctors who write prescriptions for your customers. Used to tag sales for commission and recall."
        actions={canManage ? <AddDoctorButton /> : null}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
              <path
                d="M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M5 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1 M9 13l1 3M15 13l-1 3"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          }
          title="No doctors yet"
          description={
            canManage
              ? 'Add a doctor so their prescriptions can be tagged to sales.'
              : 'Ask your admin to add doctors.'
          }
          action={canManage ? <AddDoctorButton /> : null}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Specialization</th>
                <th className="px-4 py-3">Clinic</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((d) => (
                <tr key={d.id} className="hover:bg-zinc-50/60">
                  <td className="px-4 py-3 font-medium text-zinc-900">Dr. {d.name}</td>
                  <td className="px-4 py-3 text-zinc-700">{d.specialization || '—'}</td>
                  <td className="px-4 py-3 text-zinc-600">{d.clinic_name || '—'}</td>
                  <td className="px-4 py-3 text-zinc-600">{d.phone || '—'}</td>
                  <td className="px-4 py-3">
                    {d.is_active ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" /> Disabled
                      </span>
                    )}
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
