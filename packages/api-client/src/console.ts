import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError, DomainError } from './errors';

type Client = SupabaseClient<Database>;

export interface OrgSummary {
  id: string;
  name: string;
  legal_name: string | null;
  plan_tier: string;
  billing_tier_id: string | null;
  billing_tier_name: string | null;
  billing_status: string;
  trial_ends_at: string | null;
  is_suspended: boolean;
  suspended_at: string | null;
  store_count: number;
  staff_count: number;
  created_at: string;
}

export async function listOrgs(client: Client): Promise<OrgSummary[]> {
  const { data, error } = await client.rpc('rpc_console_list_orgs');
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as OrgSummary[];
}

export interface OrgDetailBillingTier {
  id: string;
  name: string;
  max_stores: number | null;
  max_staff: number | null;
  features: Record<string, boolean>;
}

export interface OrgDetailOrg {
  id: string;
  name: string;
  legal_name: string | null;
  gstin_default: string | null;
  plan_tier: string;
  billing_tier_id: string | null;
  billing_tier: OrgDetailBillingTier | null;
  billing_status: string;
  trial_ends_at: string | null;
  is_suspended: boolean;
  suspended_at: string | null;
  shared_masters_enabled: boolean;
  razorpay_customer_id: string | null;
  razorpay_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrgDetailStore {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string;
  is_active: boolean;
  created_at: string;
}

export interface OrgDetailStaff {
  id: string;
  full_name: string;
  email: string;
  role: string;
  store_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface OrgDetail {
  org: OrgDetailOrg;
  stores: OrgDetailStore[];
  staff: OrgDetailStaff[];
}

export async function getOrgDetail(client: Client, orgId: string): Promise<OrgDetail> {
  const { data, error } = await client.rpc('rpc_console_get_org_detail', { p_org_id: orgId });
  if (error) throw mapSupabaseError(error);
  return data as unknown as OrgDetail;
}

export type BillingStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired';

export interface UpdateOrgLicenseInput {
  billing_tier_id?: string | null;
  billing_status?: BillingStatus;
  trial_ends_at?: string | null;
}

/**
 * Edit an org's billing_tier_id/billing_status/trial_ends_at. billing_tier_id
 * drives real limit/feature enforcement in apps/web (max_stores, max_staff,
 * feature toggles) — null means "ungoverned" (no limits). Audited via
 * audit_log inside the RPC.
 */
export async function updateOrgLicense(
  client: Client,
  orgId: string,
  input: UpdateOrgLicenseInput,
): Promise<OrgDetailOrg> {
  const payload: Record<string, unknown> = {};
  if (input.billing_tier_id !== undefined) payload.billing_tier_id = input.billing_tier_id;
  if (input.billing_status !== undefined) payload.billing_status = input.billing_status;
  if (input.trial_ends_at !== undefined) payload.trial_ends_at = input.trial_ends_at;

  const { data, error } = await client.rpc('rpc_console_update_org_license', {
    p_org_id: orgId,
    p_payload: payload as never,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as OrgDetailOrg;
}

/**
 * Toggle an org's suspension. Suspending blocks every member of the org from
 * signing in to apps/web and apps/admin (checked at sign-in only — does not
 * tear down an already-open session). Independent of billing_status —
 * unsuspending restores whatever billing state the org was already in.
 */
export async function setOrgSuspended(
  client: Client,
  orgId: string,
  suspended: boolean,
): Promise<OrgDetailOrg> {
  const { data, error } = await client.rpc('rpc_console_set_org_suspended', {
    p_org_id: orgId,
    p_suspended: suspended,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as OrgDetailOrg;
}

/**
 * Permanently delete an organization and every row scoped to it. Irreversible
 * — the caller must pass the organization's exact current name as
 * confirmName. Returns the deleted staff's auth.users ids so the caller can
 * also remove those via the console-delete-org Edge Function (deleting
 * auth.users rows needs the service role, which this RPC does not have).
 */
export async function deleteOrganization(
  client: Client,
  orgId: string,
  confirmName: string,
): Promise<{ org_id: string; deleted_user_count: number; failed_user_ids: string[] }> {
  const { data, error } = await client.functions.invoke('console-delete-org', {
    body: { org_id: orgId, confirm_name: confirmName },
  });

  if (error) {
    let serverMessage: string | undefined;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        if (body && typeof body === 'object' && typeof body.error === 'string') {
          serverMessage = body.error;
        }
      }
    } catch {
      // ignore — fall back to generic mapping
    }
    if (serverMessage) {
      throw new DomainError('validation_failed', humanizeError(serverMessage));
    }
    throw mapSupabaseError(error);
  }

  if (data?.error) {
    throw new DomainError('validation_failed', humanizeError(data.error));
  }
  return data as { org_id: string; deleted_user_count: number; failed_user_ids: string[] };
}

export interface PlatformAdmin {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  created_at: string;
}

export async function listPlatformAdmins(client: Client): Promise<PlatformAdmin[]> {
  const { data, error } = await client.rpc('rpc_console_list_platform_admins');
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as PlatformAdmin[];
}

export interface CreatePlatformAdminInput {
  email: string;
  password: string;
  full_name: string;
}

export interface CreatedPlatformAdmin {
  id: string;
  full_name: string;
  email: string;
}

/**
 * Create a platform admin. Goes through the create-platform-admin Edge
 * Function because creating an auth.users row with an admin-chosen password
 * requires the service role key (never shipped to the browser).
 */
export async function createPlatformAdmin(
  client: Client,
  input: CreatePlatformAdminInput,
): Promise<CreatedPlatformAdmin> {
  const { data, error } = await client.functions.invoke('create-platform-admin', {
    body: {
      email: input.email.trim().toLowerCase(),
      password: input.password,
      full_name: input.full_name.trim(),
    },
  });

  if (error) {
    let serverMessage: string | undefined;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        if (body && typeof body === 'object' && typeof body.error === 'string') {
          serverMessage = body.error;
        }
      }
    } catch {
      // ignore — fall back to generic mapping
    }
    if (serverMessage) {
      throw new DomainError('validation_failed', humanizeError(serverMessage));
    }
    throw mapSupabaseError(error);
  }

  if (data?.error) {
    throw new DomainError('validation_failed', humanizeError(data.error));
  }
  if (!data?.admin) {
    throw new DomainError('unknown', 'Platform admin creation returned no profile');
  }
  return data.admin as CreatedPlatformAdmin;
}

export type CreateOrgLicense =
  | { mode: 'trial'; billing_tier_id: string | null; trial_days: number }
  | {
      mode: 'paid';
      billing_tier_id: string;
      billing_cycle: BillingCycle;
      amount_paise: number;
      payment_method: Exclude<PaymentMethod, 'razorpay'>;
      notes?: string | null;
    };

export interface CreateOrgInput {
  org_name: string;
  owner_full_name: string;
  owner_email: string;
  owner_password: string;
  owner_phone?: string | null;
  license?: CreateOrgLicense;
}

export interface CreatedOrg {
  org_id: string;
  profile_id: string;
}

/**
 * Hand-create an organization + its owner account. Goes through the
 * create-org-with-owner Edge Function (same reason as createPlatformAdmin —
 * the owner's auth.users row needs the service role key). For sales-assisted
 * onboarding; self-serve signup (rpc_create_org_with_owner) is unaffected.
 * `license` picks a dynamic billing tier (or none, for an ungoverned org) and
 * lets a field-sales rep activate a paid license immediately (cash/UPI/etc.
 * collected on the spot) instead of always starting on trial.
 */
export async function createOrgWithOwner(client: Client, input: CreateOrgInput): Promise<CreatedOrg> {
  const { data, error } = await client.functions.invoke('create-org-with-owner', {
    body: {
      org_name: input.org_name.trim(),
      owner_full_name: input.owner_full_name.trim(),
      owner_email: input.owner_email.trim().toLowerCase(),
      owner_password: input.owner_password,
      owner_phone: input.owner_phone?.trim() || null,
      license: input.license,
    },
  });

  if (error) {
    let serverMessage: string | undefined;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        if (body && typeof body === 'object' && typeof body.error === 'string') {
          serverMessage = body.error;
        }
      }
    } catch {
      // ignore — fall back to generic mapping
    }
    if (serverMessage) {
      throw new DomainError('validation_failed', humanizeError(serverMessage));
    }
    throw mapSupabaseError(error);
  }

