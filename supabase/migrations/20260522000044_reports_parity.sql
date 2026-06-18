-- §2.11 Reports parity — RPCs for Expiry, Shortage, Stock Summary, GST Monthly/Annual,
-- Doctor Prescriptions, Sales Returns summary, Purchase Returns list, and Daily/Profit reports
-- Note: rpc_report_sales_trend / rpc_report_top_medicines / rpc_report_gst_summary remain
-- for backwards compatibility (dashboard widget) but new pages use the richer RPCs below.

-- ─── Expiry Report ─────────────────────────────────────────────────────────
-- Returns batches with current_quantity > 0 due within p_days_ahead days
-- (p_days_ahead = 0 means all future + already expired in-stock)
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
    left join (
      select pi2.batch_id, pi2.supplier_id, row_number() over (partition by pi2.batch_id order by p2.bill_date desc) as rn
      from purchase_items pi2
      join purchases p2 on p2.id = pi2.purchase_id
    ) last_pi on last_pi.batch_id = b.id and last_pi.rn = 1
    left join suppliers sup on sup.id = last_pi.supplier_id
    where b.store_id = p_store_id
      and b.current_quantity > 0
      and (
        p_days_ahead = 0
        or b.expiry_date <= current_date + p_days_ahead
      )
    order by b.expiry_date asc, m.name;
end;
$$;

