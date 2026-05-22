'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';

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

    // If email confirmation is enabled in Supabase Auth settings, session will be null
    // and the user must click the email link before logging in.
    if (!data.session) {
      setInfo('Check your email to confirm your account.');
      setLoading(false);
      return;
    }

    router.push('/onboarding');
    router.refresh();
  }

  return (
    <main style={containerStyle}>
      <h1 style={{ marginBottom: '1.5rem' }}>Create your ShelfCure Cloud account</h1>
      <form onSubmit={onSubmit} style={formStyle}>
        <label style={labelStyle}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Password (8+ chars)
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            style={inputStyle}
          />
        </label>
        {error && <p style={errorStyle}>{error}</p>}
        {info && <p style={infoStyle}>{info}</p>}
        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p style={{ marginTop: '1rem' }}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </main>
  );
}

const containerStyle: React.CSSProperties = {
  maxWidth: 420,
  margin: '4rem auto',
  padding: '2rem',
  fontFamily: 'system-ui, sans-serif',
};
const formStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '1rem' };
const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.25rem' };
const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  border: '1px solid #ccc',
  borderRadius: 4,
  fontSize: '1rem',
};
const buttonStyle: React.CSSProperties = {
  padding: '0.625rem 1rem',
  background: '#111',
  color: '#fff',
  border: 0,
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: '1rem',
};
const errorStyle: React.CSSProperties = { color: '#b00', fontSize: '0.9rem', margin: 0 };
const infoStyle: React.CSSProperties = { color: '#060', fontSize: '0.9rem', margin: 0 };
