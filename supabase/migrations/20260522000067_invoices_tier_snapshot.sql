-- ShelfCure Cloud — Migration 0067
-- rpc_console_list_org_invoices was never updated to return the
-- billing_tier_id/tier_name_snapshot columns added in migration 0064 —
-- surfaced while live-testing the Console Invoices table. Return-shape
-- change needs drop+create (same pattern as migration 0063's other RPCs).

drop function if exists public.rpc_console_list_org_invoices(uuid);

create function public.rpc_console_list_org_invoices(p_org_id uuid)
returns table (
  id                    uuid,
  razorpay_payment_id   text,
  payment_method        text,
  billing_cycle         text,
  billing_tier_id       uuid,
  tier_name_snapshot    text,
  amount_subtotal_paise integer,
  gst_paise             integer,
  total_paise           integer,
  status                text,
  notes                 text,
  recorded_by_name      text,
  created_at            timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'permission_denied: platform admin only' using errcode = '42501';
  end if;

  return query
    select bi.id, bi.razorpay_payment_id, bi.payment_method, bi.billing_cycle,
           bi.billing_tier_id, bi.tier_name_snapshot,
           bi.amount_subtotal_paise, bi.gst_paise, bi.total_paise, bi.status,
           bi.notes, pa.full_name, bi.created_at
    from public.billing_invoices bi
    left join public.platform_admins pa on pa.id = bi.recorded_by
    where bi.org_id = p_org_id
    order by bi.created_at desc;
end;
$$;

comment on function public.rpc_console_list_org_invoices(uuid) is
  'Platform-admin-only: invoice history for an org, including the dynamic tier snapshot at time of payment.';

revoke all on function public.rpc_console_list_org_invoices(uuid) from public;
grant execute on function public.rpc_console_list_org_invoices(uuid) to authenticated;