  if (data?.error) {
    throw new DomainError('validation_failed', humanizeError(data.error));
  }
  if (!data?.org) {
    throw new DomainError('unknown', 'Organization creation returned no result');
  }
  return data.org as CreatedOrg;
}

function humanizeError(code: string): string {
  switch (code) {
    case 'password_min_8_chars':
      return 'Password must be at least 8 characters';
    case 'invalid_email':
      return 'Please enter a valid email address';
    case 'invalid_full_name':
      return 'Please enter a full name (at least 2 characters)';
    case 'invalid_org_name':
      return 'Please enter an organization name (at least 2 characters)';
    case 'invalid_name':
      return 'Please enter a name (at least 2 characters)';
    case 'invalid_slug':
      return 'Could not derive a valid identifier from that name — try a simpler name or set a custom slug';
    case 'tier_in_use':
      return 'This tier still has organizations on it — reassign or deactivate it instead of deleting';
    case 'name_mismatch':
      return 'The text you typed does not match the organization name';
    case 'profile_already_exists':
      return 'A platform admin for this user already exists';
    case 'invalid_token':
    case 'missing_authorization':
      return 'You are not signed in';
    case 'create_user_failed':
      return 'Could not create the user — check the email is not already in use';
    case 'plan_not_configured':
      return 'This plan is not yet wired up to a Razorpay plan — run the plan setup script first';
    case 'razorpay_not_configured':
      return 'Razorpay credentials are not configured yet';
    case 'no_active_subscription':
      return 'This organization has no active subscription to cancel';
    default:
      if (code.startsWith('permission_denied')) return code;
      if (code.includes('already been registered') || code.includes('already exists'))
        return 'A user with this email already exists';
      return code;
  }
}

