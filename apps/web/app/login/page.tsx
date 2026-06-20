'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { checkOrgAccess } from '@shelfcure/api-client';
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

    try {
      const access = await checkOrgAccess(supabase);
      if (!access.allowed) {
        await supabase.auth.signOut();
        setError("Your organization's subscription has been suspended. Please contact ShelfCure support.");
        setLoading(false);
        return;
      }
    } catch {
      await supabase.auth.signOut();
      setError('Could not verify account access. Please try again.');
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <AuthShell
      heading="Welcome back"
      sub="Sign in to manage your pharmacy operations."
      tagline="Welcome back. Your stores are in good hands."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          placeholder="you@pharmacy.com"
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          placeholder="••••••••"
          trailing={
            <Link
              href="#"
              className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
            >
              Forgot password?
            </Link>
          }
        />
        {error && <Alert variant="error">{error}</Alert>}
        <SubmitButton loading={loading}>{loading ? 'Signing in…' : 'Sign in'}</SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-600">
        New to ShelfCure?{' '}
        <Link href="/signup" className="font-medium text-emerald-700 hover:text-emerald-800">
          Create an account
        </Link>
      </p>

      <p className="mt-8 text-center text-xs text-zinc-400">
        By signing in you agree to our Terms and Privacy Policy.
      </p>
    </AuthShell>
  );
}
