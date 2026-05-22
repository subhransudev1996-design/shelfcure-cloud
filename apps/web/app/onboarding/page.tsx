'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { rpcCreateOrgWithOwner, DomainError } from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import { AuthShell } from '../../components/auth-shell';
import { Field, SubmitButton, Alert } from '../../components/form-fields';

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
        router.push('/dashboard');
        return;
      }
      setError(e instanceof Error ? e.message : 'Onboarding failed');
      setLoading(false);
    }
  }

  return (
    <AuthShell
      heading="Tell us about your pharmacy"
      sub="Takes 30 seconds. You can add stores and invite your team next."
      tagline="One organization. Many stores. Total control."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field
          label="Organization name"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          required
          minLength={2}
          maxLength={120}
          placeholder="e.g. Sharma Medicals"
          hint="The legal name of your pharmacy business."
        />
        <Field
          label="Your full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          minLength={2}
          maxLength={120}
          placeholder="Owner / founder name"
        />
        <Field
          label="Phone (optional)"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+91 9000000000"
        />
        {error && <Alert variant="error">{error}</Alert>}
        <SubmitButton loading={loading}>
          {loading ? 'Setting things up…' : 'Create organization'}
        </SubmitButton>
      </form>

      <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
        <div className="flex gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path
                d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="text-sm text-emerald-900">
            <p className="font-medium">Your 14-day trial starts now.</p>
            <p className="mt-0.5 text-emerald-800/80">
              All features unlocked. No card required. Cancel anytime.
            </p>
          </div>
        </div>
      </div>
    </AuthShell>
  );
}
