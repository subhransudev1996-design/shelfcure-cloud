'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import { AuthShell } from '../../components/auth-shell';
import { Field, SubmitButton, Alert } from '../../components/form-fields';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push('/console');
    router.refresh();
  }

  return (
    <AuthShell
      heading="Console sign in"
      sub="Sign in with your ShelfCure platform admin credentials."
      tagline="Manage every organization on ShelfCure from one place."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          placeholder="you@shelfcure.com"
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          placeholder="••••••••"
        />
        {error && <Alert variant="error">{error}</Alert>}
        <SubmitButton loading={loading}>{loading ? 'Signing in…' : 'Sign in'}</SubmitButton>
      </form>

      <p className="mt-8 text-center text-xs text-zinc-400">
        This panel is for ShelfCure staff only.
      </p>
    </AuthShell>
  );
}
