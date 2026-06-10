-- ShelfCure Cloud — Migration 0031
-- Phase 2.6.6 — Purchase Orders (reorders).
--
-- Tables `purchase_orders` / `purchase_order_items` already exist (migration
-- 0005) with select/insert/update RLS in place. This migration adds the RPC
-- surface mirroring desktop's purchase_orders.rs:
--   rpc_list_purchase_orders(store_id, status?)
--   rpc_get_purchase_order(po_id) -> { order, items }
--   rpc_create_purchase_order(payload) -> po_id
--   rpc_mark_purchase_order_fulfilled(po_id, purchase_id)

-- ============================================================================
-- rpc_list_purchase_orders
-- ============================================================================

create or replace function public.rpc_list_purchase_orders(
  p_store_id uuid,
  p_status   text default 'pending'
)
returns table (
  id                 uuid,
  supplier_id        uuid,
  supplier_name      text,
  order_date         date,
  status             text,
  total_items        bigint,
  linked_purchase_id uuid,
  created_at         timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  return query
  select
    po.id,
    po.supplier_id,
    sup.name as supplier_name,
    po.order_date,
    po.status,
    (select count(*) from public.purchase_order_items poi where poi.po_id = po.id) as total_items,
    po.linked_purchase_id,
    po.created_at
  from public.purchase_orders po
  join public.suppliers sup on sup.id = po.supplier_id
  where po.store_id = p_store_id
    and (p_status is null or po.status = p_status)
  order by po.created_at desc;
end;
$$;

revoke all on function public.rpc_list_purchase_orders(uuid, text) from public;
grant execute on function public.rpc_list_purchase_orders(uuid, text) to authenticated;


-- ============================================================================
-- rpc_get_purchase_order
-- ============================================================================

create or replace function public.rpc_get_purchase_order(p_po_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_po record;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select po.* into v_po from public.purchase_orders po where po.id = p_po_id;
  if not found then raise exception 'not_found: purchase order' using errcode = 'P0002'; end if;
  if not public.user_has_store_access(v_po.store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'order', jsonb_build_object(
      'id', po.id,
      'store_id', po.store_id,
      'supplier_id', po.supplier_id,
      'supplier_name', sup.name,
      'order_date', po.order_date,
      'status', po.status,
      'linked_purchase_id', po.linked_purchase_id,
      'notes', po.notes,
      'total_items', (select count(*) from public.purchase_order_items poi where poi.po_id = po.id),
      'created_at', po.created_at
    ),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', poi.id,
        'medicine_id', poi.medicine_id,
        'medicine_name', m.name,
        'requested_quantity', poi.requested_quantity,
        'sale_unit_mode', m.sale_unit_mode,
        'units_per_pack', m.units_per_pack
      )), '[]'::jsonb)
      from public.purchase_order_items poi
      join public.medicines m on m.id = poi.medicine_id
      where poi.po_id = po.id
    )
  )
  into v_result
  from public.purchase_orders po
  join public.suppliers sup on sup.id = po.supplier_id
  where po.id = p_po_id;

  return v_result;
end;
$$;

revoke all on function public.rpc_get_purchase_order(uuid) from public;
grant execute on function public.rpc_get_purchase_order(uuid) to authenticated;


-- ============================================================================
-- rpc_create_purchase_order
-- ============================================================================

create or replace function public.rpc_create_purchase_order(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id   uuid := auth.uid();
  v_org_id    uuid;
  v_store_id  uuid;
  v_supplier_id uuid;
  v_po_id     uuid;
  v_item      jsonb;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  v_store_id    := (p_payload->>'store_id')::uuid;
  v_supplier_id := (p_payload->>'supplier_id')::uuid;
  v_org_id      := public.current_org();

  if v_store_id is null or v_supplier_id is null then
    raise exception 'missing_required_field' using errcode = '23502';
  end if;
  if public.user_role() not in ('super_admin','store_admin','pharmacist') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not public.user_has_store_access(v_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  insert into public.purchase_orders (
    org_id, store_id, supplier_id, order_date, status, notes, created_by
  ) values (
    v_org_id, v_store_id, v_supplier_id, current_date, 'pending',
    p_payload->>'notes', v_user_id
  )
  returning id into v_po_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) loop
    insert into public.purchase_order_items (
      org_id, po_id, medicine_id, requested_quantity
    ) values (
      v_org_id, v_po_id,
      (v_item->>'medicine_id')::uuid,
      coalesce((v_item->>'requested_quantity')::int, 1)
    );
  end loop;

  perform public.log_audit(v_org_id, v_store_id, 'purchase_orders', v_po_id::text, 'insert',
    jsonb_build_object('supplier_id', v_supplier_id::text));

  return v_po_id;
end;
$$;

revoke all on function public.rpc_create_purchase_order(jsonb) from public;
grant execute on function public.rpc_create_purchase_order(jsonb) to authenticated;


-- ============================================================================
-- rpc_mark_purchase_order_fulfilled
-- ============================================================================

create or replace function public.rpc_mark_purchase_order_fulfilled(p_po_id uuid, p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po record;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select * into v_po from public.purchase_orders where id = p_po_id;
  if not found then raise exception 'not_found: purchase order' using errcode = 'P0002'; end if;
  if not public.user_has_store_access(v_po.store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;
  if public.user_role() not in ('super_admin','store_admin','pharmacist') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  update public.purchase_orders
  set status = 'fulfilled',
      linked_purchase_id = p_purchase_id,
      version = version + 1
  where id = p_po_id;

  perform public.log_audit(v_po.org_id, v_po.store_id, 'purchase_orders', p_po_id::text, 'update',
    jsonb_build_object('status', 'fulfilled', 'linked_purchase_id', p_purchase_id::text));
end;
$$;

revoke all on function public.rpc_mark_purchase_order_fulfilled(uuid, uuid) from public;
grant execute on function public.rpc_mark_purchase_order_fulfilled(uuid, uuid) to authenticated;
