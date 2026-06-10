-- ShelfCure Cloud — Migration 0025
-- POS Phase C (Quick Access + Reorder Last Bill + Favorites toggle).
--   1. rpc_pos_toggle_favourite — flips medicines.is_favourite for the org master.
--   2. rpc_pos_quick_access     — single roundtrip returning multiple categorized
--      medicine lists (favorites / focused / high-margin / fast-moving / etc).
--   3. rpc_pos_recent_bill_items — last bill's items for a customer (Reorder Last Bill).

-- ============================================================================
-- 1. rpc_pos_toggle_favourite
-- ============================================================================

create or replace function public.rpc_pos_toggle_favourite(
  p_medicine_id uuid,
  p_value       boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org  uuid := public.current_org();
  v_role text := public.user_role();
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_role not in ('super_admin','store_admin','pharmacist','cashier') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  update public.medicines
  set is_favourite = p_value
  where id = p_medicine_id and org_id = v_org and deleted_at is null;
  if not found then raise exception 'medicine_not_found' using errcode = 'P0002'; end if;
  return p_value;
end;
$$;

revoke all on function public.rpc_pos_toggle_favourite(uuid, boolean) from public;
grant execute on function public.rpc_pos_toggle_favourite(uuid, boolean) to authenticated;

-- ============================================================================
-- 2. rpc_pos_quick_access — categorized chip strips for the POS screen.
-- Returns JSON shape:
--   {
--     favorites: [tile, ...], focused: [...], high_margin: [...],
--     fast_moving_7d: [...], fast_moving_30d: [...],
--     near_expiry: [...], overstock: [...],
--     frequently_bought: [...], customer_medicines: [...]
--   }
-- Each `tile` row shape matches PosSearchResult so addLine() is a 1-line wire.
-- Customer-specific sections are empty arrays when p_customer_id is null.
-- ============================================================================

create or replace function public.rpc_pos_quick_access(
  p_store_id        uuid,
  p_customer_id     uuid default null,
  p_limit_per       integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_org uuid := public.current_org();
  v_lim integer := greatest(1, least(coalesce(p_limit_per, 12), 30));
  v_result jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  -- Materialize each medicine + its nearest-expiry batch in one CTE so every
  -- category section can project the PosSearchResult shape cheaply.
  with med_with_batch as (
      select
        m.id            as medicine_id,
        m.name, m.manufacturer, m.pack_size, m.pack_unit, m.hsn_code,
        m.default_gst_rate, m.is_favourite, m.is_focused, m.focus_label,
        m.reorder_level, m.created_at,
        bb.batch_id, bb.batch_number, bb.expiry_date,
        bb.mrp, bb.selling_price, bb.purchase_rate, bb.gst_percentage,
        coalesce(bb.current_quantity, 0) as current_quantity
      from public.medicines m
      left join lateral (
        select b.id as batch_id, b.batch_number, b.expiry_date, b.mrp, b.selling_price,
               b.purchase_rate, b.gst_percentage, b.current_quantity
        from public.batches b
        where b.medicine_id = m.id
          and b.store_id = p_store_id
          and b.deleted_at is null
          and b.is_blocked = false
          and b.current_quantity > 0
          and b.expiry_date >= current_date
        order by b.expiry_date asc, b.created_at asc
        limit 1
      ) bb on true
      where m.org_id = v_org
        and m.deleted_at is null
        and (m.store_id is null or m.store_id = p_store_id)
    ),
    fast_7 as (
      select si.medicine_id, sum(si.quantity)::numeric as qty
      from public.sale_items si
      join public.sales s on s.id = si.sale_id
      where s.store_id = p_store_id
        and s.deleted_at is null
        and s.created_at >= now() - interval '7 days'
        and si.medicine_id is not null
      group by si.medicine_id
      order by sum(si.quantity) desc
      limit v_lim
    ),
    fast_30 as (
      select si.medicine_id, sum(si.quantity)::numeric as qty
      from public.sale_items si
      join public.sales s on s.id = si.sale_id
      where s.store_id = p_store_id
        and s.deleted_at is null
        and s.created_at >= now() - interval '30 days'
        and si.medicine_id is not null
      group by si.medicine_id
      order by sum(si.quantity) desc
      limit v_lim
    ),
    cust_freq_cte as (
      select si.medicine_id, count(distinct s.id) as bills, sum(si.quantity)::numeric as qty
      from public.sale_items si
      join public.sales s on s.id = si.sale_id
      where p_customer_id is not null
        and s.customer_id = p_customer_id
        and s.store_id = p_store_id
        and s.deleted_at is null
        and si.medicine_id is not null
      group by si.medicine_id
      order by count(distinct s.id) desc, sum(si.quantity) desc
      limit v_lim
    )
    select * from (select jsonb_build_object(
      'favorites',         coalesce((select jsonb_agg(to_jsonb(m)) from (
                              select * from med_with_batch where is_favourite order by name limit v_lim
                            ) m), '[]'::jsonb),
      'focused',           coalesce((select jsonb_agg(to_jsonb(m)) from (
                              select * from med_with_batch where is_focused order by name limit v_lim
                            ) m), '[]'::jsonb),
      'high_margin',       coalesce((select jsonb_agg(to_jsonb(m)) from (
                              select m.* from med_with_batch m
                              where m.mrp is not null and m.purchase_rate is not null and m.mrp > 0
                                and (m.mrp - m.purchase_rate) / m.mrp >= 0.30
                              order by ((m.mrp - m.purchase_rate) / m.mrp) desc, m.name
                              limit v_lim
                            ) m), '[]'::jsonb),
      'fast_moving_7d',    coalesce((select jsonb_agg(to_jsonb(m)) from (
                              select m.* from med_with_batch m
                              join fast_7 f on f.medicine_id = m.medicine_id
                              order by f.qty desc, m.name
                            ) m), '[]'::jsonb),
      'fast_moving_30d',   coalesce((select jsonb_agg(to_jsonb(m)) from (
                              select m.* from med_with_batch m
                              join fast_30 f on f.medicine_id = m.medicine_id
                              order by f.qty desc, m.name
                            ) m), '[]'::jsonb),
      'frequently_bought', coalesce((select jsonb_agg(to_jsonb(m)) from (
                              select m.* from med_with_batch m
                              join cust_freq_cte f on f.medicine_id = m.medicine_id
                              order by f.bills desc, f.qty desc, m.name
                            ) m), '[]'::jsonb),
      'customer_medicines', coalesce((select jsonb_agg(to_jsonb(m)) from (
                              select distinct m.* from med_with_batch m
                              join public.sale_items si on si.medicine_id = m.medicine_id
                              join public.sales s on s.id = si.sale_id
                              where p_customer_id is not null
                                and s.customer_id = p_customer_id
                                and s.store_id = p_store_id
                                and s.deleted_at is null
                              order by m.name
                              limit v_lim
                            ) m), '[]'::jsonb),
      'near_expiry',       coalesce((select jsonb_agg(to_jsonb(m)) from (
                              select * from med_with_batch
                              where batch_id is not null
                                and (expiry_date - current_date) between 0 and 90
                              order by expiry_date asc
                              limit v_lim
                            ) m), '[]'::jsonb),
      'overstock',         coalesce((select jsonb_agg(to_jsonb(m)) from (
                              select * from med_with_batch
                              where current_quantity > 20
                                and reorder_level > 0
                                and current_quantity > 5 * reorder_level
                              order by current_quantity desc
                              limit v_lim
                            ) m), '[]'::jsonb)
    ) as q) qq
  into v_result;
  return v_result;
end;
$$;

revoke all on function public.rpc_pos_quick_access(uuid, uuid, integer) from public;
grant execute on function public.rpc_pos_quick_access(uuid, uuid, integer) to authenticated;

-- ============================================================================
-- 3. rpc_pos_recent_bill_items — last completed bill's items for a customer.
-- Used by the "Reorder Last Bill" button on POS. Returns one row per sale_item
-- in PosSearchResult-compatible shape (with the line's batch resolved to the
-- nearest-expiry one currently in stock, not the original sold batch).
-- ============================================================================

create or replace function public.rpc_pos_recent_bill_items(
  p_store_id    uuid,
  p_customer_id uuid
)
returns table (
  medicine_id      uuid,
  name             text,
  manufacturer     text,
  pack_size        integer,
  pack_unit        text,
  hsn_code         text,
  default_gst_rate numeric,
  batch_id         uuid,
  batch_number     text,
  expiry_date      date,
  mrp              numeric,
  selling_price    numeric,
  purchase_rate    numeric,
  gst_percentage   numeric,
  current_quantity integer,
  original_qty     integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_sale uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  select id into v_sale
  from public.sales
  where store_id = p_store_id and customer_id = p_customer_id and deleted_at is null
  order by created_at desc
  limit 1;
  if v_sale is null then return; end if;

  return query
  select
    m.id, m.name, m.manufacturer, m.pack_size, m.pack_unit, m.hsn_code, m.default_gst_rate,
    bb.batch_id, bb.batch_number, bb.expiry_date,
    bb.mrp, bb.selling_price, bb.purchase_rate,
    coalesce(bb.gst_percentage, m.default_gst_rate),
    coalesce(bb.current_quantity, 0),
    si.quantity::integer
  from public.sale_items si
  join public.medicines m on m.id = si.medicine_id
  left join lateral (
    select b.id as batch_id, b.batch_number, b.expiry_date, b.mrp, b.selling_price,
           b.purchase_rate, b.gst_percentage, b.current_quantity
    from public.batches b
    where b.medicine_id = m.id
      and b.store_id = p_store_id
      and b.deleted_at is null
      and b.is_blocked = false
      and b.current_quantity > 0
      and b.expiry_date >= current_date
    order by b.expiry_date asc, b.created_at asc
    limit 1
  ) bb on true
  where si.sale_id = v_sale
    and si.medicine_id is not null
  order by m.name;
end;
$$;

revoke all on function public.rpc_pos_recent_bill_items(uuid, uuid) from public;
grant execute on function public.rpc_pos_recent_bill_items(uuid, uuid) to authenticated;
