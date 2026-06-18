-- ShelfCure Cloud — Migration 0050
-- §2.11.5 Daily Collection report: end-of-day till-reconciliation sheet,
-- per-day Cash/UPI/Card/Other tally for cashier drawer balancing.

create or replace function rpc_report_daily_collection(
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
    period_sales as (
      select id, bill_date, payment_method, paid_amount, total_amount
      from sales
      where store_id = p_store_id and deleted_at is null
        and bill_date between p_from and p_to
    ),
    -- Split sales: each sale_payments row tallied by its own method.
    split_payments as (
      select ps.bill_date, sp.payment_method, sp.amount
      from period_sales ps
      join sale_payments sp on sp.sale_id = ps.id
    ),
    -- Non-split sales: whole paid_amount attributed to the sale's method.
    nonsplit_payments as (
      select ps.bill_date, coalesce(ps.payment_method, 'cash') as payment_method, ps.paid_amount as amount
      from period_sales ps
      where ps.paid_amount > 0
        and not exists (select 1 from sale_payments sp where sp.sale_id = ps.id)
    ),
    bucketed as (
      select
        bill_date,
        case
          when payment_method = 'cash' then 'cash'
          when payment_method = 'upi' then 'upi'
          when payment_method = 'card' then 'card'
          else 'other'
        end as bucket,
        amount
      from split_payments
      union all
      select
        bill_date,
        case
          when payment_method = 'cash' then 'cash'
          when payment_method = 'upi' then 'upi'
          when payment_method = 'card' then 'card'
          else 'other'
        end as bucket,
        amount
      from nonsplit_payments
    ),
    daily_payments as (
      select
        bill_date as day,
        coalesce(sum(amount) filter (where bucket = 'cash'), 0)  as cash,
        coalesce(sum(amount) filter (where bucket = 'upi'), 0)   as upi,
        coalesce(sum(amount) filter (where bucket = 'card'), 0)  as card,
        coalesce(sum(amount) filter (where bucket = 'other'), 0) as other
      from bucketed
      group by bill_date
    ),
    daily_bills as (
      select
        bill_date as day,
        count(*) as bill_count,
        coalesce(sum(total_amount - paid_amount), 0) as credit_pending
      from period_sales
      group by bill_date
    ),
    daily_rows as (
      select
        coalesce(dp.day, db.day) as day,
        coalesce(dp.cash, 0)  as cash,
        coalesce(dp.upi, 0)   as upi,
        coalesce(dp.card, 0)  as card,
        coalesce(dp.other, 0) as other,
        coalesce(db.credit_pending, 0) as credit_pending,
        coalesce(db.bill_count, 0)     as bill_count
      from daily_payments dp
      full outer join daily_bills db on db.day = dp.day
    )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
                'date', day::text,
                'cash', cash, 'upi', upi, 'card', card, 'other', other,
                'credit_pending', credit_pending,
                'total_collected', cash + upi + card + other,
                'bill_count', bill_count
              ) order by day) from daily_rows), '[]'::jsonb),
    'totals', jsonb_build_object(
      'total_cash',           (select coalesce(sum(cash), 0) from daily_rows),
      'total_upi',            (select coalesce(sum(upi), 0) from daily_rows),
      'total_card',           (select coalesce(sum(card), 0) from daily_rows),
      'total_other',          (select coalesce(sum(other), 0) from daily_rows),
      'total_credit_pending', (select coalesce(sum(credit_pending), 0) from daily_rows),
      'total_collected',      (select coalesce(sum(cash + upi + card + other), 0) from daily_rows),
      'total_bills',          (select coalesce(sum(bill_count), 0) from daily_rows)
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function rpc_report_daily_collection(uuid, date, date) from public;
grant execute on function rpc_report_daily_collection(uuid, date, date) to authenticated;
