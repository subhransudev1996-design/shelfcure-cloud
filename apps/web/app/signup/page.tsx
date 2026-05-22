'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import { AuthShell } from '../../components/auth-shell';
import { Field, SubmitButton, Alert } from '../../components/form-fields';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (!data.session) {
      setInfo(`We sent a confirmation link to ${email}. Click it to activate your account.`);
      setLoading(false);
      return;
    }

    router.push('/onboarding');
    router.refresh();
  }

  return (
    <AuthShell
      heading="Start your 14-day trial"
      sub="No credit card required. Cancel anytime."
      tagline="Built for India. Made for chains. Loved by single stores."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field
          label="Work email"
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
          minLength={8}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          hint="Use a strong, unique password."
        />
        {error && <Alert variant="error">{error}</Alert>}
        {info && <Alert variant="success">{info}</Alert>}
        <SubmitButton loading={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-600">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-emerald-700 hover:text-emerald-800">
          Sign in
        </Link>
      </p>

      <div className="mt-8 grid grid-cols-3 gap-3">
        {[
          { v: '14 days', l: 'Free trial' },
          { v: 'No card', l: 'Required' },
          { v: 'GST ready', l: 'Day one' },
        ].map((b) => (
          <div
            key={b.l}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-center"
          >
            <div className="text-sm font-semibold text-zinc-900">{b.v}</div>
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">{b.l}</div>
          </div>
        ))}
      </div>
    </AuthShell>
  );
}
