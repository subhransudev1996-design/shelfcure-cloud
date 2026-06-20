'use client';

import { FEATURE_FLAGS, type FeatureKey } from '@shelfcure/api-client';
import { Field } from '../../../components/form-fields';

export interface TierFormState {
  name: string;
  slug: string;
  description: string;
  is_active: boolean;
  is_default: boolean;
  trial_days: string;
  monthly_price_rupees: string;
  yearly_price_rupees: string;
  max_stores: string;
  max_staff: string;
  features: Partial<Record<FeatureKey, boolean>>;
}

export const EMPTY_TIER_FORM: TierFormState = {
  name: '',
  slug: '',
  description: '',
  is_active: true,
  is_default: false,
  trial_days: '14',
  monthly_price_rupees: '',
  yearly_price_rupees: '',
  max_stores: '',
  max_staff: '',
  features: {},
};

/** Shared "name/pricing/trial/limits/features" form, reused by create + edit. */
export function TierFormFields({
  form,
  set,
  showSlugOverride = false,
}: {
  form: TierFormState;
  set: <K extends keyof TierFormState>(k: K, v: TierFormState[K]) => void;
  showSlugOverride?: boolean;
}) {
  return (
    <div className="space-y-4">
      <Field
        label="Tier name"
        value={form.name}
        onChange={(e) => set('name', e.target.value)}
        required
        minLength={2}
        maxLength={60}
        placeholder="e.g. Growth"
      />

      {showSlugOverride && (
        <Field
          label="Slug (optional)"
          value={form.slug}
          onChange={(e) => set('slug', e.target.value)}
          placeholder="auto-derived from name if left blank"
          hint="Lowercase letters, numbers, and hyphens only."
        />
      )}

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-zinc-800">Description (optional)</span>
        <textarea
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          rows={2}
          placeholder="Shown to platform admins only — not customer-facing copy."
          className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-[15px] text-zinc-900 shadow-sm transition-all placeholder:text-zinc-400 hover:border-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/15"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Monthly price (₹, optional)"
          type="number"
          min={0}
          step="0.01"
          value={form.monthly_price_rupees}
          onChange={(e) => set('monthly_price_rupees', e.target.value)}
          placeholder="Leave blank for contact-sales"
        />
        <Field
          label="Yearly price (₹, optional)"
          type="number"
          min={0}
          step="0.01"
          value={form.yearly_price_rupees}
          onChange={(e) => set('yearly_price_rupees', e.target.value)}
          placeholder="Leave blank for contact-sales"
        />
      </div>

      <Field
        label="Default trial length (days)"
        type="number"
        min={0}
        value={form.trial_days}
        onChange={(e) => set('trial_days', e.target.value)}
        hint="Used when an org on this tier starts a trial, unless overridden at creation time."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Max stores (optional)"
          type="number"
          min={1}
          value={form.max_stores}
          onChange={(e) => set('max_stores', e.target.value)}
          placeholder="Leave blank for unlimited"
        />
        <Field
          label="Max staff (optional)"
          type="number"
          min={1}
          value={form.max_staff}
          onChange={(e) => set('max_staff', e.target.value)}
          placeholder="Leave blank for unlimited"
        />
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-zinc-800">Features</span>
        <div className="space-y-2 rounded-xl border border-zinc-200 p-3">
          {FEATURE_FLAGS.map((f) => (
            <label key={f.key} className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={form.features[f.key] === true}
                onChange={(e) => set('features', { ...form.features, [f.key]: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>
                <span className="block text-sm font-medium text-zinc-800">{f.label}</span>
                <span className="block text-xs text-zinc-500">{f.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-800">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => set('is_active', e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
          />
          Active (assignable to new orgs)
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-800">
          <input
            type="checkbox"
            checked={form.is_default}
            onChange={(e) => set('is_default', e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
          />
          Default for self-serve signup
        </label>
      </div>
    </div>
  );
}

export function tierFormToPayload(form: TierFormState) {
  return {
    name: form.name.trim(),
    slug: form.slug.trim() || undefined,
    description: form.description.trim(),
    is_active: form.is_active,
    is_default: form.is_default,
    trial_days: form.trial_days === '' ? 14 : Number(form.trial_days),
    monthly_price_paise: form.monthly_price_rupees === '' ? null : Math.round(Number(form.monthly_price_rupees) * 100),
    yearly_price_paise: form.yearly_price_rupees === '' ? null : Math.round(Number(form.yearly_price_rupees) * 100),
    max_stores: form.max_stores === '' ? null : Number(form.max_stores),
    max_staff: form.max_staff === '' ? null : Number(form.max_staff),
    features: form.features,
  };
}
