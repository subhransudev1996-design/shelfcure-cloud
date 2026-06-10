-- ShelfCure Cloud — Migration 0028
-- Extend rpc_pos_search_customers + add rpc_pos_get_customer to return the
-- per-customer special discount fields (type, value, label).
--
-- WHY: POS has three discount layers (per-line, bill, special). The special
-- discount is **read-only on the POS** and auto-populated from the selected
-- customer profile (customers.special_discount_type/value/label). Without
-- these in the search payload, the POS can't apply it.

-- Recreate search RPC with extended return shape.
drop function if exists public.rpc_pos_search_customers(uuid, text, integer);

create or replace function public.rpc_pos_search_customers(
  p_store_id uuid,
  p_query    text,
  p_limit    integer default 8
)
returns table (
  id                      uuid,
  name                    text,
  phone                   text,
  email                   text,
  customer_type           text,
  gstin                   text,
  state                   text,
  outstanding             numeric,
  special_discount_type   text,
  special_discount_value  numeric,
  special_discount_label  text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_org uuid := public.current_org();
  v_q   text := nullif(trim(coalesce(p_query, '')), '');
  v_lim integer := greatest(1, least(coalesce(p_limit, 8), 25));
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  return query
  select
    c.id, c.name, c.phone, c.email, c.customer_type, c.gstin, c.state,
    c.outstanding_balance,
    c.special_discount_type, c.special_discount_value, c.special_discount_label
  from public.customers c
  where c.org_id = v_org
    and c.deleted_at is null
    and c.is_active
    and (c.store_id is null or c.store_id = p_store_id)
    and (
      v_q is null
      or c.name ilike '%' || v_q || '%'
      or c.phone ilike '%' || v_q || '%'
    )
  order by
    case
      when v_q is not null and c.phone = v_q then 0
      when v_q is not null and c.name ilike v_q || '%' then 1
      else 2
    end,
    c.name asc
  limit v_lim;
end;
$$;

revoke all on function public.rpc_pos_search_customers(uuid, text, integer) from public;
grant execute on function public.rpc_pos_search_customers(uuid, text, integer) to authenticated;


-- Quick lookup for a single customer (used after quick-add / by ID) that
-- mirrors the search row shape.
create or replace function public.rpc_pos_get_customer(p_customer_id uuid)
returns table (
  id                      uuid,
  name                    text,
  phone                   text,
  email                   text,
  customer_type           text,
  gstin                   text,
  state                   text,
  outstanding             numeric,
  special_discount_type   text,
  special_discount_value  numeric,
  special_discount_label  text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_org uuid := public.current_org();
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  return query
  select
    c.id, c.name, c.phone, c.email, c.customer_type, c.gstin, c.state,
    c.outstanding_balance,
    c.special_discount_type, c.special_discount_value, c.special_discount_label
  from public.customers c
  where c.id = p_customer_id
    and c.org_id = v_org
    and c.deleted_at is null;
end;
$$;

revoke all on function public.rpc_pos_get_customer(uuid) from public;
grant execute on function public.rpc_pos_get_customer(uuid) to authenticated;
