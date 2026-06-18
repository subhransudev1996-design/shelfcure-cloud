-- ShelfCure Cloud — Migration 0054
-- §2.11.10 Stock Velocity report: fast/slow/dead stock classification by
-- sales velocity over a rolling window (not a date range).

create or replace function rpc_report_stock_velocity(
  p_store_id    uuid,
  p_window_days int default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today       date := current_date;
  v_window      int;
  v_window_from date;
  v_30d_from    date;
  v_result      jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  v_window      := greatest(7, least(365, coalesce(p_window_days, 30)));
  v_window_from := v_today - (v_window - 1);
  v_30d_from    := v_today - 29;

  with
    inv_batches as (
      select b.medicine_id, b.current_quantity, b.purchase_rate,
             m.name, m.manufacturer, m.sale_unit_mode, m.units_per_pack, m.pack_unit
      from batches b
      join medicines m on m.id = b.medicine_id
      where b.store_id = p_store_id and b.deleted_at is null
        and m.store_id = p_store_id and m.deleted_at is null
    ),
    inv_by_medicine as (
      select
        medicine_id,
        max(name)            as name,
        max(manufacturer)    as manufacturer,
        max(sale_unit_mode)  as sale_unit_mode,
        max(units_per_pack)  as units_per_pack,
        max(pack_unit)       as pack_unit,
        sum(current_quantity) as current_stock,
        sum(case when sale_unit_mode = 'both' and units_per_pack > 1
              then current_quantity::numeric / units_per_pack * purchase_rate
              else current_quantity::numeric * purchase_rate
            end) as stock_value
      from inv_batches
      group by medicine_id
      having sum(current_quantity) > 0
    ),
    sold_window_cte as (
      select si.medicine_id, sum(si.quantity) as sold_in_window
      from sale_items si
      join sales s on s.id = si.sale_id
      where s.store_id = p_store_id and s.deleted_at is null
        and si.is_misc_item = false and si.medicine_id is not null
        and s.bill_date between v_window_from and v_today
      group by si.medicine_id
    ),
    sold_30d_cte as (
      select si.medicine_id, sum(si.quantity) as sold_30d
      from sale_items si
      join sales s on s.id = si.sale_id
      where s.store_id = p_store_id and s.deleted_at is null
        and si.is_misc_item = false and si.medicine_id is not null
        and s.bill_date between v_30d_from and v_today
      group by si.medicine_id
    ),
    last_sale_cte as (
      select si.medicine_id, max(s.bill_date) as last_sale_date
      from sale_items si
      join sales s on s.id = si.sale_id
      where s.store_id = p_store_id and s.deleted_at is null
        and si.is_misc_item = false and si.medicine_id is not null
      group by si.medicine_id
    ),
    base as (
      select
        im.medicine_id, im.name, im.manufacturer, im.sale_unit_mode, im.units_per_pack, im.pack_unit,
        im.current_stock, im.stock_value,
        coalesce(sw.sold_in_window, 0) as sold_in_window,
        coalesce(s30.sold_30d, 0)      as sold_30d,
        ls.last_sale_date,
        (v_today - ls.last_sale_date) as days_since_last_sale
      from inv_by_medicine im
      left join sold_window_cte sw on sw.medicine_id = im.medicine_id
      left join sold_30d_cte s30 on s30.medicine_id = im.medicine_id
      left join last_sale_cte ls on ls.medicine_id = im.medicine_id
    ),
    ranked as (
      select base.*,
        case when sold_in_window > 0
          then row_number() over (order by sold_in_window desc, medicine_id)
          else null end as seller_rank,
        count(*) filter (where sold_in_window > 0) over () as seller_count
      from base
    ),
    classified as (
      select ranked.*,
        case
          when sold_in_window = 0 then 'dead'
          when seller_rank <= ceil(seller_count * 0.25) then 'fast'
          when seller_rank <= ceil(seller_count * 0.25) + ceil(seller_count * 0.40) then 'steady'
          else 'slow'
        end as classification,
        case when sold_in_window > 0 then round(sold_in_window::numeric / v_window, 4) else 0 end as velocity_per_day,
        case when sold_in_window > 0 then round(current_stock::numeric / (sold_in_window::numeric / v_window), 1) else null end as days_of_cover
      from ranked
    ),
    summary_cte as (
      select
        count(*) filter (where classification = 'fast')  as fast_count,
        count(*) filter (where classification = 'steady') as steady_count,
        count(*) filter (where classification = 'slow')   as slow_count,
        count(*) filter (where classification = 'dead')   as dead_count,
        coalesce(sum(stock_value) filter (where classification = 'dead'), 0) as stock_value_at_risk,
        coalesce(sum(stock_value), 0) as total_stock_value,
        count(*) as total_skus
      from classified
    )
  select jsonb_build_object(
    'window_days', v_window,
    'summary', jsonb_build_object(
      'total_skus',          (select total_skus from summary_cte),
      'fast_count',           (select fast_count from summary_cte),
      'steady_count',         (select steady_count from summary_cte),
      'slow_count',           (select slow_count from summary_cte),
      'dead_count',           (select dead_count from summary_cte),
      'stock_value_at_risk',  (select stock_value_at_risk from summary_cte),
      'total_stock_value',    (select total_stock_value from summary_cte)
    ),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
                'medicine_id', medicine_id, 'name', name, 'manufacturer', manufacturer,
                'sale_unit_mode', sale_unit_mode, 'units_per_pack', units_per_pack, 'pack_unit', pack_unit,
                'current_stock', current_stock, 'stock_value', stock_value,
                'sold_in_window', sold_in_window, 'sold_30d', sold_30d,
                'velocity_per_day', velocity_per_day, 'days_of_cover', days_of_cover,
                'days_since_last_sale', days_since_last_sale,
                'classification', classification
              ) order by sold_in_window desc, name) from classified), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function rpc_report_stock_velocity(uuid, int) from public;
grant execute on function rpc_report_stock_velocity(uuid, int) to authenticated;
