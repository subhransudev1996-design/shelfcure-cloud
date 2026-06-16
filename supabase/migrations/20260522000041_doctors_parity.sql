-- §2.8 Doctors parity
-- Extends rpc_list_doctors / rpc_create_doctor with commission fields.
-- Adds rpc_update_doctor, rpc_get_doctor_detail, rpc_get_doctor_sales,
--      rpc_record_doctor_commission_payout, rpc_get_doctor_commission_payouts.

-- ─────────────────────────────────────────────────────────────────────────────
-- rpc_list_doctors — now returns commission + clinic_address + supports
--                    p_include_inactive flag
-- Return signature changed → DROP + CREATE
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.rpc_list_doctors(uuid);

create function public.rpc_list_doctors(
  p_store_id        uuid    default null,
  p_include_inactive boolean default false
)
returns table (
  id                uuid,
  name              text,
  specialization    text,
  phone             text,
  clinic_name       text,
  clinic_address    text,
  commission_type   text,
  commission_rate   numeric,
  is_active         boolean
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
  select
    d.id, d.name, d.specialization, d.phone,
    d.clinic_name, d.clinic_address,
    d.commission_type, d.commission_rate,
    d.is_active
  from public.doctors d
  where d.org_id = v_org
    and d.deleted_at is null
    and (p_include_inactive or d.is_active)
    and (p_store_id is null or d.store_id is null or d.store_id = p_store_id)
  order by d.name asc;
end;
$$;

revoke all on function public.rpc_list_doctors(uuid, boolean) from public;
grant execute on function public.rpc_list_doctors(uuid, boolean) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- rpc_create_doctor — extend to accept commission_type / commission_rate
-- Return signature changed → DROP + CREATE
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.rpc_create_doctor(jsonb);

create function public.rpc_create_doctor(p_payload jsonb)
returns table (
  id                uuid,
  name              text,
  specialization    text,
  phone             text,
  clinic_name       text,
  clinic_address    text,
  commission_type   text,
  commission_rate   numeric,
  is_active         boolean
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
  v_comm_type text;
  v_new_id   uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null then raise exception 'profile_missing' using errcode = '42501'; end if;
  if v_role not in ('super_admin','store_admin','pharmacist') then
    raise exception 'permission_denied: cannot create doctors' using errcode = '42501';
  end if;

  v_store_id  := nullif(p_payload->>'store_id','')::uuid;
  v_comm_type := coalesce(nullif(p_payload->>'commission_type',''), 'percentage');

  if v_store_id is not null and not exists (
    select 1 from public.stores s where s.id = v_store_id and s.org_id = v_org
  ) then
    raise exception 'invalid_store_id' using errcode = '23503';
  end if;

  if v_comm_type not in ('percentage','fixed') then
    v_comm_type := 'percentage';
  end if;

  insert into public.doctors (
    org_id, store_id, name, specialization, phone,
    clinic_name, clinic_address, commission_type, commission_rate
  )
  values (
    v_org, v_store_id,
    trim(p_payload->>'name'),
    nullif(trim(coalesce(p_payload->>'specialization','')),''),
    nullif(trim(coalesce(p_payload->>'phone','')),''),
    nullif(trim(coalesce(p_payload->>'clinic_name','')),''),
    nullif(trim(coalesce(p_payload->>'clinic_address','')),''),
    v_comm_type,
    coalesce((p_payload->>'commission_rate')::numeric, 0)
  )
  returning doctors.id into v_new_id;

  return query
  select d.id, d.name, d.specialization, d.phone,
         d.clinic_name, d.clinic_address,
         d.commission_type, d.commission_rate, d.is_active
  from public.doctors d where d.id = v_new_id;
end;
$$;

revoke all on function public.rpc_create_doctor(jsonb) from public;
grant execute on function public.rpc_create_doctor(jsonb) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- rpc_update_doctor — edit name/specialization/phone/clinic/commission/is_active
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.rpc_update_doctor(
  p_doctor_id uuid,
  p_payload   jsonb
)
returns table (
  id                uuid,
  name              text,
  specialization    text,
  phone             text,
  clinic_name       text,
  clinic_address    text,
  commission_type   text,
  commission_rate   numeric,
  is_active         boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_org  uuid := public.current_org();
  v_role text := public.user_role();
  v_comm_type text;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null then raise exception 'profile_missing' using errcode = '42501'; end if;
  if v_role not in ('super_admin','store_admin','pharmacist') then
    raise exception 'permission_denied: cannot update doctors' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.doctors d
    where d.id = p_doctor_id and d.org_id = v_org and d.deleted_at is null
  ) then
    raise exception 'not_found' using errcode = '42704';
  end if;

  v_comm_type := coalesce(nullif(p_payload->>'commission_type',''), 'percentage');
  if v_comm_type not in ('percentage','fixed') then v_comm_type := 'percentage'; end if;

  update public.doctors set
    name             = coalesce(nullif(trim(p_payload->>'name'),''), name),
    specialization   = nullif(trim(coalesce(p_payload->>'specialization', '')), ''),
    phone            = nullif(trim(coalesce(p_payload->>'phone', '')), ''),
    clinic_name      = nullif(trim(coalesce(p_payload->>'clinic_name', '')), ''),
    clinic_address   = nullif(trim(coalesce(p_payload->>'clinic_address', '')), ''),
    commission_type  = v_comm_type,
    commission_rate  = coalesce((p_payload->>'commission_rate')::numeric, commission_rate),
    is_active        = coalesce((p_payload->>'is_active')::boolean, is_active),
    updated_at       = now()
  where id = p_doctor_id;

  return query
  select d.id, d.name, d.specialization, d.phone,
         d.clinic_name, d.clinic_address,
         d.commission_type, d.commission_rate, d.is_active
  from public.doctors d where d.id = p_doctor_id;
end;
$$;

revoke all on function public.rpc_update_doctor(uuid, jsonb) from public;
grant execute on function public.rpc_update_doctor(uuid, jsonb) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- rpc_get_doctor_detail — doctor row + lifetime stats + live commission math
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.rpc_get_doctor_detail(p_doctor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_org    uuid := public.current_org();
  v_doctor record;
  v_stats  record;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null then raise exception 'profile_missing' using errcode = '42501'; end if;

  select d.id, d.name, d.specialization, d.phone,
         d.clinic_name, d.clinic_address,
         d.commission_type, d.commission_rate, d.is_active
  into v_doctor
  from public.doctors d
  where d.id = p_doctor_id and d.org_id = v_org and d.deleted_at is null;

  if not found then raise exception 'not_found' using errcode = '42704'; end if;

  select
    count(s.id)::integer                                     as referred_sales_count,
    coalesce(sum(s.total_amount), 0)                         as total_revenue,
    coalesce(
      case v_doctor.commission_type
        when 'percentage' then sum(s.total_amount) * v_doctor.commission_rate / 100
        when 'fixed'      then count(s.id) * v_doctor.commission_rate
        else 0
      end
    , 0)                                                      as commission_earned,
    coalesce((
      select sum(p.amount)
      from public.doctor_commission_payouts p
      where p.doctor_id = p_doctor_id and p.deleted_at is null
    ), 0)                                                     as commission_paid
  into v_stats
  from public.sales s
  where s.doctor_id = p_doctor_id
    and s.deleted_at is null
    and s.is_void = false;

  return jsonb_build_object(
    'doctor', jsonb_build_object(
      'id',               v_doctor.id,
      'name',             v_doctor.name,
      'specialization',   v_doctor.specialization,
      'phone',            v_doctor.phone,
      'clinic_name',      v_doctor.clinic_name,
      'clinic_address',   v_doctor.clinic_address,
      'commission_type',  v_doctor.commission_type,
      'commission_rate',  v_doctor.commission_rate,
      'is_active',        v_doctor.is_active
    ),
    'stats', jsonb_build_object(
      'referred_sales_count',  v_stats.referred_sales_count,
      'total_revenue',         v_stats.total_revenue,
      'commission_earned',     v_stats.commission_earned,
      'commission_paid',       v_stats.commission_paid,
      'commission_balance',    v_stats.commission_earned - v_stats.commission_paid
    )
  );
end;
$$;

revoke all on function public.rpc_get_doctor_detail(uuid) from public;
grant execute on function public.rpc_get_doctor_detail(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- rpc_get_doctor_sales — date-range filtered referred-sales with per-bill commission
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.rpc_get_doctor_sales(
  p_doctor_id uuid,
  p_from      date    default null,
  p_to        date    default null,
  p_limit     integer default 100,
  p_offset    integer default 0
)
returns table (
  sale_id           uuid,
  bill_number       text,
  bill_date         date,
  customer_name     text,
  total_amount      numeric,
  commission_amount numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_org           uuid := public.current_org();
  v_comm_type     text;
  v_comm_rate     numeric;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null then raise exception 'profile_missing' using errcode = '42501'; end if;

  select d.commission_type, d.commission_rate
  into v_comm_type, v_comm_rate
  from public.doctors d
  where d.id = p_doctor_id and d.org_id = v_org and d.deleted_at is null;

  if not found then raise exception 'not_found' using errcode = '42704'; end if;

  return query
  select
    s.id,
    s.bill_number,
    s.bill_date::date,
    coalesce(c.name, 'Walk-in'),
    s.total_amount,
    case v_comm_type
      when 'percentage' then round(s.total_amount * v_comm_rate / 100, 2)
      when 'fixed'      then v_comm_rate
      else 0::numeric
    end
  from public.sales s
  left join public.customers c on c.id = s.customer_id
  where s.doctor_id = p_doctor_id
    and s.deleted_at is null
    and s.is_void = false
    and (p_from is null or s.bill_date >= p_from)
    and (p_to   is null or s.bill_date <= p_to)
  order by s.bill_date desc, s.id desc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.rpc_get_doctor_sales(uuid, date, date, integer, integer) from public;
grant execute on function public.rpc_get_doctor_sales(uuid, date, date, integer, integer) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- rpc_record_doctor_commission_payout
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.rpc_record_doctor_commission_payout(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_org       uuid := public.current_org();
  v_role      text := public.user_role();
  v_store_id  uuid;
  v_doctor_id uuid;
  v_new_id    uuid;
  v_earned    numeric;
  v_paid      numeric;
  v_comm_type text;
  v_comm_rate numeric;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null then raise exception 'profile_missing' using errcode = '42501'; end if;
  if v_role not in ('super_admin','store_admin') then
    raise exception 'permission_denied: cannot record commission payouts' using errcode = '42501';
  end if;

  v_doctor_id := (p_payload->>'doctor_id')::uuid;

  select d.store_id, d.commission_type, d.commission_rate
  into v_store_id, v_comm_type, v_comm_rate
  from public.doctors d
  where d.id = v_doctor_id and d.org_id = v_org and d.deleted_at is null;

  if not found then raise exception 'not_found' using errcode = '42704'; end if;

  insert into public.doctor_commission_payouts (
    org_id, store_id, doctor_id, amount, notes, paid_at, paid_by
  ) values (
    v_org,
    v_store_id,
    v_doctor_id,
    (p_payload->>'amount')::numeric,
    nullif(trim(coalesce(p_payload->>'notes','')), ''),
    coalesce(nullif(p_payload->>'paid_at','')::timestamptz, now()),
    auth.uid()
  )
  returning id into v_new_id;

  -- Recompute balance after payout
  select
    coalesce(
      case v_comm_type
        when 'percentage' then sum(s.total_amount) * v_comm_rate / 100
        when 'fixed'      then count(s.id) * v_comm_rate
        else 0
      end
    , 0)
  into v_earned
  from public.sales s
  where s.doctor_id = v_doctor_id and s.deleted_at is null and s.is_void = false;

  select coalesce(sum(p.amount), 0)
  into v_paid
  from public.doctor_commission_payouts p
  where p.doctor_id = v_doctor_id and p.deleted_at is null;

  return jsonb_build_object(
    'id',                  v_new_id,
    'amount',              (p_payload->>'amount')::numeric,
    'paid_at',             now(),
    'commission_earned',   v_earned,
    'commission_paid',     v_paid,
    'commission_balance',  v_earned - v_paid
  );
end;
$$;

revoke all on function public.rpc_record_doctor_commission_payout(jsonb) from public;
grant execute on function public.rpc_record_doctor_commission_payout(jsonb) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- rpc_get_doctor_commission_payouts
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.rpc_get_doctor_commission_payouts(
  p_doctor_id uuid,
  p_limit     integer default 50
)
returns table (
  id            uuid,
  amount        numeric,
  notes         text,
  paid_at       timestamptz,
  paid_by_name  text,
  created_at    timestamptz
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
  select
    p.id,
    p.amount,
    p.notes,
    p.paid_at,
    coalesce(up.full_name, 'Unknown'),
    p.created_at
  from public.doctor_commission_payouts p
  left join public.user_profiles up on up.id = p.paid_by
  where p.doctor_id = p_doctor_id
    and p.deleted_at is null
    and exists (
      select 1 from public.doctors d
      where d.id = p_doctor_id and d.org_id = v_org
    )
  order by p.paid_at desc, p.id desc
  limit p_limit;
end;
$$;

revoke all on function public.rpc_get_doctor_commission_payouts(uuid, integer) from public;
grant execute on function public.rpc_get_doctor_commission_payouts(uuid, integer) to authenticated;
