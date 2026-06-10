-- ShelfCure Cloud — Migration 0018
-- rpc_pos_search_customers: fast customer search for the POS picker.
-- Returns active customers matching name OR phone in caller's org/store.

create or replace function public.rpc_pos_search_customers(
  p_store_id uuid,
  p_query    text,
  p_limit    integer default 8
)
returns table (
  id              uuid,
  name            text,
  phone           text,
  email           text,
  customer_type   text,
  gstin           text,
  state           text,
  outstanding     numeric
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
    c.outstanding_balance
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
