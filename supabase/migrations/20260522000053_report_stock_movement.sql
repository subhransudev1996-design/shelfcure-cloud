-- ShelfCure Cloud — Migration 0053
-- §2.11.9 Stock Movement report: an inflow vs outflow ledger per medicine
-- for a date range, netting four distinct movement types into one figure.

create or replace function rpc_report_stock_movement(
  p_store_id uuid,
  p_from     date,
  p_to       date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today  date := current_date;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'invalid_date_range' using errcode = '22007';
  end if;

  with
    meds as (
      select id, name, manufacturer, sale_unit_mode, units_per_pack, pack_unit
      from medicines
      where store_id = p_store_id and deleted_at is null
    ),
    stock_cte as (
      select medicine_id, sum(current_quantity) as current_stock
      from batches
      where store_id = p_store_id and deleted_at is null
      group by medicine_id
    ),
    -- Purchased In: quantity + free_quantity, matching what rpc_commit_purchase
    -- actually adds to batches.current_quantity (free stock is still stock).
    purchased_in_cte as (
      select pi.medicine_id,
        sum(pi.quantity + coalesce(pi.free_quantity, 0)) as purchased_in,
        sum(pi.amount) as purchased_value
      from purchase_items pi
      join purchases p on p.id = pi.purchase_id
      where p.store_id = p_store_id and p.deleted_at is null
        and p.bill_date between p_from and p_to
      group by pi.medicine_id
    ),
    sale_returned_in_cte as (
      select sri.medicine_id, sum(sri.quantity) as sale_returned_in
      from sale_return_items sri
      join sale_returns sr on sr.id = sri.sale_return_id
      where sr.store_id = p_store_id and sr.deleted_at is null
        and sr.return_date between p_from and p_to
      group by sri.medicine_id
    ),
    sold_out_cte as (
      select si.medicine_id,
        sum(si.quantity) as sold_out,
        sum(si.amount) as sold_value
      from sale_items si
      join sales s on s.id = si.sale_id
      where s.store_id = p_store_id and s.deleted_at is null
        and si.is_misc_item = false and si.medicine_id is not null
        and s.bill_date between p_from and p_to
      group by si.medicine_id
    ),
    purchase_returned_out_cte as (
      select pri.medicine_id, sum(pri.quantity) as purchase_returned_out
      from purchase_return_items pri
      join purchase_returns pr on pr.id = pri.purchase_return_id
      where pr.store_id = p_store_id and pr.deleted_at is null
        and pr.return_date between p_from and p_to
      group by pri.medicine_id
    ),
    movement_cte as (
      select
        m.id as medicine_id, m.name, m.manufacturer, m.sale_unit_mode, m.units_per_pack, m.pack_unit,
        coalesce(sc.current_stock, 0)            as current_stock,
        coalesce(pic.purchased_in, 0)             as purchased_in,
        coalesce(pic.purchased_value, 0)          as purchased_value,
        coalesce(sric.sale_returned_in, 0)        as sale_returned_in,
        coalesce(soc.sold_out, 0)                 as sold_out,
        coalesce(soc.sold_value, 0)               as sold_value,
        coalesce(prc.purchase_returned_out, 0)    as purchase_returned_out
      from meds m
      left join stock_cte sc on sc.medicine_id = m.id
      left join purchased_in_cte pic on pic.medicine_id = m.id
      left join sale_returned_in_cte sric on sric.medicine_id = m.id
      left join sold_out_cte soc on soc.medicine_id = m.id
      left join purchase_returned_out_cte prc on prc.medicine_id = m.id
      where coalesce(sc.current_stock, 0) > 0
         or coalesce(pic.purchased_in, 0) > 0
         or coalesce(sric.sale_returned_in, 0) > 0
         or coalesce(soc.sold_out, 0) > 0
         or coalesce(prc.purchase_returned_out, 0) > 0
    ),
    dormant_cte as (
      select count(*) as dormant_count
      from meds m
      join stock_cte sc on sc.medicine_id = m.id
      where sc.current_stock > 0
        and not exists (
          select 1 from sale_items si
          join sales s on s.id = si.sale_id
          where si.medicine_id = m.id
            and s.store_id = p_store_id and s.deleted_at is null
            and s.bill_date > v_today - 90
        )
    ),
    skus_moved_cte as (
      select count(*) as skus_moved
      from movement_cte
      where purchased_in > 0 or sale_returned_in > 0 or sold_out > 0 or purchase_returned_out > 0
    )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'summary', jsonb_build_object(
      'qty_in',      (select coalesce(sum(purchased_in) + sum(sale_returned_in), 0) from movement_cte),
      'qty_out',     (select coalesce(sum(sold_out) + sum(purchase_returned_out), 0) from movement_cte),
      'net_change',  (select coalesce(sum(purchased_in) + sum(sale_returned_in) - sum(sold_out) - sum(purchase_returned_out), 0) from movement_cte),
      'skus_moved',  (select skus_moved from skus_moved_cte),
      'dormant_in_stock', (select dormant_count from dormant_cte)
    ),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
                'medicine_id', medicine_id, 'name', name, 'manufacturer', manufacturer,
                'sale_unit_mode', sale_unit_mode, 'units_per_pack', units_per_pack, 'pack_unit', pack_unit,
                'current_stock', current_stock,
                'purchased_in', purchased_in, 'purchased_value', purchased_value,
                'sale_returned_in', sale_returned_in,
                'sold_out', sold_out, 'sold_value', sold_value,
                'purchase_returned_out', purchase_returned_out,
                'net_change', purchased_in + sale_returned_in - sold_out - purchase_returned_out
              ) order by name) from movement_cte), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function rpc_report_stock_movement(uuid, date, date) from public;
grant execute on function rpc_report_stock_movement(uuid, date, date) to authenticated;
