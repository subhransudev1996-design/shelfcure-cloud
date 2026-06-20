import { getIntegrationsStatus } from '@shelfcure/api-client';
import { getSupabaseServerClient } from '../../../lib/supabase/server';
import { PageHeader } from '../../../components/ui/page-header';

function StatusBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
      Configured
    </span>
  ) : (
    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
      Not configured
    </span>
  );
}

export default async function SettingsPage() {
  const supabase = await getSupabaseServerClient();
  const status = await getIntegrationsStatus(supabase);

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Integrations"
        description="Status only — credentials are managed via the Supabase CLI (`supabase secrets set`), never stored in the database or sent to the browser."
      />

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50/50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
              <th className="px-5 py-3">Integration</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            <tr>
              <td className="px-5 py-3.5 text-zinc-900">
                Razorpay API keys
                <div className="text-xs text-zinc-500">RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET</div>
              </td>
              <td className="px-5 py-3.5">
                <StatusBadge ok={status.razorpay_configured} />
              </td>
            </tr>
            <tr>
              <td className="px-5 py-3.5 text-zinc-900">
                Razorpay webhook secret
                <div className="text-xs text-zinc-500">RAZORPAY_WEBHOOK_SECRET</div>
              </td>
              <td className="px-5 py-3.5">
                <StatusBadge ok={status.razorpay_webhook_configured} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-zinc-500">
        To update: run <code className="rounded bg-zinc-100 px-1 py-0.5">supabase secrets set
        RAZORPAY_KEY_ID=... RAZORPAY_KEY_SECRET=...</code> (and
        <code className="rounded bg-zinc-100 px-1 py-0.5"> RAZORPAY_WEBHOOK_SECRET=...</code> once
        you&apos;ve registered the webhook URL in the Razorpay dashboard), then ask to have this status
        re-checked.
      </p>
    </>
  );
}
