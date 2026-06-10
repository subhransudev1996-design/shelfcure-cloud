import { getSupabaseServerClient } from '../../../lib/supabase/server';
import { PageHeader } from '../../../components/ui/page-header';
import { EmptyState } from '../../../components/ui/empty-state';
import { AddSupplierButton } from './add-supplier-button';

export default async function SuppliersPage() {
  const supabase = await getSupabaseServerClient();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .single();
  const canManage = ['super_admin', 'store_admin', 'pharmacist'].includes(profile?.role ?? '');

  const { data: suppliers } = await supabase.rpc('rpc_list_suppliers');
  const rows = (suppliers ?? []) as Array<{
    id: string;
    name: string;
    city: string;
    state: string;
    phone: string;
    gstin: string | null;
    is_active: boolean;
  }>;

  return (
    <>
      <PageHeader
        eyebrow="Suppliers"
        title="Distributors & vendors"
        description="Suppliers you buy stock from. Used when recording a purchase bill."
        actions={canManage ? <AddSupplierButton /> : null}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
              <path
                d="M3 7h13l3 4h2v7h-2a2 2 0 1 1-4 0H10a2 2 0 1 1-4 0H3V7Z M3 11h13"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          }
          title="No suppliers yet"
          description={
            canManage
              ? 'Add a supplier so you can start recording purchase bills.'
              : 'Ask your admin to add suppliers.'
          }
          action={canManage ? <AddSupplierButton /> : null}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">GSTIN</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-zinc-50/60">
                  <td className="px-4 py-3 font-medium text-zinc-900">{s.name}</td>
                  <td className="px-4 py-3 text-zinc-600">
                    {[s.city, s.state].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{s.phone || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-700">{s.gstin || '—'}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
