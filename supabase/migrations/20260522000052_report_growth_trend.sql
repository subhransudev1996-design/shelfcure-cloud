-- ShelfCure Cloud — Migration 0052
-- §2.11.7 Growth Trend report: period-over-period KPI comparison (reusing
-- the same period_type vocabulary + _report_perf_kpis helper as Overall
-- Performance) plus a period-type-independent trailing-12-calendar-month
-- trajectory and medicine-level grower/decliner detection.

create or replace function rpc_report_growth_trend(
  p_store_id    uuid,
  p_period_type text default 'month'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today      date := current_date;
  v_cur_from   date;
  v_cur_to     date;
  v_prev_from  date;
  v_prev_to    date;
  v_cur        record;
  v_prev       record;
  v_result     jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  case p_period_type
    when 'today' then
      v_cur_from := v_today; v_cur_to := v_today;
      v_prev_from := v_today - 1; v_prev_to := v_today - 1;
    when 'week' then
      v_cur_from := date_trunc('week', v_today)::date;
      v_cur_to   := v_cur_from + 6;
      v_prev_to  := v_cur_from - 1;
      v_prev_from := v_prev_to - 6;
    when 'quarter' then
      v_cur_from := date_trunc('quarter', v_today)::date;
      v_cur_to   := (date_trunc('quarter', v_today) + interval '3 month' - interval '1 day')::date;
      v_prev_from := (date_trunc('quarter', v_today) - interval '3 month')::date;
      v_prev_to   := v_cur_from - 1;
    when '30d' then
      v_cur_from := v_today - 29;
      v_cur_to   := v_today;
      v_prev_to   := v_cur_from - 1;
      v_prev_from := v_prev_to - 29;
    when 'all' then
      select min(bill_date) into v_cur_from from sales where store_id = p_store_id and deleted_at is null;
      if v_cur_from is null then v_cur_from := v_today; end if;
      v_cur_to := v_today;
      v_prev_from := null; v_prev_to := null;
    else  -- 'month' default
      v_cur_from := date_trunc('month', v_today)::date;
      v_cur_to   := (date_trunc('month', v_today) + interval '1 month' - interval '1 day')::date;
      v_prev_from := (date_trunc('month', v_today) - interval '1 month')::date;
      v_prev_to   := v_cur_from - 1;
  end case;

  select * into v_cur  from _report_perf_kpis(p_store_id, v_cur_from, v_cur_to);
  select * into v_prev from _report_perf_kpis(p_store_id, v_prev_from, v_prev_to);

  with
    months as (
      select generate_series(
        date_trunc('month', v_today) - interval '11 month',
        date_trunc('month', v_today),
        interval '1 month'
      )::date as month_start
    ),
    trend_cte as (
      select
        ms.month_start,
        (ms.month_start + interval '1 month' - interval '1 day')::date as month_end,
        count(s.id)              as bills,
        coalesce(sum(s.total_amount), 0) as revenue
      from months ms
      left join sales s on s.store_id = p_store_id and s.deleted_at is null
        and s.bill_date >= ms.month_start
        and s.bill_date <= (ms.month_start + interval '1 month' - interval '1 day')::date
      group by ms.month_start
    ),
    medicine_cur as (
      select m.id, sum(si.quantity) as qty, sum(si.amount) as rev
      from sale_items si
      join sales s on s.id = si.sale_id
      join medicines m on m.id = si.medicine_id
      where s.store_id = p_store_id and s.deleted_at is null and si.medicine_id is not null
        and s.bill_date between v_cur_from and v_cur_to
      group by m.id
    ),
    medicine_prev as (
      select m.id, sum(si.quantity) as qty, sum(si.amount) as rev
      from sale_items si
      join sales s on s.id = si.sale_id
      join medicines m on m.id = si.medicine_id
      where s.store_id = p_store_id and s.deleted_at is null and si.medicine_id is not null
        and v_prev_from is not null and s.bill_date between v_prev_from and v_prev_to
      group by m.id
    ),
    medicine_ids as (
      select distinct medicine_id from (
        select id as medicine_id from medicine_cur
        union
        select id as medicine_id from medicine_prev
      ) x
    ),
    medicine_delta as (
      select
        m.id as medicine_id, m.name, m.manufacturer,
        coalesce(mc.rev, 0) as cur_rev, coalesce(mp.rev, 0) as prev_rev,
        coalesce(mc.qty, 0) as cur_qty, coalesce(mp.qty, 0) as prev_qty,
        coalesce(mc.rev, 0) - coalesce(mp.rev, 0) as rev_delta
      from medicine_ids mi
      join medicines m on m.id = mi.medicine_id
      left join medicine_cur mc on mc.id = mi.medicine_id
      left join medicine_prev mp on mp.id = mi.medicine_id
    ),
    growers as (
      select * from medicine_delta where rev_delta > 0 order by rev_delta desc limit 10
    ),
    decliners as (
      select * from medicine_delta where rev_delta < 0 order by rev_delta asc limit 10
    )
  select jsonb_build_object(
    'period', jsonb_build_object(
      'current_from', v_cur_from, 'current_to', v_cur_to,
      'previous_from', v_prev_from, 'previous_to', v_prev_to
    ),
    'kpis', jsonb_build_object(
      'revenue',          jsonb_build_object('current', v_cur.revenue, 'previous', v_prev.revenue, 'delta_abs', v_cur.revenue - v_prev.revenue, 'delta_pct', public._growth_pct(v_cur.revenue, v_prev.revenue)),
      'bills',             jsonb_build_object('current', v_cur.bills, 'previous', v_prev.bills, 'delta_abs', v_cur.bills - v_prev.bills, 'delta_pct', public._growth_pct(v_cur.bills, v_prev.bills)),
      'avg_bill_value',    jsonb_build_object('current', v_cur.avg_bill_value, 'previous', v_prev.avg_bill_value, 'delta_abs', v_cur.avg_bill_value - v_prev.avg_bill_value, 'delta_pct', public._growth_pct(v_cur.avg_bill_value, v_prev.avg_bill_value)),
      'items_sold',        jsonb_build_object('current', v_cur.items_sold, 'previous', v_prev.items_sold, 'delta_abs', v_cur.items_sold - v_prev.items_sold, 'delta_pct', public._growth_pct(v_cur.items_sold, v_prev.items_sold)),
      'active_customers',  jsonb_build_object('current', v_cur.active_customers, 'previous', v_prev.active_customers, 'delta_abs', v_cur.active_customers - v_prev.active_customers, 'delta_pct', public._growth_pct(v_cur.active_customers, v_prev.active_customers)),
      'new_customers',     jsonb_build_object('current', v_cur.new_customers, 'previous', v_prev.new_customers, 'delta_abs', v_cur.new_customers - v_prev.new_customers, 'delta_pct', public._growth_pct(v_cur.new_customers, v_prev.new_customers)),
      'gross_profit',      jsonb_build_object('current', v_cur.gross_profit, 'previous', v_prev.gross_profit, 'delta_abs', v_cur.gross_profit - v_prev.gross_profit, 'delta_pct', public._growth_pct(v_cur.gross_profit, v_prev.gross_profit))
    ),
    'trend', coalesce((select jsonb_agg(jsonb_build_object(
                'label', to_char(month_start, 'Mon YYYY'),
                'period_start', month_start::text,
                'period_end', month_end::text,
                'revenue', revenue,
                'bills', bills
              ) order by month_start) from trend_cte), '[]'::jsonb),
    'growers', coalesce((select jsonb_agg(jsonb_build_object(
                'medicine_id', medicine_id, 'name', name, 'manufacturer', manufacturer,
                'cur_rev', cur_rev, 'prev_rev', prev_rev, 'cur_qty', cur_qty, 'prev_qty', prev_qty,
                'rev_delta', rev_delta
              ) order by rev_delta desc) from growers), '[]'::jsonb),
    'decliners', coalesce((select jsonb_agg(jsonb_build_object(
                'medicine_id', medicine_id, 'name', name, 'manufacturer', manufacturer,
                'cur_rev', cur_rev, 'prev_rev', prev_rev, 'cur_qty', cur_qty, 'prev_qty', prev_qty,
                'rev_delta', rev_delta
              ) order by rev_delta asc) from decliners), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function rpc_report_growth_trend(uuid, text) from public;
grant execute on function rpc_report_growth_trend(uuid, text) to authenticated;
