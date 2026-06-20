'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';

export function SignOutButton({ iconOnly }: { iconOnly?: boolean } = {}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      title={iconOnly ? (loading ? 'Signing out…' : 'Sign out') : undefined}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white text-sm font-medium text-zinc-700 shadow-sm transition-all hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-60 ${
        iconOnly ? 'justify-center p-1.5' : 'px-3 py-1.5'
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0">
        <path
          d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!iconOnly && (loading ? 'Signing out…' : 'Sign out')}
    </button>
  );
}
