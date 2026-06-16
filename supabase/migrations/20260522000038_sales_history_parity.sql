-- ShelfCure Cloud — Migration 0038
-- §2.3 Sales History: extend rpc_list_sales with source, is_fully_returned,
-- is_modified, item_count; extend rpc_get_sale_detail with profit/misc/modified fields.

-- ============================================================================
-- rpc_list_sales — extended with §2.3 parity fields
-- DROP required because Postgres cannot change a RETURNS TABLE signature in place.
-- ============================================================================

drop function if exists public.rpc_list_sales(uuid, date, date, integer, integer);

create function public.rpc_list_sales(
  p_store_id uuid,
  p_from     date    default null,
  p_to       date    default null,
  p_limit    integer default 50,
  p_offset   integer default 0
)
returns table (
  id                 uuid,
  bill_number        text,
  bill_date          date,
  customer_id        uuid,
  customer_name      text,
  total_amount       numeric,
  payment_method     text,
  payment_status     text,
  is_returned        boolean,
  is_fully_returned  boolean,
  is_modified        boolean,
  source             text,
  item_count         integer,
  created_at         timestamptz,
  created_by_name    text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
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
    s.id,
    s.bill_number,
    s.bill_date,
    s.customer_id,
    coalesce(c.name, 'Walk-in'),
    s.total_amount,
    s.payment_method,
    s.payment_status,
    s.is_returned,
    s.is_fully_returned,
    s.is_modified,
    s.source,
    (select count(*)::integer from public.sale_items si where si.sale_id = s.id and not si.is_misc_item) as item_count,
    s.created_at,
    coalesce(up.full_name, '')
  from public.sales s
  left join public.customers c on c.id = s.customer_id
  left join public.user_profiles up on up.id = s.created_by
  where s.store_id = p_store_id
    and s.deleted_at is null
    and (p_from is null or s.bill_date >= p_from)
    and (p_to   is null or s.bill_date <= p_to)
  order by s.bill_date desc, s.created_at desc
  limit v_lim offset v_off;
end;
$$;

revoke all on function public.rpc_list_sales(uuid, date, date, integer, integer) from public;
grant execute on function public.rpc_list_sales(uuid, date, date, integer, integer) to authenticated;