export type BillingCycle = 'monthly' | 'yearly';
export type PaymentMethod = 'razorpay' | 'cash' | 'upi' | 'card' | 'bank_transfer' | 'cheque';

/**
 * Fixed registry of feature keys apps/web actually checks. Which tier grants
 * which key is fully admin-configurable (BillingTier.features); the universe
 * of possible keys is bounded by what's wired up in code — add a new entry
 * here only once a real enforcement point exists for it.
 */
export const FEATURE_FLAGS = [
  {
    key: 'advanced_reports',
    label: 'Advanced Reports',
    description: 'Access to the Reports section (GST, growth trend, stock velocity, profit tracking, etc.)',
  },
  {
    key: 'staff_payroll',
    label: 'Staff Payroll',
    description: 'Access to the staff salary/payroll module',
  },
] as const;

export type FeatureKey = (typeof FEATURE_FLAGS)[number]['key'];

/**
 * True if an org's tier grants the given feature. An org with no tier at all
 * (billing_tier_id null — "ungoverned", e.g. created before any tier existed)
 * is treated as having every feature, so nothing already working breaks.
 * Used by apps/web's server-side enforcement points (e.g. the Reports
 * section layout, the payroll page) — keep this pure/sync so it stays usable
 * in both server and client components.
 */
export function tierHasFeature(
  features: Partial<Record<FeatureKey, boolean>> | null | undefined,
  key: FeatureKey,
): boolean {
  if (features == null) return true;
  return features[key] === true;
}

export interface BillingTier {
  id: string;
  name: string;
  slug: string;
  description: string;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
  trial_days: number;
  monthly_price_paise: number | null;
  yearly_price_paise: number | null;
  razorpay_plan_id_monthly: string | null;
  razorpay_plan_id_yearly: string | null;
  max_stores: number | null;
  max_staff: number | null;
  features: Partial<Record<FeatureKey, boolean>>;
  org_count: number;
  created_at: string;
  updated_at: string;
}

export async function listBillingTiers(client: Client): Promise<BillingTier[]> {
  const { data, error } = await client.rpc('rpc_console_list_billing_tiers');
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as BillingTier[];
}

export interface BillingTierInput {
  name: string;
  slug?: string;
  description?: string;
  is_active?: boolean;
  is_default?: boolean;
  sort_order?: number;
  trial_days?: number;
  monthly_price_paise?: number | null;
  yearly_price_paise?: number | null;
  razorpay_plan_id_monthly?: string | null;
  razorpay_plan_id_yearly?: string | null;
  max_stores?: number | null;
  max_staff?: number | null;
  features?: Partial<Record<FeatureKey, boolean>>;
}

export async function createBillingTier(client: Client, input: BillingTierInput): Promise<BillingTier> {
  const { data, error } = await client.rpc('rpc_console_create_billing_tier', { p_payload: input as never });
  if (error) throw mapSupabaseError(error);
  return data as unknown as BillingTier;
}

