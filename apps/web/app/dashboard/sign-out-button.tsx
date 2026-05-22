'use client';

import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';

export function SignOutButton() {
  const router = useRouter();

  async function onClick() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '0.5rem 0.875rem',
        background: '#fff',
        color: '#111',
        border: '1px solid #ccc',
        borderRadius: 4,
        cursor: 'pointer',
      }}
    >
      Sign out
    </button>
  );
}
