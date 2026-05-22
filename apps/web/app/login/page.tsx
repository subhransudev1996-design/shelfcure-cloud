'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';

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

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main style={containerStyle}>
      <h1 style={{ marginBottom: '1.5rem' }}>Sign in to ShelfCure Cloud</h1>
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
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={inputStyle}
          />
        </label>
        {error && <p style={errorStyle}>{error}</p>}
        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p style={{ marginTop: '1rem' }}>
        New here? <Link href="/signup">Create an account</Link>
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
