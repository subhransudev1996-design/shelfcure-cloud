import { getSupabaseServerClient } from '../../../lib/supabase/server';
import { PageHeader } from '../../../components/ui/page-header';

export default async function DebugPage() {
  const supabase = await getSupabaseServerClient();

  const { data: whoami, error: whoamiError } = await supabase.rpc('rpc_whoami');
  const { data: { user } = { user: null } } = await supabase.auth.getUser();

  return (
    <>
      <PageHeader
        eyebrow="Debug"
        title="RLS context"
        description="What the server sees about you. If anything is unexpected, screenshot this and share."
      />

      <section className="space-y-6">
        <DebugCard
          title="Auth user"
          rows={[
            ['auth.uid()', user?.id ?? 'NULL'],
            ['email', user?.email ?? 'NULL'],
            ['JWT role', String(user?.role ?? 'NULL')],
          ]}
        />

        <DebugCard
          title="rpc_whoami() — server-side RLS context"
          rows={
            whoamiError
              ? [['error', whoamiError.message]]
              : Object.entries(whoami ?? {}).map(([k, v]) => [k, String(v ?? 'NULL')])
          }
        />

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">What to check:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><code>profile_role</code> should match what you expect (likely <code>super_admin</code>).</li>
            <li><code>user_role_fn</code> should equal <code>profile_role</code>. If it returns something else (like <code>authenticated</code>) the SQL keyword bug isn&apos;t fully fixed.</li>
            <li><code>current_org_fn</code> should equal <code>profile_org</code>.</li>
            <li><code>auth_uid</code> should equal <code>profile_id</code>.</li>
          </ul>
        </div>
      </section>
    </>
  );
}

function DebugCard({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <header className="border-b border-zinc-100 bg-zinc-50/50 px-5 py-3">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-900">{title}</h2>
      </header>
      <dl className="divide-y divide-zinc-100 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[180px_1fr] gap-4 px-5 py-2.5">
            <dt className="font-mono text-xs text-zinc-500">{k}</dt>
            <dd className="break-all font-mono text-xs text-zinc-900">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
