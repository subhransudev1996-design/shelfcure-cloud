import type { ReactNode } from 'react';
import { Brand } from './brand';

/**
 * Split layout used by /login.
 * Left: brand panel with gradient + tagline. Right: the form.
 */
export function AuthShell({
  children,
  heading,
  sub,
  tagline,
}: {
  children: ReactNode;
  heading: string;
  sub?: string;
  tagline?: string;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-5">
      {/* Brand panel (hidden on small) */}
      <aside className="relative hidden overflow-hidden bg-zinc-950 lg:col-span-2 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              'radial-gradient(circle at 20% 10%, rgba(16,185,129,0.35), transparent 50%), radial-gradient(circle at 80% 90%, rgba(99,102,241,0.25), transparent 45%), linear-gradient(135deg, #0c0a09 0%, #18181b 100%)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />

        <div className="relative">
          <Brand variant="light" size="md" />
        </div>

        <div className="relative space-y-6">
          <p className="text-3xl font-semibold leading-tight tracking-tight text-white">
            {tagline ?? 'Run every store in your organization from one place.'}
          </p>
          <div className="flex items-center gap-3 text-sm text-emerald-200/90">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_2px_rgba(52,211,153,0.7)]" />
            All systems operational · Mumbai region
          </div>
        </div>

        <div className="relative grid grid-cols-3 gap-4 text-xs text-zinc-400">
          <Stat label="Cross-store sync" value="< 2s" />
          <Stat label="POS commit" value="< 50ms" />
          <Stat label="Uptime SLA" value="99.9%" />
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex min-h-screen items-center justify-center px-6 py-12 lg:col-span-3">
        <div className="w-full max-w-md animate-fade-in-up">
          <div className="mb-8 lg:hidden">
            <Brand size="md" />
          </div>
          <header className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{heading}</h1>
            {sub && <p className="mt-2 text-sm text-zinc-600">{sub}</p>}
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 backdrop-blur-sm">
      <div className="text-base font-semibold text-white">{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-zinc-400">{label}</div>
    </div>
  );
}
