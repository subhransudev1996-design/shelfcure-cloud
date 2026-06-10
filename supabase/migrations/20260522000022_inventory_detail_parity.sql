-- ShelfCure Cloud — Migration 0022
-- Medicine-detail-page parity bumps for §2.5.8:
--   1. rpc_get_medicine_detail now returns supplier_id per batch (for Reorder
--      button visibility + future deep-links) and includes units_per_pack on
--      brand alternatives (so flexible-mode MRP display matches desktop).
--   2. rpc_add_batch_manual accepts an optional supplier_id.
--   3. rpc_update_batch accepts supplier_id.

create or replace function public.rpc_get_medicine_detail(
  p_medicine_id uuid,
  p_store_id    uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid := public.current_org();
  v_med jsonb;
  v_batches jsonb;
  v_stats jsonb;
  v_alts jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  select to_jsonb(m) || jsonb_build_object(
    'dosage_form_name', d.name,
    'dosage_form_base_unit', d.base_unit,
    'category_name', c.name
  )
  into v_med
  from public.medicines m
  left join public.dosage_forms d on d.id = m.dosage_form_id
  left join public.medicine_categories c on c.id = m.category_id
  where m.id = p_medicine_id
    and m.org_id = v_org
    and m.deleted_at is null;

  if v_med is null then raise exception 'medicine_not_found' using errcode = 'P0002'; end if;

  select coalesce(jsonb_agg(to_jsonb(b) || jsonb_build_object(
    'days_to_expiry', (b.expiry_date - current_date)::integer,
    'supplier_name', sup.name,
    'supplier_id',   sup.id
  ) order by b.expiry_date asc), '[]'::jsonb)
  into v_batches
  from public.batches b
  left join public.suppliers sup on sup.id = b.supplier_id
  where b.medicine_id = p_medicine_id
    and b.store_id = p_store_id
    and b.deleted_at is null;

  select jsonb_build_object(
    'total_stock',        coalesce(sum(current_quantity), 0),
    'active_batches',     count(*) filter (where current_quantity > 0),
    'near_expiry_count',  count(*) filter (where current_quantity > 0 and (expiry_date - current_date) <= 90),
    'min_stock_level',    (v_med->>'min_stock_level')::integer
  )
  into v_stats
  from public.batches
  where medicine_id = p_medicine_id
    and store_id = p_store_id
    and deleted_at is null;

  with alt_med as (
    select m.id, m.name, m.manufacturer, m.strength,
           m.sale_unit_mode, m.units_per_pack, df.name as dosage_form_name,
           coalesce(sum(b.current_quantity), 0) as stock,
           max(b.mrp) as mrp,
           min(b.selling_price) as selling_price
    from public.medicines m
    left join public.dosage_forms df on df.id = m.dosage_form_id
    left join public.batches b
      on b.medicine_id = m.id
     and b.store_id = p_store_id
     and b.deleted_at is null
     and b.current_quantity > 0
    where m.org_id = v_org
      and m.deleted_at is null
      and m.id <> p_medicine_id
      and coalesce(nullif(trim(m.salt_composition), ''), '__none__')
          = coalesce(nullif(trim(v_med->>'salt_composition'), ''), '__never__')
    group by m.id, m.name, m.manufacturer, m.strength,
             m.sale_unit_mode, m.units_per_pack, df.name
    order by stock desc, m.name asc
    limit 10
  )
  select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into v_alts from alt_med a;

  return jsonb_build_object(
    'medicine',     v_med,
    'batches',      v_batches,
    'stats',        v_stats,
    'alternatives', v_alts
  );
end;
$$;

revoke all on function public.rpc_get_medicine_detail(uuid, uuid) from public;
grant execute on function public.rpc_get_medicine_detail(uuid, uuid) to authenticated;

-- ============================================================================
-- rpc_add_batch_manual — now accepts supplier_id (uuid, optional)
-- ============================================================================

create or replace function public.rpc_add_batch_manual(
  p_medicine_id uuid,
  p_store_id    uuid,
  p_payload     jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org      uuid := public.current_org();
  v_role     text := public.user_role();
  v_new_id   uuid;
  v_qty      integer;
  v_supplier uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;
  if v_role not in ('super_admin','store_admin','pharmacist') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.medicines m
    where m.id = p_medicine_id and m.org_id = v_org and m.deleted_at is null
  ) then
    raise exception 'medicine_not_found' using errcode = 'P0002'; end if;

  v_qty := coalesce(nullif(p_payload->>'quantity','')::integer, 0);
  if v_qty < 0 then raise exception 'invalid_quantity' using errcode = '22023'; end if;

  v_supplier := nullif(p_payload->>'supplier_id', '')::uuid;
  if v_supplier is not null and not exists (
    select 1 from public.suppliers s
    where s.id = v_supplier and s.org_id = v_org and s.deleted_at is null
  ) then
    raise exception 'invalid_supplier_id' using errcode = '23503'; end if;

  insert into public.batches (
    org_id, store_id, medicine_id, supplier_id,
    batch_number, expiry_date,
    initial_quantity, current_quantity, purchase_rate, mrp, selling_price,
    gst_percentage, batch_barcode
  )
  values (
    v_org, p_store_id, p_medicine_id, v_supplier,
    nullif(trim(coalesce(p_payload->>'batch_number','')), ''),
    nullif(p_payload->>'expiry_date','')::date,
    v_qty, v_qty,
    coalesce(nullif(p_payload->>'purchase_rate','')::numeric, 0),
    coalesce(nullif(p_payload->>'mrp','')::numeric, 0),
    nullif(p_payload->>'selling_price','')::numeric,
    coalesce(nullif(p_payload->>'gst_percentage','')::numeric, 0),
    nullif(trim(coalesce(p_payload->>'batch_barcode','')), '')
  )
  returning id into v_new_id;

  return (select to_jsonb(b) from public.batches b where b.id = v_new_id);
end;
$$;

revoke all on function public.rpc_add_batch_manual(uuid, uuid, jsonb) from public;
grant execute on function public.rpc_add_batch_manual(uuid, uuid, jsonb) to authenticated;

-- ============================================================================
-- rpc_update_batch — now accepts supplier_id (re-assignable)
-- ============================================================================

create or replace function public.rpc_update_batch(
  p_batch_id uuid,
  p_payload  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org   uuid := public.current_org();
  v_role  text := public.user_role();
  v_store uuid;
  v_sup   uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_role not in ('super_admin','store_admin','pharmacist') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select store_id into v_store from public.batches where id = p_batch_id and deleted_at is null;
  if v_store is null then raise exception 'batch_not_found' using errcode = 'P0002'; end if;
  if not public.user_has_store_access(v_store) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  if p_payload ? 'supplier_id' then
    v_sup := nullif(p_payload->>'supplier_id', '')::uuid;
    if v_sup is not null and not exists (
      select 1 from public.suppliers s
      where s.id = v_sup and s.org_id = v_org and s.deleted_at is null
    ) then
      raise exception 'invalid_supplier_id' using errcode = '23503';
    end if;
  end if;

  update public.batches b
  set
    batch_number   = coalesce(nullif(trim(p_payload->>'batch_number'),''), b.batch_number),
    expiry_date    = coalesce(nullif(p_payload->>'expiry_date','')::date, b.expiry_date),
    purchase_rate  = coalesce(nullif(p_payload->>'purchase_rate','')::numeric, b.purchase_rate),
    mrp            = coalesce(nullif(p_payload->>'mrp','')::numeric, b.mrp),
    selling_price  = case when p_payload ? 'selling_price'
                          then nullif(p_payload->>'selling_price','')::numeric
                          else b.selling_price end,
    gst_percentage = coalesce(nullif(p_payload->>'gst_percentage','')::numeric, b.gst_percentage),
    batch_barcode  = case when p_payload ? 'batch_barcode'
                          then nullif(trim(coalesce(p_payload->>'batch_barcode','')),'')
                          else b.batch_barcode end,
    supplier_id    = case when p_payload ? 'supplier_id' then v_sup else b.supplier_id end
  where b.id = p_batch_id;

  return (select to_jsonb(b) from public.batches b where b.id = p_batch_id);
end;
$$;

revoke all on function public.rpc_update_batch(uuid, jsonb) from public;
grant execute on function public.rpc_update_batch(uuid, jsonb) to authenticated;
