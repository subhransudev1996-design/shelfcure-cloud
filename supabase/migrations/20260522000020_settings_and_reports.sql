-- ShelfCure Cloud — Migration 0020
-- Settings update RPCs + lightweight reporting RPCs.

-- ============================================================================
-- rpc_update_org_settings — super_admin only
-- Only mutates the safe fields. Plan / billing / Razorpay IDs are never touched
-- here; those go through the billing pipeline.
-- ============================================================================

create or replace function public.rpc_update_org_settings(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org  uuid := public.current_org();
  v_role text := public.user_role();
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null then raise exception 'profile_missing' using errcode = '42501'; end if;
  if v_role <> 'super_admin' then
    raise exception 'permission_denied: only super_admin can change org settings' using errcode = '42501';
  end if;

  update public.organizations
  set
    name                   = coalesce(nullif(trim(p_payload->>'name'),''), name),
    legal_name             = coalesce(p_payload->>'legal_name', legal_name),
    gstin_default          = case
                               when p_payload ? 'gstin_default'
                                 then nullif(trim(p_payload->>'gstin_default'),'')
                               else gstin_default
                             end,
    shared_masters_enabled = case
                               when p_payload ? 'shared_masters_enabled'
                                 then (p_payload->>'shared_masters_enabled')::boolean
                               else shared_masters_enabled
                             end
  where id = v_org;

  return to_jsonb(o.*) from public.organizations o where o.id = v_org;
end;
$$;

revoke all on function public.rpc_update_org_settings(jsonb) from public;
grant execute on function public.rpc_update_org_settings(jsonb) to authenticated;


-- ============================================================================
-- rpc_update_store_settings — super_admin or the store_admin of that store
-- ============================================================================

create or replace function public.rpc_update_store_settings(
  p_store_id uuid,
  p_payload  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org           uuid := public.current_org();
  v_role          text := public.user_role();
  v_caller_store  uuid := public.current_store();
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null then raise exception 'profile_missing' using errcode = '42501'; end if;

  if v_role = 'super_admin' then
    -- ok
  elsif v_role = 'store_admin' and v_caller_store = p_store_id then
    -- ok
  else
    raise exception 'permission_denied: cannot edit this store' using errcode = '42501';
  end if;

  if not exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org) then
    raise exception 'invalid_store_id' using errcode = '23503';
  end if;

  update public.stores
  set
    name            = coalesce(nullif(trim(p_payload->>'name'),''), name),
    gstin           = case when p_payload ? 'gstin'
                        then nullif(trim(p_payload->>'gstin'),'')
                        else gstin end,
    drug_license_no = case when p_payload ? 'drug_license_no'
                        then nullif(trim(p_payload->>'drug_license_no'),'')
                        else drug_license_no end,
    address         = coalesce(p_payload->>'address', address),
    city            = coalesce(p_payload->>'city', city),
    state           = coalesce(p_payload->>'state', state),
    pincode         = coalesce(p_payload->>'pincode', pincode),
    phone           = coalesce(p_payload->>'phone', phone),
    email           = coalesce(p_payload->>'email', email),
    owner_name      = coalesce(p_payload->>'owner_name', owner_name),
    gst_scheme      = coalesce(p_payload->>'gst_scheme', gst_scheme),
    gst_filing_type = coalesce(p_payload->>'gst_filing_type', gst_filing_type),
    idle_lock_minutes = case when p_payload ? 'idle_lock_minutes'
                          then (p_payload->>'idle_lock_minutes')::integer
                          else idle_lock_minutes end,
    is_active       = case when p_payload ? 'is_active'
                          then (p_payload->>'is_active')::boolean
                          else is_active end
  where id = p_store_id;

  return to_jsonb(s.*) from public.stores s where s.id = p_store_id;
end;
$$;

revoke all on function public.rpc_update_store_settings(uuid, jsonb) from public;
grant execute on function public.rpc_update_store_settings(uuid, jsonb) to authenticated;


-- ============================================================================
-- rpc_update_my_profile — any user can update their own name/phone
-- ============================================================================

create or replace function public.rpc_update_my_profile(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  update public.user_profiles
  set
    full_name = coalesce(nullif(trim(p_payload->>'full_name'),''), full_name),
    phone     = case when p_payload ? 'phone'
                  then nullif(trim(p_payload->>'phone'),'')
                  else phone end
  where id = v_uid;

  return to_jsonb(up.*) from public.user_profiles up where up.id = v_uid;
end;
$$;

revoke all on function public.rpc_update_my_profile(jsonb) from public;
grant execute on function public.rpc_update_my_profile(jsonb) to authenticated;


-- ============================================================================
-- Reports
-- ============================================================================

-- rpc_report_sales_trend — daily totals for the last N days, including zero days.
create or replace function public.rpc_report_sales_trend(
  p_store_id uuid,
  p_days     integer default 30
)
returns table (
  day          date,
  bill_count   integer,
  total_amount numeric,
  gst_amount   numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_d integer := greatest(1, least(coalesce(p_days, 30), 180));
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  return query
  with span as (
    select (current_date - (n || ' days')::interval)::date as d
    from generate_series(0, v_d - 1) as n
  )
  select
    s.d,
    coalesce(agg.cnt, 0)::integer,
    coalesce(agg.total, 0)::numeric,
    coalesce(agg.gst, 0)::numeric
  from span s
  left join (
    select bill_date, count(*) cnt,
           sum(total_amount) total,
           sum(gst_amount) gst
    from public.sales
    where store_id = p_store_id
      and deleted_at is null
      and bill_date >= (current_date - (v_d - 1))
    group by bill_date
  ) agg on agg.bill_date = s.d
  order by s.d asc;
end;
$$;

revoke all on function public.rpc_report_sales_trend(uuid, integer) from public;
grant execute on function public.rpc_report_sales_trend(uuid, integer) to authenticated;


-- rpc_report_top_medicines — top sellers by quantity and revenue.
create or replace function public.rpc_report_top_medicines(
  p_store_id uuid,
  p_days     integer default 30,
  p_limit    integer default 10
)
returns table (
  medicine_id    uuid,
  name           text,
  manufacturer   text,
  qty_sold       integer,
  revenue        numeric,
  bills          integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_d  integer := greatest(1, least(coalesce(p_days, 30), 365));
  v_n  integer := greatest(1, least(coalesce(p_limit, 10), 50));
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  return query
  select
    m.id,
    m.name,
    m.manufacturer,
    sum(si.quantity)::integer,
    sum(si.amount)::numeric,
    count(distinct si.sale_id)::integer
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  join public.medicines m on m.id = si.medicine_id
  where s.store_id = p_store_id
    and s.deleted_at is null
    and s.bill_date >= (current_date - (v_d - 1))
    and si.medicine_id is not null
  group by m.id, m.name, m.manufacturer
  order by sum(si.amount) desc nulls last
  limit v_n;
end;
$$;

revoke all on function public.rpc_report_top_medicines(uuid, integer, integer) from public;
grant execute on function public.rpc_report_top_medicines(uuid, integer, integer) to authenticated;


-- rpc_report_gst_summary — grouped by GST rate slab for a date range.
create or replace function public.rpc_report_gst_summary(
  p_store_id uuid,
  p_from     date default null,
  p_to       date default null
)
returns table (
  gst_rate       numeric,
  taxable_amount numeric,
  cgst_amount    numeric,
  sgst_amount    numeric,
  igst_amount    numeric,
  total_amount   numeric,
  line_count     integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_from date := coalesce(p_from, date_trunc('month', current_date)::date);
  v_to   date := coalesce(p_to, current_date);
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  return query
  select
    si.gst_percentage::numeric,
    sum(si.taxable_amount)::numeric,
    sum(si.cgst_amount)::numeric,
    sum(si.sgst_amount)::numeric,
    sum(si.igst_amount)::numeric,
    sum(si.amount)::numeric,
    count(*)::integer
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where s.store_id = p_store_id
    and s.deleted_at is null
    and s.bill_date between v_from and v_to
  group by si.gst_percentage
  order by si.gst_percentage asc;
end;
$$;

revoke all on function public.rpc_report_gst_summary(uuid, date, date) from public;
grant execute on function public.rpc_report_gst_summary(uuid, date, date) to authenticated;
