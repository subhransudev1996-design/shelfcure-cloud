-- ShelfCure Cloud — Migration 0055
-- §2.11.13/2.11.14 GST Summary fixes + Annual GST (GSTR-9).
--
-- rpc_report_gst_monthly (migration 44) had three real bugs:
--   1. No user_has_store_access check — any authenticated user could read
--      another org's GST data by passing an arbitrary p_store_id.
--   2. Missing deleted_at filters on purchases/sale_returns/purchase_returns
--      — soft-deleted records still counted.
--   3. in_slabs referenced purchase_items.taxable_amount/cgst_amount/
--      sgst_amount/igst_amount, which DO NOT EXIST on that table (only
--      gst_percentage + amount are stored per line; the bill-level GST
--      split lives on `purchases`, not per line). Because plpgsql doesn't
--      validate a function body against the catalog until it actually
--      runs, this shipped silently broken — every single call to this RPC
--      throws "column pi.taxable_amount does not exist" at execution time.
--
-- Fix for #3: the purchase intake form (purchase-client.tsx) stores each
-- line's GROSS (GST-inclusive) total in purchase_items.amount (confirmed
-- by reading packages/core/src/bill-math.ts: BillLineOutput.amount is the
-- "gross (printed line total)"), so taxable/gst can be reverse-extracted
-- per line as amount / (1 + gst_percentage/100). The CGST+SGST vs IGST
-- split isn't stored per line either, but each purchase bill is uniformly
-- intra- or inter-state (single gstType toggle in the form), so the split
-- is read off the parent purchases row (igst_amount > 0 => inter-state).
--
-- Also adds the out_b2b_taxable/out_b2c_taxable split (keyed on
-- sales.customer_gstin being present) that the spec calls for and was
-- missing entirely, and the previously-unbuilt rpc_report_gst_annual.

