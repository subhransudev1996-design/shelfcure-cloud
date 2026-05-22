'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { rpcCreateOrgWithOwner, DomainError } from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';

export default function OnboardingPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();
      await rpcCreateOrgWithOwner(supabase, {
        orgName: orgName.trim(),
        fullName: fullName.trim(),
        phone: phone.trim() || null,
      });
      router.push('/dashboard');
      router.refresh();
    } catch (e) {
      if (e instanceof DomainError && e.code === 'profile_already_exists') {
        // Already onboarded — just go to dashboard.
        router.push('/dashboard');
        return;
      }
      setError(e instanceof Error ? e.message : 'Onboarding failed');
      setLoading(false);
    }
  }

  return (
    <main style={containerStyle}>
      <h1 style={{ marginBottom: '0.5rem' }}>Tell us about your pharmacy</h1>
      <p style={{ marginBottom: '1.5rem', color: '#555' }}>
        Your 14-day trial starts as soon as your organization is created.
      </p>
      <form onSubmit={onSubmit} style={formStyle}>
        <label style={labelStyle}>
          Organization name
          <input
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            required
            minLength={2}
            maxLength={120}
            placeholder="e.g. Sharma Medicals"
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Your full name
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            minLength={2}
            maxLength={120}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Phone (optional)
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 9000000000"
            style={inputStyle}
          />
        </label>
        {error && <p style={errorStyle}>{error}</p>}
        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? 'Creating…' : 'Create organization'}
        </button>
      </form>
    </main>
  );
}

const containerStyle: React.CSSProperties = {
  maxWidth: 480,
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
