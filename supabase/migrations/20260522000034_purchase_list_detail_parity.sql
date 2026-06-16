-- =============================================================================
-- Migration 0034 — Purchase list + detail parity
--
-- 1. rpc_list_purchases  — drop/recreate to add is_ai_scanned + return_status
-- 2. rpc_get_purchase_detail — extend items projection: free_qty, returned_qty,
--    discount_pct, sale_unit_mode, units_per_pack; header: is_ai_scanned
-- 3. rpc_soft_delete_purchase — stock-safe reversal of a duplicate purchase
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. rpc_list_purchases (drop required — return-table shape changes)
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.rpc_list_purchases(uuid, date, date, integer, integer);

create function public.rpc_list_purchases(
  p_store_id  uuid,
  p_from      date    default null,
  p_to        date    default null,
  p_limit     integer default 50,
  p_offset    integer default 0
)
returns table (
  id              uuid,
  bill_number     text,
  bill_date       date,
  supplier_id     uuid,
  supplier_name   text,
  total_amount    numeric,
  payment_status  text,
  is_ai_scanned   boolean,
  return_status   text,
  created_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_lim integer := greatest(1, least(coalesce(p_limit, 50), 200));
  v_off integer := greatest(0, coalesce(p_offset, 0));
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.bill_number,
    p.bill_date,
    p.supplier_id,
    sup.name,
    p.total_amount,
    p.payment_status,
    p.is_ai_scanned,
    case
      when rs.total_returned = 0           then 'none'
      when rs.total_returned >= rs.total_ordered then 'fully_returned'
      else                                      'partially_returned'
    end::text as return_status,
    p.created_at
  from public.purchases p
  left join public.suppliers sup on sup.id = p.supplier_id
  left join lateral (
    select
      coalesce(sum(pi.returned_quantity), 0)                           as total_returned,
      coalesce(sum(pi.quantity + coalesce(pi.free_quantity, 0)), 0)    as total_ordered
    from public.purchase_items pi
    where pi.purchase_id = p.id
  ) rs on true
  where p.store_id   = p_store_id
    and p.deleted_at is null
    and (p_from is null or p.bill_date >= p_from)
    and (p_to   is null or p.bill_date <= p_to)
  order by p.bill_date desc, p.created_at desc
  limit v_lim offset v_off;
end;
$$;

revoke all on function public.rpc_list_purchases(uuid, date, date, integer, integer) from public;
grant execute on function public.rpc_list_purchases(uuid, date, date, integer, integer) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. rpc_get_purchase_detail — extend items + header
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.rpc_get_purchase_detail(p_purchase_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_p jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select jsonb_build_object(
    'purchase', to_jsonb(p.*)
      || jsonb_build_object(
           'supplier_name',  sup.name,
           'supplier_gstin', sup.gstin,
           'store_name',     st.name,
           'store_code',     st.code
         ),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',                  pi.id,
        'medicine_id',         pi.medicine_id,
        'medicine_name',       m.name,
        'batch_id',            pi.batch_id,
        'batch_number',        b.batch_number,
        'expiry_date',         b.expiry_date,
        'quantity',            pi.quantity,
        'free_quantity',       coalesce(pi.free_quantity, 0),
        'returned_quantity',   pi.returned_quantity,
        'purchase_rate',       pi.purchase_rate,
        'mrp',                 pi.mrp,
        'gst_percentage',      pi.gst_percentage,
        'discount_percentage', pi.discount_percentage,
        'amount',              pi.amount,
        'sale_unit_mode',      m.sale_unit_mode,
        'units_per_pack',      m.units_per_pack
      ) order by pi.id), '[]'::jsonb)
      from public.purchase_items pi
      left join public.medicines m on m.id = pi.medicine_id
      left join public.batches   b on b.id = pi.batch_id
      where pi.purchase_id = p.id
    )
  ) into v_p
  from public.purchases p
  join  public.stores   st  on st.id  = p.store_id
  left join public.suppliers sup on sup.id = p.supplier_id
  where p.id = p_purchase_id
    and public.user_has_store_access(p.store_id);

  if v_p is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return v_p;
end;
$$;

revoke all on function public.rpc_get_purchase_detail(uuid) from public;
grant execute on function public.rpc_get_purchase_detail(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. rpc_soft_delete_purchase
--    Refuses if returns exist or any batch would go negative.
--    Reverses batch quantities, inventory_transactions, supplier balance.
-- ─────────────────────────────────────────────────────────────────────────────

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
  join public.batches b on b.id = pi.batch_id
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
    join public.batches b on b.id = pi.batch_id
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