export async function updateBillingTier(
  client: Client,
  tierId: string,
  input: Partial<BillingTierInput>,
): Promise<BillingTier> {
  const { data, error } = await client.rpc('rpc_console_update_billing_tier', {
    p_tier_id: tierId,
    p_payload: input as never,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as BillingTier;
}

export async function deleteBillingTier(client: Client, tierId: string): Promise<void> {
  const { error } = await client.rpc('rpc_console_delete_billing_tier', { p_tier_id: tierId });
  if (error) throw mapSupabaseError(error);
}

export interface Invoice {
  id: string;
  razorpay_payment_id: string | null;
  payment_method: PaymentMethod;
  billing_cycle: BillingCycle | null;
  billing_tier_id: string | null;
  tier_name_snapshot: string | null;
  amount_subtotal_paise: number;
  gst_paise: number;
  total_paise: number;
  status: 'captured' | 'failed' | 'refunded';
  notes: string | null;
  recorded_by_name: string | null;
  created_at: string;
}

export async function listOrgInvoices(client: Client, orgId: string): Promise<Invoice[]> {
  const { data, error } = await client.rpc('rpc_console_list_org_invoices', { p_org_id: orgId });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as Invoice[];
}

export interface RecordManualPaymentInput {
  billing_tier_id: string;
  billing_cycle: BillingCycle;
  amount_paise: number;
  payment_method: Exclude<PaymentMethod, 'razorpay'>;
  payment_date?: string;
  notes?: string | null;
  client_uuid?: string;
}

/**
 * Activate/renew an org's license from an offline payment (cash/UPI/card/
 * bank_transfer/cheque) — no Razorpay involved. For field-sales deals where
 * the customer pays in person rather than completing online checkout.
 */
export async function recordManualPayment(
  client: Client,
  orgId: string,
  input: RecordManualPaymentInput,
): Promise<{ org_id: string; invoice_id: string }> {
  const { data, error } = await client.rpc('rpc_console_record_manual_payment', {
    p_org_id: orgId,
    p_billing_tier_id: input.billing_tier_id,
    p_billing_cycle: input.billing_cycle,
    p_amount_paise: input.amount_paise,
    p_payment_method: input.payment_method,
    p_payment_date: input.payment_date,
    p_notes: input.notes ?? null,
    p_client_uuid: input.client_uuid ?? null,
  });
  if (error) throw mapSupabaseError(error);
  return data as unknown as { org_id: string; invoice_id: string };
}

/**
 * Start a Razorpay subscription for an org. Goes through the
 * razorpay-create-subscription Edge Function — it talks to Razorpay's API
 * with server-only secrets, then persists the resulting ids via
 * rpc_console_save_subscription. Returns the hosted checkout URL to share
 * with the org owner out-of-band.
 */
export async function createSubscription(
  client: Client,
  orgId: string,
  billingTierId: string,
  billingCycle: BillingCycle,
): Promise<{ short_url: string }> {
  const { data, error } = await client.functions.invoke('razorpay-create-subscription', {
    body: { org_id: orgId, billing_tier_id: billingTierId, billing_cycle: billingCycle },
  });

  if (error) {
    let serverMessage: string | undefined;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        if (body && typeof body === 'object' && typeof body.error === 'string') {
          serverMessage = body.error;
        }
      }
    } catch {
      // ignore — fall back to generic mapping
    }
    if (serverMessage) {
      throw new DomainError('validation_failed', humanizeError(serverMessage));
    }
    throw mapSupabaseError(error);
  }

  if (data?.error) {
    throw new DomainError('validation_failed', humanizeError(data.error));
  }
  if (!data?.short_url) {
    throw new DomainError('unknown', 'Subscription creation returned no checkout link');
  }
  return { short_url: data.short_url as string };
}

/**
 * Cancel an org's active Razorpay subscription. Calls Razorpay's API then
 * sets billing_status='cancelled' via the existing Phase 3 license RPC.
 */
export async function cancelSubscription(client: Client, orgId: string): Promise<void> {
  const { data, error } = await client.functions.invoke('razorpay-cancel-subscription', {
    body: { org_id: orgId },
  });

  if (error) {
    let serverMessage: string | undefined;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        if (body && typeof body === 'object' && typeof body.error === 'string') {
          serverMessage = body.error;
        }
      }
    } catch {
      // ignore — fall back to generic mapping
    }
    if (serverMessage) {
      throw new DomainError('validation_failed', humanizeError(serverMessage));
    }
    throw mapSupabaseError(error);
  }

  if (data?.error) {
    throw new DomainError('validation_failed', humanizeError(data.error));
  }
}

export interface IntegrationsStatus {
  razorpay_configured: boolean;
  razorpay_webhook_configured: boolean;
}

/**
 * Read-only status check for Settings → Integrations — never returns actual
 * secret values, just whether they're set (CLI-managed via `supabase secrets
 * set`, never stored in the DB or browser).
 */
export async function getIntegrationsStatus(client: Client): Promise<IntegrationsStatus> {
  const { data, error } = await client.functions.invoke('console-settings-status', { body: {} });

  if (error) {
    let serverMessage: string | undefined;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        if (body && typeof body === 'object' && typeof body.error === 'string') {
          serverMessage = body.error;
        }
      }
    } catch {
      // ignore — fall back to generic mapping
    }
    if (serverMessage) {
      throw new DomainError('validation_failed', humanizeError(serverMessage));
    }
    throw mapSupabaseError(error);
  }

  if (data?.error) {
    throw new DomainError('validation_failed', humanizeError(data.error));
  }
  return data as IntegrationsStatus;
}
