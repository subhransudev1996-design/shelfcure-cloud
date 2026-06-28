-- ShelfCure Cloud — Migration 0073
-- Fix "column pi.batch_id does not exist" in rpc_get_purchase_detail.
--
-- purchase_items has never had a batch_id column (see migration 0005) — the
-- relationship runs the other way: batches.purchase_item_id references
-- purchase_items.id. Migration 0034 joined on the nonexistent
-- `b.id = pi.batch_id`, which made every call to rpc_get_purchase_detail
-- raise 42703, surfacing as a 404 on /dashboard/purchases/[id] for every
-- purchase. Fixed by joining on `b.purchase_item_id = pi.id` instead.
--
-- Note: rpc_soft_delete_purchase (also in migration 0034) and several RPCs
-- in migrations 0042/0044 have the same `pi.batch_id` mistake — out of scope
-- for this fix, tracked separately.

create or replace function public.rpc_get_purchase_detail(p_purchase_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_p jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select jsonb_build_object(
    'purchase', to_jsonb(p.*)
      || jsonb_build_object(
           'supplier_name',  sup.name,
           'supplier_gstin', sup.gstin,
           'store_name',     st.name,
           'store_code',     st.code
         ),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',                  pi.id,
        'medicine_id',         pi.medicine_id,
        'medicine_name',       m.name,
        'batch_id',            b.id,
        'batch_number',        b.batch_number,
        'expiry_date',         b.expiry_date,
        'quantity',            pi.quantity,
        'free_quantity',       coalesce(pi.free_quantity, 0),
        'returned_quantity',   pi.returned_quantity,
        'purchase_rate',       pi.purchase_rate,
        'mrp',                 pi.mrp,
        'gst_percentage',      pi.gst_percentage,
        'discount_percentage', pi.discount_percentage,
        'amount',              pi.amount,
        'sale_unit_mode',      m.sale_unit_mode,
        'units_per_pack',      m.units_per_pack
      ) order by pi.id), '[]'::jsonb)
      from public.purchase_items pi
      left join public.medicines m on m.id = pi.medicine_id
      left join public.batches   b on b.purchase_item_id = pi.id
      where pi.purchase_id = p.id
    )
  ) into v_p
  from public.purchases p
  join  public.stores   st  on st.id  = p.store_id
  left join public.suppliers sup on sup.id = p.supplier_id
  where p.id = p_purchase_id
    and public.user_has_store_access(p.store_id);

  if v_p is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return v_p;
end;
$$;

revoke all on function public.rpc_get_purchase_detail(uuid) from public;
grant execute on function public.rpc_get_purchase_detail(uuid) to authenticated;
