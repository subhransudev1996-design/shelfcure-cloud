-- ShelfCure Cloud — Migration 0040
-- §2.4 Returns: rpc_list_returns, rpc_get_return_detail, rpc_pos_quick_bill_finder

-- ============================================================================
-- rpc_list_returns — paginated list for the Returns page
-- ============================================================================

create or replace function public.rpc_list_returns(
  p_store_id uuid,
  p_from     date    default null,
  p_to       date    default null,
  p_limit    integer default 100,
  p_offset   integer default 0
)
returns table (
  id               uuid,
  return_number    text,
  return_date      date,
  bill_number      text,
  sale_id          uuid,
  customer_id      uuid,
  customer_name    text,
  item_count       integer,
  total_amount     numeric,
  refund_method    text,
  created_by_name  text,
  created_at       timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_lim integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_off integer := greatest(0, coalesce(p_offset, 0));
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  return query
  select
    sr.id,
    sr.return_number,
    sr.return_date,
    s.bill_number,
    sr.sale_id,
    sr.customer_id,
    coalesce(c.name, 'Walk-in'),
    (select count(*)::integer from public.sale_return_items sri where sri.sale_return_id = sr.id),
    sr.total_amount,
    sr.refund_method,
    coalesce(up.full_name, ''),
    sr.created_at
  from public.sale_returns sr
  join public.sales s on s.id = sr.sale_id
  left join public.customers c on c.id = sr.customer_id
  left join public.user_profiles up on up.id = sr.created_by
  where sr.store_id = p_store_id
    and (p_from is null or sr.return_date >= p_from)
    and (p_to   is null or sr.return_date <= p_to)
  order by sr.return_date desc, sr.created_at desc
  limit v_lim offset v_off;
end;
$$;

revoke all on function public.rpc_list_returns(uuid, date, date, integer, integer) from public;
grant execute on function public.rpc_list_returns(uuid, date, date, integer, integer) to authenticated;

-- ============================================================================
-- rpc_get_return_detail — single return with items for the detail page
-- ============================================================================

create or replace function public.rpc_get_return_detail(p_return_id uuid)
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

  select jsonb_build_object(
    'return_record', jsonb_build_object(
      'id',                  sr.id,
      'return_number',       sr.return_number,
      'return_date',         sr.return_date,
      'created_at',          sr.created_at,
      'bill_number',         s.bill_number,
      'sale_id',             sr.sale_id,
      'original_sale_date',  s.created_at,
      'original_bill_date',  s.bill_date,
      'customer_id',         sr.customer_id,
      'customer_name',       coalesce(c.name, 'Walk-in'),
      'customer_phone',      c.phone,
      'subtotal',            sr.subtotal,
      'total_amount',        sr.total_amount,
      'refund_method',       sr.refund_method,
      'reason',              sr.reason,
      'processed_by_id',     sr.created_by,
      'processed_by_name',   coalesce(up.full_name, ''),
      'store_name',          st.name,
      'store_code',          st.code,
      'store_address',       st.address,
      'store_phone',         st.phone,
      'store_gstin',         st.gstin,
      'store_drug_license',  st.drug_license_no
    ),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',            sri.id,
        'medicine_name', coalesce(m.name, 'Item'),
        'batch_number',  b.batch_number,
        'expiry_date',   b.expiry_date,
        'hsn_code',      m.hsn_code,
        'quantity',      sri.quantity,
        'mrp',           si.mrp,
        'units_per_pack',m.units_per_pack,
        'sale_unit_mode',m.sale_unit_mode,
        'amount',        sri.amount
      ) order by sri.id), '[]'::jsonb)
      from public.sale_return_items sri
      left join public.sale_items si on si.id = sri.sale_item_id
      left join public.medicines m on m.id = sri.medicine_id
      left join public.batches b on b.id = sri.batch_id
      where sri.sale_return_id = sr.id
    )
  ) into v_result
  from public.sale_returns sr
  join public.sales s on s.id = sr.sale_id
  join public.stores st on st.id = sr.store_id
  left join public.customers c on c.id = sr.customer_id
  left join public.user_profiles up on up.id = sr.created_by
  where sr.id = p_return_id
    and public.user_has_store_access(sr.store_id);

  if v_result is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return v_result;
end;
$$;

revoke all on function public.rpc_get_return_detail(uuid) from public;
grant execute on function public.rpc_get_return_detail(uuid) to authenticated;

-- ============================================================================
-- rpc_pos_quick_bill_finder — find bills by medicine name (QuickBillFinder)
-- Returns at most 10 recent bills that contain an item matching the query.
-- ============================================================================

create or replace function public.rpc_pos_quick_bill_finder(p_store_id uuid, p_query text)
returns table (
  sale_id      uuid,
  bill_number  text,
  bill_date    date,
  customer_name text,
  total_amount numeric,
  medicine_snippet text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  return query
  select distinct on (s.id)
    s.id as sale_id,
    s.bill_number,
    s.bill_date,
    coalesce(c.name, 'Walk-in') as customer_name,
    s.total_amount,
    m.name as medicine_snippet
  from public.sales s
  join public.sale_items si on si.sale_id = s.id
  join public.medicines m on m.id = si.medicine_id
  left join public.customers c on c.id = s.customer_id
  where s.store_id = p_store_id
    and s.deleted_at is null
    and s.is_fully_returned = false
    and m.name ilike '%' || p_query || '%'
    and s.bill_date >= current_date - 30
  order by s.id, s.created_at desc
  limit 10;
end;
$$;

revoke all on function public.rpc_pos_quick_bill_finder(uuid, text) from public;
grant execute on function public.rpc_pos_quick_bill_finder(uuid, text) to authenticated;
