-- =============================================================================
-- Migration 0035 — Extend rpc_pos_search_medicines with sale_unit_mode +
-- units_per_pack so the purchase form can label qty correctly for flexible
-- strip-based medicines and do the units_per_pack × qty conversion on save.
-- =============================================================================

drop function if exists public.rpc_pos_search_medicines(uuid, text, integer);

create function public.rpc_pos_search_medicines(
  p_store_id uuid,
  p_query    text,
  p_limit    integer default 12
)
returns table (
  medicine_id      uuid,
  name             text,
  manufacturer     text,
  pack_size        integer,
  pack_unit        text,
  hsn_code         text,
  default_gst_rate numeric,
  batch_id         uuid,
  batch_number     text,
  expiry_date      date,
  mrp              numeric,
  selling_price    numeric,
  purchase_rate    numeric,
  gst_percentage   numeric,
  current_quantity integer,
  sale_unit_mode   text,
  units_per_pack   integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_org_id uuid := public.current_org();
  v_q      text := nullif(trim(coalesce(p_query, '')), '');
  v_lim    integer := greatest(1, least(coalesce(p_limit, 12), 50));
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  return query
  with org_meds as (
    select m.*
    from public.medicines m
    where m.org_id = v_org_id
      and m.deleted_at is null
      and (m.store_id is null or m.store_id = p_store_id)
  ),
  matched as (
    select om.*,
      case
        when v_q is null then 1.0
        when om.name ilike v_q || '%' then 1.0
        when om.barcode = v_q then 1.0
        when om.name ilike '%' || v_q || '%' then 0.7
        else extensions.similarity(om.name, v_q)
      end as score
    from org_meds om
    where v_q is null
       or om.name ilike '%' || v_q || '%'
       or om.barcode = v_q
       or extensions.similarity(om.name, v_q) > 0.2
  ),
  best_batch as (
    select distinct on (b.medicine_id)
      b.medicine_id,
      b.id as batch_id,
      b.batch_number, b.expiry_date,
      b.mrp, b.selling_price, b.purchase_rate,
      b.gst_percentage, b.current_quantity
    from public.batches b
    where b.store_id = p_store_id
      and b.deleted_at is null
      and b.is_blocked = false
      and b.current_quantity > 0
      and b.expiry_date >= current_date
    order by b.medicine_id, b.expiry_date asc, b.created_at asc
  )
  select
    m.id, m.name, m.manufacturer, m.pack_size, m.pack_unit, m.hsn_code, m.default_gst_rate,
    bb.batch_id, bb.batch_number, bb.expiry_date,
    bb.mrp, bb.selling_price, bb.purchase_rate,
    coalesce(bb.gst_percentage, m.default_gst_rate),
    coalesce(bb.current_quantity, 0),
    m.sale_unit_mode,
    m.units_per_pack
  from matched m
  left join best_batch bb on bb.medicine_id = m.id
  order by m.score desc, m.name asc
  limit v_lim;
end;
$$;

revoke all on function public.rpc_pos_search_medicines(uuid, text, integer) from public;
grant execute on function public.rpc_pos_search_medicines(uuid, text, integer) to authenticated;
