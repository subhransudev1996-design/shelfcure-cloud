-- ShelfCure Cloud — Migration 0074
-- Fix the remaining references to the nonexistent purchase_items.batch_id
-- column (see migration 0073's note). purchase_items has never had a
-- batch_id column — the relationship runs the other way:
-- batches.purchase_item_id references purchase_items.id. Three more RPCs
-- still had the same mistake:
--
--   1. rpc_soft_delete_purchase — its negative-stock guard and stock-reversal
--      loop both joined `batches b on b.id = pi.batch_id`, which always
--      matched zero rows. In practice this meant the negative-stock safety
--      check never fired, AND deleting a purchase never reversed its batch
--      quantities or logged a reversing inventory_transaction — stock was
--      silently left as-is while the purchase row was soft-deleted.
--   2. rpc_get_supplier_detail — its quick-stats batch count included a
--      `b.id in (select pi.batch_id from purchase_items pi ...)` branch that
--      always matched nothing (silently undercounting, not erroring, since
--      it's an `in` against an all-null list).
--   3. rpc_get_supplier_medicines — same mistake, both in its `exists` filter
--      and in three correlated subqueries for last purchase_item/purchase/date,
--      each comparing `pi.batch_id = b.id`.
--   4. rpc_report_expiry — its supplier-provenance subquery additionally
--      referenced `pi2.supplier_id`, which has never existed either
--      (supplier_id lives on `purchases`, not `purchase_items`). This was a
--      hard 42703 error, so the Expiry Report has been completely broken
--      (every call) since migration 0044. Fixed by dropping the subquery
--      entirely and joining `suppliers` via `batches.supplier_id` directly,
--      which already exists and is kept current by rpc_commit_purchase's
--      batch upsert — no need to go through purchase_items at all.
--
-- Bodies are otherwise unchanged from their source migrations (0034, 0042, 0044).

-- ============================================================================
-- 1. rpc_soft_delete_purchase
-- ============================================================================

create or replace function public.rpc_soft_delete_purchase(
  p_purchase_id uuid,
  p_store_id    uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_purchase     public.purchases%rowtype;
  v_return_count integer;
  v_neg_count    integer;
  v_new_balance  numeric;
  r              record;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  -- Fetch + row-lock the purchase
  select * into v_purchase
  from public.purchases
  where id = p_purchase_id
    and store_id = p_store_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'purchase_not_found' using errcode = 'P0002';
  end if;

  -- Block if any purchase returns reference this purchase
  select count(*) into v_return_count
  from public.purchase_returns
  where purchase_id = p_purchase_id
    and deleted_at  is null;

  if v_return_count > 0 then
    raise exception 'has_returns: cannot delete a purchase with linked returns'
          using errcode = '23514';
  end if;

  -- Block if reversing stock would take any batch negative
  select count(*) into v_neg_count
  from public.purchase_items pi
  join public.batches b on b.purchase_item_id = pi.id
  where pi.purchase_id = p_purchase_id
    and b.current_quantity < (pi.quantity + coalesce(pi.free_quantity, 0));

  if v_neg_count > 0 then
    raise exception 'batch_stock_negative: stock already sold, cannot delete'
          using errcode = '23514';
  end if;

  -- Reverse each item: deduct batch + log inventory_transaction
  for r in
    select
      pi.medicine_id,
      b.id   as batch_id,
      b.current_quantity,
      (pi.quantity + coalesce(pi.free_quantity, 0)) as deduct_qty
    from public.purchase_items pi
    join public.batches b on b.purchase_item_id = pi.id
    where pi.purchase_id = p_purchase_id
  loop
    update public.batches
    set current_quantity = current_quantity - r.deduct_qty
    where id = r.batch_id;

    insert into public.inventory_transactions (
      org_id, store_id, medicine_id, batch_id,
      transaction_type, reference_type, reference_id,
      quantity_change, quantity_after,
      notes, created_by
    ) values (
      v_purchase.org_id, p_store_id, r.medicine_id, r.batch_id,
      'adjustment', 'purchase_reversal', p_purchase_id,
      -r.deduct_qty, r.current_quantity - r.deduct_qty,
      'Purchase deleted (duplicate removal)', auth.uid()
    );
  end loop;

  -- Reverse supplier outstanding balance (only if credit was extended)
  if v_purchase.payment_status in ('pending', 'partial') then
    update public.suppliers
    set outstanding_balance = greatest(0,
          outstanding_balance - (v_purchase.total_amount - coalesce(v_purchase.paid_amount, 0))
        )
    where id = v_purchase.supplier_id
    returning outstanding_balance into v_new_balance;

    insert into public.supplier_ledgers (
      org_id, store_id, supplier_id,
      transaction_type, reference_type, reference_id,
      amount, balance_after,
      notes, created_by
    ) values (
      v_purchase.org_id, p_store_id, v_purchase.supplier_id,
      'adjustment', 'purchase_reversal', p_purchase_id,
      -(v_purchase.total_amount - coalesce(v_purchase.paid_amount, 0)),
      coalesce(v_new_balance, 0),
      'Purchase deleted (duplicate removal)', auth.uid()
    );
  end if;

  -- Soft-delete
  update public.purchases
  set deleted_at = now()
  where id = p_purchase_id;
end;
$$;

revoke all on function public.rpc_soft_delete_purchase(uuid, uuid) from public;
grant execute on function public.rpc_soft_delete_purchase(uuid, uuid) to authenticated;

-- ============================================================================
-- 2. rpc_get_supplier_detail
-- ============================================================================

create or replace function public.rpc_get_supplier_detail(p_supplier_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_org uuid := public.current_org();
  v_sup jsonb;
  v_stats jsonb;
  v_purchases jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_org is null then raise exception 'profile_missing' using errcode = '42501'; end if;

  select row_to_json(s)::jsonb into v_sup
  from public.suppliers s
  where s.id = p_supplier_id and s.org_id = v_org and s.deleted_at is null;

  if v_sup is null then raise exception 'not_found' using errcode = '42704'; end if;

  -- quick stats from batches supplied (either directly or via purchases)
  select jsonb_build_object(
    'batch_count',        count(distinct b.id),
    'low_stock_count',    count(distinct b.id) filter (where b.current_quantity <= m.reorder_level and b.current_quantity >= 0),
    'expiry_soon_count',  count(distinct b.id) filter (where b.expiry_date <= current_date + interval '90 days' and b.expiry_date > current_date and b.current_quantity > 0)
  )
  into v_stats
  from public.batches b
  join public.medicines m on m.id = b.medicine_id
  where b.deleted_at is null
    and (
      b.supplier_id = p_supplier_id
      or b.purchase_item_id in (
        select pi.id from public.purchase_items pi
        join public.purchases pu on pu.id = pi.purchase_id
        where pu.supplier_id = p_supplier_id
      )
    );

  -- recent purchases (last 20)
  select jsonb_agg(
    jsonb_build_object(
      'id',             p.id,
      'bill_number',    p.bill_number,
      'bill_date',      p.bill_date,
      'total_amount',   p.total_amount,
      'payment_status', p.payment_status,
      'items_count',    (select count(*) from public.purchase_items pi where pi.purchase_id = p.id)
    ) order by p.bill_date desc, p.id desc
  )
  into v_purchases
  from (
    select p2.id, p2.bill_number, p2.bill_date, p2.total_amount, p2.payment_status
    from public.purchases p2
    where p2.supplier_id = p_supplier_id
      and p2.deleted_at is null
    order by p2.bill_date desc, p2.id desc
    limit 20
  ) p;

  return jsonb_build_object(
    'supplier',         v_sup,
    'quick_stats',      coalesce(v_stats, '{}'::jsonb),
    'recent_purchases', coalesce(v_purchases, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.rpc_get_supplier_detail(uuid) from public;
grant execute on function public.rpc_get_supplier_detail(uuid) to authenticated;

-- ============================================================================
-- 3. rpc_get_supplier_medicines
-- ============================================================================

create or replace function public.rpc_get_supplier_medicines(p_supplier_id uuid)
returns table (
  medicine_id      uuid,
  medicine_name    text,
  batch_id         uuid,
  batch_number     text,
  expiry_date      date,
  current_quantity integer,
  purchase_rate    numeric,
  mrp              numeric,
  gst_percentage   numeric,
  days_to_expiry   integer,
  min_stock_level  integer,
  reorder_level    integer,
  is_low_stock     boolean,
  purchase_item_id uuid,
  purchase_id      uuid,
  last_purchase_date date
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
    m.id,
    m.name,
    b.id,
    b.batch_number,
    b.expiry_date,
    b.current_quantity,
    b.purchase_rate,
    b.mrp,
    b.gst_percentage,
    (b.expiry_date - current_date)::integer,
    m.min_stock_level,
    m.reorder_level,
    (b.current_quantity <= m.reorder_level),
    -- most recent purchase_item for this batch from this supplier
    (
      select pi.id from public.purchase_items pi
      join public.purchases pu on pu.id = pi.purchase_id
      where pi.id = b.purchase_item_id and pu.supplier_id = p_supplier_id
        and pu.deleted_at is null
      order by pi.id desc limit 1
    ),
    (
      select pu.id from public.purchase_items pi
      join public.purchases pu on pu.id = pi.purchase_id
      where pi.id = b.purchase_item_id and pu.supplier_id = p_supplier_id
        and pu.deleted_at is null
      order by pi.id desc limit 1
    ),
    (
      select pu.bill_date from public.purchase_items pi
      join public.purchases pu on pu.id = pi.purchase_id
      where pi.id = b.purchase_item_id and pu.supplier_id = p_supplier_id
        and pu.deleted_at is null
      order by pi.id desc limit 1
    )
  from public.batches b
  join public.medicines m on m.id = b.medicine_id
  where b.deleted_at is null
    and b.org_id = v_org
    and (
      b.supplier_id = p_supplier_id
      or exists (
        select 1 from public.purchase_items pi
        join public.purchases pu on pu.id = pi.purchase_id
        where pi.id = b.purchase_item_id
          and pu.supplier_id = p_supplier_id
          and pu.deleted_at is null
      )
    )
  order by (b.expiry_date - current_date) asc, m.name asc;
end;
$$;

revoke all on function public.rpc_get_supplier_medicines(uuid) from public;
grant execute on function public.rpc_get_supplier_medicines(uuid) to authenticated;

-- ============================================================================
-- 4. rpc_report_expiry
-- ============================================================================

create or replace function rpc_report_expiry(
  p_store_id  uuid,
  p_days_ahead int default 90
)
returns table (
  batch_id         uuid,
  batch_number     text,
  medicine_id      uuid,
  medicine_name    text,
  manufacturer     text,
  supplier_id      uuid,
  supplier_name    text,
  expiry_date      date,
  current_quantity int,
  purchase_rate    numeric,
  mrp              numeric,
  gst_percentage   numeric,
  sale_unit_mode   text,
  units_per_pack   int,
  pack_unit        text,
  days_to_expiry   int,
  is_expired       boolean,
  value_at_mrp     numeric
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
    select
      b.id                              as batch_id,
      b.batch_number,
      m.id                              as medicine_id,
      m.name                            as medicine_name,
      m.manufacturer,
      sup.id                            as supplier_id,
      sup.name                          as supplier_name,
      b.expiry_date,
      b.current_quantity,
      b.purchase_rate,
      b.mrp,
      b.gst_percentage,
      m.sale_unit_mode,
      m.units_per_pack,
      m.pack_unit,
      (b.expiry_date - current_date)::int as days_to_expiry,
      (b.expiry_date < current_date)   as is_expired,
      -- value_at_mrp: flexible-unit aware
      case
        when m.sale_unit_mode = 'both' and m.units_per_pack > 1
          then round((b.current_quantity::numeric / m.units_per_pack) * b.mrp, 2)
        else round(b.current_quantity::numeric * b.mrp, 2)
      end                               as value_at_mrp
    from batches b
    join medicines m on m.id = b.medicine_id
    left join suppliers sup on sup.id = b.supplier_id
    where b.store_id = p_store_id
      and b.current_quantity > 0
      and (
        p_days_ahead = 0
        or b.expiry_date <= current_date + p_days_ahead
      )
    order by b.expiry_date asc, m.name;
end;
$$;
