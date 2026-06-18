-- ShelfCure Cloud — Migration 0049
-- §2.11.4 Cash vs Credit report: payment-status segmentation for a period,
-- plus a *current* (not period-bound) debt-aging snapshot and top-debtor
-- leaderboard.

create or replace function rpc_report_cash_credit(
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
    -- Period sales classified cash vs credit by amounts (not the stored
    -- payment_status column) per the +0.01 float-rounding epsilon spec.
    period_sales as (
      select
        s.id, s.bill_number, s.bill_date, s.customer_id, s.total_amount, s.paid_amount,
        s.payment_status,
        (s.paid_amount + 0.01 >= s.total_amount) as is_cash
      from sales s
      where s.store_id = p_store_id and s.deleted_at is null
        and s.bill_date between p_from and p_to
    ),
    split_agg as (
      select
        coalesce(sum(total_amount) filter (where is_cash), 0)        as cash_sales_amount,
        count(*) filter (where is_cash)                              as cash_sales_count,
        coalesce(sum(total_amount) filter (where not is_cash), 0)    as credit_sales_total,
        count(*) filter (where not is_cash)                          as credit_sales_count,
        coalesce(sum(total_amount - paid_amount) filter (where not is_cash), 0) as credit_unpaid_portion
      from period_sales
    ),
    collected_agg as (
      select coalesce(sum(amount), 0) as credit_collected
      from customer_ledgers
      where store_id = p_store_id and transaction_type = 'payment'
        and created_at::date between p_from and p_to
    ),
    daily_cte as (
      select
        bill_date as day,
        coalesce(sum(total_amount) filter (where is_cash), 0)     as cash_amount,
        count(*) filter (where is_cash)                           as cash_count,
        coalesce(sum(total_amount) filter (where not is_cash), 0) as credit_amount,
        count(*) filter (where not is_cash)                       as credit_count
      from period_sales
      group by bill_date
      order by bill_date
    ),
    credit_bills_cte as (
      select
        ps.id as sale_id, ps.bill_number, ps.bill_date,
        coalesce(c.name, 'Walk-in') as customer_name,
        ps.total_amount, ps.paid_amount,
        (ps.total_amount - ps.paid_amount) as balance,
        ps.payment_status
      from period_sales ps
      left join customers c on c.id = ps.customer_id
      where ps.total_amount > ps.paid_amount
      order by ps.bill_date desc
    ),
    -- Current snapshot — independent of [p_from, p_to].
    snapshot_cte as (
      select
        coalesce(sum(outstanding_balance), 0) as total_outstanding,
        count(*) filter (where outstanding_balance > 0) as customers_with_balance
      from customers
      where store_id = p_store_id and deleted_at is null
    ),
    aging_cte as (
      select
        coalesce(sum(total_amount - paid_amount) filter (where v_today - bill_date between 0 and 30), 0) as aging_0_30,
        coalesce(sum(total_amount - paid_amount) filter (where v_today - bill_date between 31 and 60), 0) as aging_31_60,
        coalesce(sum(total_amount - paid_amount) filter (where v_today - bill_date between 61 and 90), 0) as aging_61_90,
        coalesce(sum(total_amount - paid_amount) filter (where v_today - bill_date > 90), 0) as aging_90_plus
      from sales
      where store_id = p_store_id and deleted_at is null
        and payment_status in ('partial', 'pending', 'credit')
        and total_amount > paid_amount
    ),
    top_debtors_cte as (
      select
        c.id as customer_id, c.name, c.phone, c.outstanding_balance, c.last_purchase_date,
        case when c.last_purchase_date is not null then v_today - c.last_purchase_date else null end as days_since_last_sale
      from customers c
      where c.store_id = p_store_id and c.deleted_at is null and c.outstanding_balance > 0
      order by c.outstanding_balance desc
      limit 20
    )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'cash_sales_amount',     (select cash_sales_amount from split_agg),
    'cash_sales_count',      (select cash_sales_count from split_agg),
    'credit_sales_total',    (select credit_sales_total from split_agg),
    'credit_sales_count',    (select credit_sales_count from split_agg),
    'credit_unpaid_portion', (select credit_unpaid_portion from split_agg),
    'credit_collected',      (select credit_collected from collected_agg),
    'snapshot', jsonb_build_object(
      'total_outstanding',      (select total_outstanding from snapshot_cte),
      'customers_with_balance', (select customers_with_balance from snapshot_cte),
      'aging_0_30',    (select aging_0_30 from aging_cte),
      'aging_31_60',   (select aging_31_60 from aging_cte),
      'aging_61_90',   (select aging_61_90 from aging_cte),
      'aging_90_plus', (select aging_90_plus from aging_cte)
    ),
    'daily', coalesce((select jsonb_agg(jsonb_build_object(
                'day', day::text, 'cash_amount', cash_amount, 'cash_count', cash_count,
                'credit_amount', credit_amount, 'credit_count', credit_count
              )) from daily_cte), '[]'::jsonb),
    'top_debtors', coalesce((select jsonb_agg(jsonb_build_object(
                'customer_id', customer_id, 'customer', name, 'phone', phone,
                'outstanding', outstanding_balance,
                'last_sale_date', last_purchase_date::text,
                'days_since_last_sale', days_since_last_sale
              )) from top_debtors_cte), '[]'::jsonb),
    'credit_bills', coalesce((select jsonb_agg(jsonb_build_object(
                'sale_id', sale_id, 'bill_number', bill_number, 'bill_date', bill_date::text,
                'customer', customer_name, 'total', total_amount, 'paid', paid_amount,
                'balance', balance, 'payment_status', payment_status
              )) from credit_bills_cte), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function rpc_report_cash_credit(uuid, date, date) from public;
grant execute on function rpc_report_cash_credit(uuid, date, date) to authenticated;
