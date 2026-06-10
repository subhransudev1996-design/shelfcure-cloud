-- ShelfCure Cloud — Migration 0019
-- Stock listing + adjustment context, and doctors master CRUD.
-- Same SECURITY DEFINER + #variable_conflict use_column pattern.

-- ============================================================================
-- rpc_list_stock_batches — current on-hand by batch, FEFO within each medicine
-- Used by /dashboard/stock for damage / loss / expiry adjustments.
-- ============================================================================

create or replace function public.rpc_list_stock_batches(
  p_store_id uuid,
  p_query    text default null,
  p_limit    integer default 100,
  p_offset   integer default 0
)
returns table (
  batch_id        uuid,
  medicine_id     uuid,
  medicine_name   text,
  manufacturer    text,
  batch_number    text,
  expiry_date     date,
  on_hand         integer,
  mrp             numeric,
  purchase_rate   numeric,
  gst_percentage  numeric,
  days_to_expiry  integer,
  is_blocked      boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_lim integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_off integer := greatest(0, coalesce(p_offset, 0));
  v_q   text    := nullif(trim(coalesce(p_query, '')), '');
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  return query
  select
    b.id, b.medicine_id, m.name, m.manufacturer,
    b.batch_number, b.expiry_date,
    b.current_quantity::integer,
    b.mrp, b.purchase_rate, b.gst_percentage,
    (b.expiry_date - current_date)::integer,
    b.is_blocked
  from public.batches b
  join public.medicines m on m.id = b.medicine_id
  where b.store_id = p_store_id
    and b.deleted_at is null
    and (v_q is null or m.name ilike '%' || v_q || '%' or b.batch_number ilike '%' || v_q || '%')
  order by b.expiry_date asc, m.name asc
  limit v_lim offset v_off;
end;
$$;

revoke all on function public.rpc_list_stock_batches(uuid, text, integer, integer) from public;
grant execute on function public.rpc_list_stock_batches(uuid, text, integer, integer) to authenticated;


-- ============================================================================
-- Doctors master — list + create
-- ============================================================================

create or replace function public.rpc_list_doctors(p_store_id uuid default null)
returns table (
  id              uuid,
  name            text,
  specialization  text,
  phone           text,
  clinic_name     text,
  is_active       boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_org uuid := public.current_org();
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null then raise exception 'profile_missing' using errcode = '42501'; end if;

  return query
  select d.id, d.name, d.specialization, d.phone, d.clinic_name, d.is_active
  from public.doctors d
  where d.org_id = v_org
    and d.deleted_at is null
    and d.is_active
    and (p_store_id is null or d.store_id is null or d.store_id = p_store_id)
  order by d.name asc;
end;
$$;

revoke all on function public.rpc_list_doctors(uuid) from public;
grant execute on function public.rpc_list_doctors(uuid) to authenticated;


create or replace function public.rpc_create_doctor(p_payload jsonb)
returns table (
  id              uuid,
  name            text,
  specialization  text,
  phone           text,
  clinic_name     text,
  is_active       boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_org      uuid := public.current_org();
  v_role     text := public.user_role();
  v_store_id uuid;
  v_new_id   uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null then raise exception 'profile_missing' using errcode = '42501'; end if;
  if v_role not in ('super_admin','store_admin','pharmacist') then
    raise exception 'permission_denied: cannot create doctors' using errcode = '42501';
  end if;

  v_store_id := nullif(p_payload->>'store_id','')::uuid;
  if v_store_id is not null and not exists (
    select 1 from public.stores s where s.id = v_store_id and s.org_id = v_org
  ) then
    raise exception 'invalid_store_id' using errcode = '23503';
  end if;

  insert into public.doctors (
    org_id, store_id, name, specialization, phone, clinic_name, clinic_address
  )
  values (
    v_org, v_store_id,
    trim(p_payload->>'name'),
    nullif(trim(coalesce(p_payload->>'specialization','')),''),
    nullif(trim(coalesce(p_payload->>'phone','')),''),
    nullif(trim(coalesce(p_payload->>'clinic_name','')),''),
    nullif(trim(coalesce(p_payload->>'clinic_address','')),'')
  )
  returning doctors.id into v_new_id;

  return query
  select d.id, d.name, d.specialization, d.phone, d.clinic_name, d.is_active
  from public.doctors d where d.id = v_new_id;
end;
$$;

revoke all on function public.rpc_create_doctor(jsonb) from public;
grant execute on function public.rpc_create_doctor(jsonb) to authenticated;