-- ─── Shortage Report ────────────────────────────────────────────────────────
-- Out-of-stock and low-stock items with reorder value estimate + supplier provenance
create or replace function rpc_report_shortage(p_store_id uuid)
returns table (
  medicine_id             uuid,
  medicine_name           text,
  manufacturer            text,
  current_quantity        int,
  min_stock_level         int,
  reorder_level           int,
  sale_unit_mode          text,
  units_per_pack          int,
  pack_unit               text,
  is_out_of_stock         boolean,
  shortage_qty            int,
  primary_supplier_id     uuid,
  primary_supplier_name   text,
  last_purchase_date      date,
  last_purchase_rate      numeric,
  estimated_reorder_value numeric
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
    with stock as (
      select
        m.id as medicine_id,
        m.name as medicine_name,
        m.manufacturer,
        m.sale_unit_mode,
        m.units_per_pack,
        m.pack_unit,
        m.min_stock_level,
        m.reorder_level,
        coalesce(sum(b.current_quantity), 0)::int as current_quantity
      from medicines m
      left join batches b on b.medicine_id = m.id and b.store_id = p_store_id and b.current_quantity > 0
      where m.store_id = p_store_id
      group by m.id, m.name, m.manufacturer, m.sale_unit_mode, m.units_per_pack, m.pack_unit, m.min_stock_level, m.reorder_level
    ),
    last_purchase as (
      select distinct on (pi.medicine_id)
        pi.medicine_id,
        sup.id as supplier_id,
        sup.name as supplier_name,
        p.bill_date as purchase_date,
        pi.purchase_rate
      from purchase_items pi
      join purchases p on p.id = pi.purchase_id and p.store_id = p_store_id
      left join suppliers sup on sup.id = p.supplier_id
      order by pi.medicine_id, p.bill_date desc, p.id desc
    )
    select
      s.medicine_id,
      s.medicine_name,
      s.manufacturer,
      s.current_quantity,
      s.min_stock_level,
      s.reorder_level,
      s.sale_unit_mode,
      s.units_per_pack,
      s.pack_unit,
      (s.current_quantity = 0)   as is_out_of_stock,
      greatest(0, s.min_stock_level - s.current_quantity) as shortage_qty,
      lp.supplier_id              as primary_supplier_id,
      coalesce(lp.supplier_name, 'Unknown — never purchased') as primary_supplier_name,
      lp.purchase_date            as last_purchase_date,
      lp.purchase_rate            as last_purchase_rate,
      round(
        greatest(0, s.min_stock_level - s.current_quantity)::numeric * coalesce(lp.purchase_rate, 0), 2
      )                           as estimated_reorder_value
    from stock s
    left join last_purchase lp on lp.medicine_id = s.medicine_id
    where s.current_quantity < s.min_stock_level
    order by s.current_quantity asc, s.medicine_name;
end;
$$;

-- ─── Stock Summary ──────────────────────────────────────────────────────────
-- Point-in-time inventory valuation per medicine (flexible-unit aware)
create or replace function rpc_report_stock_summary(p_store_id uuid)
returns table (
  medicine_id      uuid,
  medicine_name    text,
  manufacturer     text,
  sale_unit_mode   text,
  units_per_pack   int,
  pack_unit        text,
  min_stock_level  int,
  reorder_level    int,
  total_quantity   int,
  active_batches   int,
  nearest_expiry   date,
  stock_value      numeric,
  is_low_stock     boolean
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
    select
      m.id                               as medicine_id,
      m.name                             as medicine_name,
      m.manufacturer,
      m.sale_unit_mode,
      m.units_per_pack,
      m.pack_unit,
      m.min_stock_level,
      m.reorder_level,
      coalesce(sum(b.current_quantity), 0)::int as total_quantity,
      (count(b.id) filter (where b.current_quantity > 0))::int as active_batches,
      min(b.expiry_date) filter (where b.current_quantity > 0) as nearest_expiry,
      -- stock_value: flexible-unit aware (both-mode: divide by units_per_pack)
      coalesce(
        case when m.sale_unit_mode = 'both' and m.units_per_pack > 1
          then round(sum(b.current_quantity::numeric / m.units_per_pack * b.purchase_rate), 2)
          else round(sum(b.current_quantity::numeric * b.purchase_rate), 2)
        end,
      0)                                 as stock_value,
      -- is_low_stock: flexible-unit aware
      case when m.sale_unit_mode = 'both' and m.units_per_pack > 1
        then coalesce(floor(sum(b.current_quantity)::numeric / m.units_per_pack), 0) < m.min_stock_level
        else coalesce(sum(b.current_quantity), 0) < m.min_stock_level
      end                                as is_low_stock
    from medicines m
    left join batches b on b.medicine_id = m.id and b.store_id = p_store_id
    where m.store_id = p_store_id
    group by m.id, m.name, m.manufacturer, m.sale_unit_mode, m.units_per_pack, m.pack_unit,
             m.min_stock_level, m.reorder_level
    order by m.name;
end;
$$;

-- ─── GST Monthly (enhanced) ─────────────────────────────────────────────────
-- Full reconciliation: output (sales) + input (purchases) + ITC adjustments + net
create or replace function rpc_report_gst_monthly(
  p_store_id uuid,
  p_month    int,
  p_year     int
)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_from date := make_date(p_year, p_month, 1);
  v_to   date := (v_from + interval '1 month' - interval '1 day')::date;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  with
    -- Output (sales)
    out_slabs as (
      select
        si.gst_percentage::numeric as gst_rate,
        count(distinct s.id)       as transactions,
        sum(si.taxable_amount)     as taxable_amount,
        sum(si.cgst_amount)        as cgst,
        sum(si.sgst_amount)        as sgst,
        sum(si.igst_amount)        as igst,
        sum(si.cgst_amount + si.sgst_amount + si.igst_amount) as total_gst
      from sale_items si
      join sales s on s.id = si.sale_id and s.store_id = p_store_id
        and s.bill_date between v_from and v_to and s.deleted_at is null
      group by si.gst_percentage
    ),
    out_totals as (
      select
        sum(taxable_amount) as taxable,
        sum(cgst)           as cgst,
        sum(sgst)           as sgst,
        sum(igst)           as igst,
        sum(total_gst)      as total_gst
      from out_slabs
    ),
    -- Input (purchases)
    in_slabs as (
      select
        pi.gst_percentage::numeric as gst_rate,
        count(distinct p.id)       as transactions,
        sum(pi.taxable_amount)     as taxable_amount,
        sum(pi.cgst_amount)        as cgst,
        sum(pi.sgst_amount)        as sgst,
        sum(pi.igst_amount)        as igst,
        sum(pi.cgst_amount + pi.sgst_amount + pi.igst_amount) as total_gst
      from purchase_items pi
      join purchases p on p.id = pi.purchase_id and p.store_id = p_store_id
        and p.bill_date between v_from and v_to
      group by pi.gst_percentage
    ),
    in_totals as (
      select
        sum(taxable_amount) as taxable,
        sum(cgst)           as cgst,
        sum(sgst)           as sgst,
        sum(igst)           as igst,
        sum(total_gst)      as total_gst
      from in_slabs
    ),
    -- Sales returns (reduces output GST)
    sr_totals as (
      select
        coalesce(sum(sr.gst_amount), 0) as gst,
        coalesce(sum(sr.subtotal), 0)   as taxable
      from sale_returns sr
      where sr.store_id = p_store_id
        and sr.return_date between v_from and v_to
    ),
    -- Purchase returns (reduces ITC)
    pr_totals as (
      select
        coalesce(sum(pr.gst_amount), 0) as gst,
        coalesce(sum(pr.subtotal), 0)   as taxable
      from purchase_returns pr
      where pr.store_id = p_store_id
        and pr.return_date between v_from and v_to
    )
  select jsonb_build_object(
    'period', jsonb_build_object('month', p_month, 'year', p_year, 'from', v_from, 'to', v_to),
    'output', jsonb_build_object(
      'taxable',   coalesce((select taxable from out_totals), 0),
      'cgst',      coalesce((select cgst from out_totals), 0),
      'sgst',      coalesce((select sgst from out_totals), 0),
      'igst',      coalesce((select igst from out_totals), 0),
      'total_gst', coalesce((select total_gst from out_totals), 0),
      'slabs',     coalesce((select jsonb_agg(jsonb_build_object(
                     'gst_rate', gst_rate, 'transactions', transactions,
                     'taxable_amount', taxable_amount, 'cgst', cgst, 'sgst', sgst, 'igst', igst, 'total_gst', total_gst
                   ) order by gst_rate) from out_slabs), '[]'::jsonb)
    ),
    'input', jsonb_build_object(
      'taxable',   coalesce((select taxable from in_totals), 0),
      'cgst',      coalesce((select cgst from in_totals), 0),
      'sgst',      coalesce((select sgst from in_totals), 0),
      'igst',      coalesce((select igst from in_totals), 0),
      'total_gst', coalesce((select total_gst from in_totals), 0),
      'slabs',     coalesce((select jsonb_agg(jsonb_build_object(
                     'gst_rate', gst_rate, 'transactions', transactions,
                     'taxable_amount', taxable_amount, 'cgst', cgst, 'sgst', sgst, 'igst', igst, 'total_gst', total_gst
                   ) order by gst_rate) from in_slabs), '[]'::jsonb)
    ),
    'sr_gst',          (select gst from sr_totals),
    'sr_taxable',      (select taxable from sr_totals),
    'pr_gst',          (select gst from pr_totals),
    'pr_taxable',      (select taxable from pr_totals),
    'net_output_gst',  coalesce((select total_gst from out_totals), 0) - (select gst from sr_totals),
    'net_itc',         coalesce((select total_gst from in_totals), 0) - (select gst from pr_totals),
    'net_payable',     (coalesce((select total_gst from out_totals), 0) - (select gst from sr_totals))
                     - (coalesce((select total_gst from in_totals), 0) - (select gst from pr_totals))
  ) into v_result;

  return v_result;
end;
$$;

-- ─── Doctor Prescriptions Report ────────────────────────────────────────────
create or replace function rpc_report_doctors(
  p_store_id uuid,
  p_from     date default null,
  p_to       date default null
)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_from date := coalesce(p_from, '2000-01-01'::date);
  v_to   date := coalesce(p_to, current_date);
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  with
    all_sales as (
      select count(*) as total_sales from sales
      where store_id = p_store_id and bill_date between v_from and v_to and deleted_at is null
    ),
    rx_sales as (
      select count(*) as rx_count, sum(total_amount) as rx_revenue
      from sales
      where store_id = p_store_id and bill_date between v_from and v_to
        and deleted_at is null and doctor_id is not null and is_prescription_sale = true
    ),
    doctor_revenue_cte as (
      -- aggregate revenue per doctor via a separate CTE (not joining sale_items to avoid fan-out)
      select
        s.doctor_id,
        count(s.id)        as sale_count,
        sum(s.total_amount) as revenue
      from sales s
      where s.store_id = p_store_id and s.bill_date between v_from and v_to
        and s.deleted_at is null and s.doctor_id is not null
      group by s.doctor_id
    ),
    doctor_profit_cte as (
      -- gross profit per doctor via sale_items
      select
        s.doctor_id,
        sum(si.quantity * (
          si.mrp - case when m.sale_unit_mode = 'both' and m.units_per_pack > 1
                        then b.purchase_rate / m.units_per_pack
                        else b.purchase_rate
                   end
        )) as gross_profit
      from sales s
      join sale_items si on si.sale_id = s.id
      left join batches b on b.id = si.batch_id
      left join medicines m on m.id = si.medicine_id
      where s.store_id = p_store_id and s.bill_date between v_from and v_to
        and s.deleted_at is null and s.doctor_id is not null
      group by s.doctor_id
    ),
    doctor_stats as (
      select
        d.id               as doctor_id,
        d.name             as doctor_name,
        d.commission_type,
        d.commission_rate,
        dr.sale_count,
        dr.revenue,
        coalesce(dp.gross_profit, 0) as gross_profit,
        case d.commission_type
          when 'percentage' then dr.revenue * d.commission_rate / 100
          when 'fixed'      then d.commission_rate * dr.sale_count
          else 0
        end                as commission_earned
      from doctor_revenue_cte dr
      join doctors d on d.id = dr.doctor_id
      left join doctor_profit_cte dp on dp.doctor_id = dr.doctor_id
    )
  select jsonb_build_object(
    'period', jsonb_build_object('from', v_from, 'to', v_to),
    'total_sales',               (select total_sales from all_sales),
    'prescription_count',        (select rx_count from rx_sales),
    'prescription_revenue',      coalesce((select rx_revenue from rx_sales), 0),
    'prescription_share',        case when (select total_sales from all_sales) > 0
                                   then round((select rx_count from rx_sales)::numeric
                                            / (select total_sales from all_sales) * 100, 1)
                                   else 0
                                 end,
    'total_commission_earned',   (select coalesce(sum(commission_earned), 0) from doctor_stats),
    'total_gross_profit',        (select coalesce(sum(gross_profit), 0) from doctor_stats),
    'total_net_profit',          (select coalesce(sum(gross_profit - commission_earned), 0) from doctor_stats),
    'doctors', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'doctor_id',         doctor_id,
        'doctor_name',       doctor_name,
        'commission_type',   commission_type,
        'commission_rate',   commission_rate,
        'sale_count',        sale_count,
        'revenue',           revenue,
        'gross_profit',      gross_profit,
        'commission_earned', commission_earned,
        'net_profit',        gross_profit - commission_earned
      ) order by revenue desc), '[]'::jsonb)
      from doctor_stats
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ─── Daily / Sales Report ───────────────────────────────────────────────────
-- Returns a composite daily-range summary
create or replace function rpc_report_daily(
  p_store_id uuid,
  p_from     date,
  p_to       date
)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  with
    sales_agg as (
      select
        count(*)            as bill_count,
        sum(total_amount)   as gross_sales,
        sum(paid_amount)    as total_paid,
        sum(gst_amount)     as total_gst,
        sum(cgst_amount)    as cgst,
        sum(sgst_amount)    as sgst,
        sum(igst_amount)    as igst,
        count(distinct customer_id) filter (where customer_id is not null) as customer_count,
        sum(total_amount - paid_amount) as credit_extended
      from sales
      where store_id = p_store_id and bill_date between p_from and p_to and deleted_at is null
    ),
    returns_agg as (
      select
        count(*)          as returns_count,
        sum(total_amount) as returns_total
      from sale_returns
      where store_id = p_store_id and return_date between p_from and p_to
    ),
    purchases_agg as (
      select count(*) as purchases_count, sum(total_amount) as purchases_total
      from purchases
      where store_id = p_store_id and bill_date between p_from and p_to
    ),
    expenses_agg as (
      select coalesce(sum(amount), 0) as expenses_total
      from expenses
      where store_id = p_store_id and expense_date between p_from and p_to
    ),
    payments_agg as (
      select
        coalesce(sum(amount) filter (where transaction_type = 'payment'), 0) as customer_payments
      from customer_ledgers
      where store_id = p_store_id and created_at::date between p_from and p_to
    ),
    gross_profit_cte as (
      select
        sum(si.quantity * (
          si.mrp - case when m.sale_unit_mode = 'both' and m.units_per_pack > 1
                        then b.purchase_rate / m.units_per_pack
                        else coalesce(b.purchase_rate, 0)
                   end
        )) as gross_profit
      from sales s
      join sale_items si on si.sale_id = s.id
      left join batches b on b.id = si.batch_id
      left join medicines m on m.id = si.medicine_id
      where s.store_id = p_store_id and s.bill_date between p_from and p_to and s.deleted_at is null
    ),
    top_meds as (
      select
        m.id as medicine_id, m.name, m.manufacturer,
        sum(si.quantity) as qty_sold,
        count(distinct si.sale_id) as bills,
        sum(si.total_amount) as revenue
      from sale_items si
      join sales s on s.id = si.sale_id and s.store_id = p_store_id
        and s.bill_date between p_from and p_to and s.deleted_at is null
      left join medicines m on m.id = si.medicine_id
      where si.medicine_id is not null
      group by m.id, m.name, m.manufacturer
      order by revenue desc
      limit 10
    ),
    daily_rows as (
      select
        s.bill_date as day,
        count(*) as bill_count,
        sum(s.total_amount) as gross_sales,
        coalesce((select sum(r.total_amount) from sale_returns r where r.store_id = p_store_id and r.return_date = s.bill_date), 0) as returns_total
      from sales s
      where s.store_id = p_store_id and s.bill_date between p_from and p_to and s.deleted_at is null
      group by s.bill_date
      order by s.bill_date
    ),
    payment_method_agg as (
      select
        coalesce(payment_method, 'other') as method,
        sum(paid_amount) as amount,
        count(*) as cnt
      from sales
      where store_id = p_store_id and bill_date between p_from and p_to and deleted_at is null
      group by payment_method
    )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'bill_count',      (select bill_count from sales_agg),
    'gross_sales',     (select gross_sales from sales_agg),
    'total_paid',      (select total_paid from sales_agg),
    'total_gst',       (select total_gst from sales_agg),
    'cgst',            (select cgst from sales_agg),
    'sgst',            (select sgst from sales_agg),
    'igst',            (select igst from sales_agg),
    'customer_count',  (select customer_count from sales_agg),
    'credit_extended', (select credit_extended from sales_agg),
    'avg_bill_value',  case when (select bill_count from sales_agg) > 0
                         then round((select gross_sales from sales_agg) / (select bill_count from sales_agg), 2)
                         else 0 end,
    'returns_count',   (select returns_count from returns_agg),
    'returns_total',   (select returns_total from returns_agg),
    'net_sales',       greatest(0, (select gross_sales from sales_agg) - coalesce((select returns_total from returns_agg), 0)),
    'gross_profit',    (select coalesce(gross_profit, 0) from gross_profit_cte),
    'expenses_total',  (select expenses_total from expenses_agg),
    'net_profit',      (select coalesce(gross_profit, 0) from gross_profit_cte) - (select expenses_total from expenses_agg),
    'purchases_count', (select purchases_count from purchases_agg),
    'purchases_total', (select purchases_total from purchases_agg),
    'customer_payments_total', (select customer_payments from payments_agg),
    'top_medicines',   coalesce((select jsonb_agg(jsonb_build_object(
                         'medicine_id', medicine_id, 'name', name, 'manufacturer', manufacturer,
                         'qty_sold', qty_sold, 'bills', bills, 'revenue', revenue
                       )) from top_meds), '[]'::jsonb),
    'daily_breakdown', coalesce((select jsonb_agg(jsonb_build_object(
                         'day', day::text, 'bill_count', bill_count,
                         'gross_sales', gross_sales, 'returns_total', returns_total,
                         'net_sales', greatest(0, gross_sales - returns_total)
                       )) from daily_rows), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
                         'method', method, 'amount', amount, 'cnt', cnt
                       )) from payment_method_agg), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
