-- ShelfCure Cloud — Migration 0051
-- §2.11.6 Hourly Report: time-of-day pattern analysis with a fixed 24-hour
-- bucket breakdown plus a date x hour heatmap.
-- Hour-of-day is read in Asia/Kolkata local time (the app is India-only;
-- sales.created_at is stored in UTC) to match the legacy mobile app's
-- 'localtime' semantics.

create or replace function rpc_report_hourly(
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
    sales_by_hour as (
      select
        extract(hour from s.created_at at time zone 'Asia/Kolkata')::int as hour,
        count(*) as bill_count,
        sum(s.total_amount) as revenue
      from sales s
      where s.store_id = p_store_id and s.deleted_at is null
        and s.bill_date between p_from and p_to
      group by 1
    ),
    items_by_hour as (
      select
        extract(hour from s.created_at at time zone 'Asia/Kolkata')::int as hour,
        coalesce(sum(si.quantity), 0) as items_sold
      from sale_items si
      join sales s on s.id = si.sale_id
      where s.store_id = p_store_id and s.deleted_at is null and si.is_misc_item = false
        and s.bill_date between p_from and p_to
      group by 1
    ),
    hours as (
      select generate_series(0, 23) as hour
    ),
    hourly_cte as (
      select
        h.hour,
        coalesce(sbh.bill_count, 0) as bill_count,
        coalesce(sbh.revenue, 0)    as revenue,
        coalesce(ibh.items_sold, 0) as items_sold
      from hours h
      left join sales_by_hour sbh on sbh.hour = h.hour
      left join items_by_hour ibh on ibh.hour = h.hour
    ),
    heatmap_cte as (
      select
        s.bill_date as day,
        extract(hour from s.created_at at time zone 'Asia/Kolkata')::int as hour,
        count(*) as bill_count,
        sum(s.total_amount) as revenue
      from sales s
      where s.store_id = p_store_id and s.deleted_at is null
        and s.bill_date between p_from and p_to
      group by 1, 2
    ),
    summary_cte as (
      select
        coalesce(sum(bill_count), 0)  as total_bills,
        coalesce(sum(revenue), 0)     as total_revenue,
        coalesce(sum(items_sold), 0)  as total_items
      from hourly_cte
    ),
    peak_cte as (
      select hour, revenue from hourly_cte order by revenue desc, hour asc limit 1
    ),
    active_cells_cte as (
      select count(*) as active_cells from heatmap_cte where bill_count > 0
    )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'hourly', coalesce((select jsonb_agg(jsonb_build_object(
                 'hour', hour, 'bill_count', bill_count, 'revenue', revenue, 'items_sold', items_sold
               ) order by hour) from hourly_cte), '[]'::jsonb),
    'heatmap', coalesce((select jsonb_agg(jsonb_build_object(
                 'date', day::text, 'hour', hour, 'revenue', revenue, 'bill_count', bill_count
               ) order by day, hour) from heatmap_cte), '[]'::jsonb),
    'summary', jsonb_build_object(
      'total_bills',   (select total_bills from summary_cte),
      'total_revenue', (select total_revenue from summary_cte),
      'total_items',   (select total_items from summary_cte),
      'peak_hour',          (select hour from peak_cte),
      'peak_hour_revenue',  (select revenue from peak_cte),
      'avg_bills_per_active_hour',
        case when (select active_cells from active_cells_cte) > 0
          then round((select total_bills from summary_cte)::numeric / (select active_cells from active_cells_cte), 2)
          else 0
        end
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function rpc_report_hourly(uuid, date, date) from public;
grant execute on function rpc_report_hourly(uuid, date, date) to authenticated;