create or replace function rpc_report_gst_monthly(
  p_store_id uuid,
  p_month    int,
  p_year     int
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_from date := make_date(p_year, p_month, 1);
  v_to   date := (v_from + interval '1 month' - interval '1 day')::date;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  with
    -- Output (sales) — sale_items already carries the per-line GST split.
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
    out_b2b_b2c as (
      select
        sum(si.taxable_amount) filter (where coalesce(trim(s.customer_gstin), '') <> '') as b2b_taxable,
        sum(si.taxable_amount) filter (where coalesce(trim(s.customer_gstin), '') = '')  as b2c_taxable
      from sale_items si
      join sales s on s.id = si.sale_id and s.store_id = p_store_id
        and s.bill_date between v_from and v_to and s.deleted_at is null
    ),
    -- Input (purchases) — purchase_items only stores gst_percentage + the
    -- gross line amount, so taxable/gst is reverse-extracted per line; the
    -- CGST+SGST-vs-IGST split is read off the parent bill (uniform per bill).
    in_lines as (
      select
        pi.gst_percentage::numeric as gst_rate,
        p.id as purchase_id,
        (p.igst_amount > 0) as is_interstate,
        round(pi.amount / (1 + pi.gst_percentage / 100.0), 2) as line_taxable,
        pi.amount - round(pi.amount / (1 + pi.gst_percentage / 100.0), 2) as line_gst
      from purchase_items pi
      join purchases p on p.id = pi.purchase_id and p.store_id = p_store_id
        and p.deleted_at is null and p.bill_date between v_from and v_to
    ),
    in_slabs as (
      select
        gst_rate,
        count(distinct purchase_id) as transactions,
        sum(line_taxable) as taxable_amount,
        sum(case when is_interstate then 0 else line_gst / 2 end) as cgst,
        sum(case when is_interstate then 0 else line_gst / 2 end) as sgst,
        sum(case when is_interstate then line_gst else 0 end)     as igst,
        sum(line_gst) as total_gst
      from in_lines
      group by gst_rate
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
      where sr.store_id = p_store_id and sr.deleted_at is null
        and sr.return_date between v_from and v_to
    ),
    -- Purchase returns (reduces ITC)
    pr_totals as (
      select
        coalesce(sum(pr.gst_amount), 0) as gst,
        coalesce(sum(pr.subtotal), 0)   as taxable
      from purchase_returns pr
      where pr.store_id = p_store_id and pr.deleted_at is null
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
      'b2b_taxable', coalesce((select b2b_taxable from out_b2b_b2c), 0),
      'b2c_taxable', coalesce((select b2c_taxable from out_b2b_b2c), 0),
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

-- ============================================================================
-- rpc_report_gst_annual — whole financial-year roll-up (GSTR-9-ready).
-- p_fin_year is the FY's starting calendar year (e.g. 2025 for "FY 2025-26",
-- spanning 2025-04-01 to 2026-03-31).
-- ============================================================================

create or replace function rpc_report_gst_annual(
  p_store_id  uuid,
  p_fin_year  int
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_from date := make_date(p_fin_year, 4, 1);
  v_to   date := make_date(p_fin_year + 1, 3, 31);
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  with
    out_agg as (
      select
        sum(si.taxable_amount) as taxable,
        sum(si.cgst_amount)    as cgst,
        sum(si.sgst_amount)    as sgst,
        sum(si.igst_amount)    as igst,
        sum(si.cgst_amount + si.sgst_amount + si.igst_amount) as total_gst,
        sum(si.taxable_amount) filter (where coalesce(trim(s.customer_gstin), '') <> '') as b2b_taxable,
        sum(si.taxable_amount) filter (where coalesce(trim(s.customer_gstin), '') = '')  as b2c_taxable
      from sale_items si
      join sales s on s.id = si.sale_id and s.store_id = p_store_id
        and s.bill_date between v_from and v_to and s.deleted_at is null
    ),
    in_lines as (
      select
        round(pi.amount / (1 + pi.gst_percentage / 100.0), 2) as line_taxable,
        pi.amount - round(pi.amount / (1 + pi.gst_percentage / 100.0), 2) as line_gst,
        (p.igst_amount > 0) as is_interstate
      from purchase_items pi
      join purchases p on p.id = pi.purchase_id and p.store_id = p_store_id
        and p.deleted_at is null and p.bill_date between v_from and v_to
    ),
    in_agg as (
      select
        coalesce(sum(line_taxable), 0) as taxable,
        coalesce(sum(case when is_interstate then 0 else line_gst / 2 end), 0) as cgst,
        coalesce(sum(case when is_interstate then 0 else line_gst / 2 end), 0) as sgst,
        coalesce(sum(case when is_interstate then line_gst else 0 end), 0)     as igst,
        coalesce(sum(line_gst), 0) as total_gst
      from in_lines
    ),
    sr_agg as (
      select coalesce(sum(gst_amount), 0) as gst, coalesce(sum(subtotal), 0) as taxable
      from sale_returns
      where store_id = p_store_id and deleted_at is null and return_date between v_from and v_to
    ),
    pr_agg as (
      select coalesce(sum(gst_amount), 0) as gst, coalesce(sum(subtotal), 0) as taxable
      from purchase_returns
      where store_id = p_store_id and deleted_at is null and return_date between v_from and v_to
    ),
    months as (
      select (v_from + (g * interval '1 month'))::date as month_start
      from generate_series(0, 11) as g
    ),
    monthly_cte as (
      select
        ms.month_start,
        (ms.month_start + interval '1 month' - interval '1 day')::date as month_end,
        coalesce((
          select sum(si.cgst_amount + si.sgst_amount + si.igst_amount)
          from sale_items si join sales s on s.id = si.sale_id
          where s.store_id = p_store_id and s.deleted_at is null
            and s.bill_date >= ms.month_start
            and s.bill_date <= (ms.month_start + interval '1 month' - interval '1 day')::date
        ), 0) as out_total_gst,
        coalesce((
          select sum(pi.amount - round(pi.amount / (1 + pi.gst_percentage / 100.0), 2))
          from purchase_items pi join purchases p on p.id = pi.purchase_id
          where p.store_id = p_store_id and p.deleted_at is null
            and p.bill_date >= ms.month_start
            and p.bill_date <= (ms.month_start + interval '1 month' - interval '1 day')::date
        ), 0) as in_total_gst,
        coalesce((
          select sum(gst_amount) from sale_returns
          where store_id = p_store_id and deleted_at is null
            and return_date >= ms.month_start
            and return_date <= (ms.month_start + interval '1 month' - interval '1 day')::date
        ), 0) as sr_gst,
        coalesce((
          select sum(gst_amount) from purchase_returns
          where store_id = p_store_id and deleted_at is null
            and return_date >= ms.month_start
            and return_date <= (ms.month_start + interval '1 month' - interval '1 day')::date
        ), 0) as pr_gst
      from months ms
    )
  select jsonb_build_object(
    'fin_year', p_fin_year,
    'period', jsonb_build_object('from', v_from, 'to', v_to),
    'out_taxable',      coalesce((select taxable from out_agg), 0),
    'out_cgst',         coalesce((select cgst from out_agg), 0),
    'out_sgst',         coalesce((select sgst from out_agg), 0),
    'out_igst',         coalesce((select igst from out_agg), 0),
    'out_total_gst',    coalesce((select total_gst from out_agg), 0),
    'out_b2b_taxable',  coalesce((select b2b_taxable from out_agg), 0),
    'out_b2c_taxable',  coalesce((select b2c_taxable from out_agg), 0),
    'in_taxable',       (select taxable from in_agg),
    'in_cgst',          (select cgst from in_agg),
    'in_sgst',          (select sgst from in_agg),
    'in_igst',          (select igst from in_agg),
    'in_total_gst',     (select total_gst from in_agg),
    'sr_gst',           (select gst from sr_agg),
    'sr_taxable',       (select taxable from sr_agg),
    'pr_gst',           (select gst from pr_agg),
    'pr_taxable',       (select taxable from pr_agg),
    'net_output_gst',   coalesce((select total_gst from out_agg), 0) - (select gst from sr_agg),
    'net_itc',          (select total_gst from in_agg) - (select gst from pr_agg),
    'net_payable',      (coalesce((select total_gst from out_agg), 0) - (select gst from sr_agg))
                       - ((select total_gst from in_agg) - (select gst from pr_agg)),
    'monthly_rows', coalesce((select jsonb_agg(jsonb_build_object(
                       'month', to_char(month_start, 'Mon YYYY'),
                       'out_total_gst', out_total_gst,
                       'in_total_gst', in_total_gst,
                       'net_payable', (out_total_gst - sr_gst) - (in_total_gst - pr_gst)
                     ) order by month_start) from monthly_cte), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function rpc_report_gst_annual(uuid, int) from public;
grant execute on function rpc_report_gst_annual(uuid, int) to authenticated;
