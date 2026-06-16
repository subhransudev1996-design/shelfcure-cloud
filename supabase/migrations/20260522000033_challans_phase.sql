-- ShelfCure Cloud — Migration 0033
-- Phase 2.6.7 — Delivery Challans.
--
-- Fixes two schema constraint mismatches vs. desktop, then adds all 6 RPCs:
--   rpc_create_challan       — Option B: immediate provisional stock + audit log
--   rpc_list_challans        — filterable list (status, supplier)
--   rpc_get_challan_detail   — per-item computed sold/returnable quantities
--   rpc_accept_challan       — convert items to real purchase bill, re-link batches
--   rpc_return_challan       — smart full-return with auto-accept-if-sold
--   rpc_pending_challan_count — dashboard badge count

-- ============================================================================
-- 1. Fix challans.status constraint
--    Current: ('pending','converted','partial_returned','returned','cancelled')
--    Desktop: ('pending','accepted','partially_accepted','returned','expired')
-- ============================================================================

alter table public.challans
  drop constraint if exists challans_status_check;
alter table public.challans
  add constraint challans_status_check
  check (status in ('pending','accepted','partially_accepted','returned','expired'));

-- ============================================================================
-- 2. Fix challan_items.status constraint — add 'partial'
--    Current: ('pending','accepted','returned')
--    Desktop: ('pending','accepted','returned','partial')
-- ============================================================================

alter table public.challan_items
  drop constraint if exists challan_items_status_check;
alter table public.challan_items
  add constraint challan_items_status_check
  check (status in ('pending','accepted','returned','partial'));

-- ============================================================================
-- 3. rpc_list_challans
-- ============================================================================

create or replace function public.rpc_list_challans(
  p_store_id    uuid,
  p_status      text default null,
  p_supplier_id uuid default null
)
returns table (
  id                   uuid,
  supplier_id          uuid,
  supplier_name        text,
  challan_number       text,
  challan_date         date,
  expected_return_date date,
  status               text,
  linked_purchase_id   uuid,
  total_items          integer,
  total_quantity       integer,
  notes                text,
  created_at           timestamptz
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
    c.id, c.supplier_id, s.name as supplier_name,
    c.challan_number, c.challan_date, c.expected_return_date,
    c.status, c.linked_purchase_id,
    c.total_items, c.total_quantity, c.notes, c.created_at
  from public.challans c
  left join public.suppliers s on s.id = c.supplier_id
  where c.store_id   = p_store_id
    and c.deleted_at is null
    and (p_status is null or c.status = p_status)
    and (p_supplier_id is null or c.supplier_id = p_supplier_id)
  order by c.created_at desc
  limit 200;
end;
$$;

revoke all on function public.rpc_list_challans(uuid, text, uuid) from public;
grant execute on function public.rpc_list_challans(uuid, text, uuid) to authenticated;

-- ============================================================================
-- 4. rpc_get_challan_detail
--    Per item computes: current_stock, sold_quantity, returnable_quantity
-- ============================================================================

create or replace function public.rpc_get_challan_detail(p_challan_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id  uuid := auth.uid();
  v_store_id uuid;
  v_challan  json;
  v_items    json;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select c.store_id into v_store_id
  from public.challans c
  where c.id = p_challan_id and c.deleted_at is null;

  if not found then
    raise exception 'not_found' using errcode = '02000';
  end if;
  if not public.user_has_store_access(v_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  select row_to_json(r) into v_challan from (
    select
      c.id, c.org_id, c.store_id, c.supplier_id, s.name as supplier_name,
      c.challan_number, c.challan_date, c.expected_return_date,
      c.status, c.linked_purchase_id,
      c.total_items, c.total_quantity, c.notes,
      c.created_at, c.updated_at
    from public.challans c
    left join public.suppliers s on s.id = c.supplier_id
    where c.id = p_challan_id
  ) r;

  select json_agg(row_to_json(r) order by r.created_at) into v_items from (
    select
      ci.id, ci.challan_id, ci.medicine_id, m.name as medicine_name,
      ci.batch_number, ci.expiry_date,
      ci.received_quantity, ci.accepted_quantity, ci.returned_quantity,
      ci.purchase_rate, ci.mrp, ci.gst_percentage, ci.status,
      ci.created_at,
      coalesce(b.current_quantity, 0)              as current_stock,
      coalesce(m.sale_unit_mode, 'pack_only')       as sale_unit_mode,
      coalesce(m.units_per_pack, 1)                 as units_per_pack,
      case
        when m.sale_unit_mode = 'both' and coalesce(m.units_per_pack, 1) > 1
        then ci.received_quantity * m.units_per_pack
        else ci.received_quantity
      end                                           as received_units,
      greatest(0,
        case
          when m.sale_unit_mode = 'both' and coalesce(m.units_per_pack, 1) > 1
          then ci.received_quantity * m.units_per_pack
          else ci.received_quantity
        end
        - coalesce(b.current_quantity, 0)
        - ci.returned_quantity
      )                                             as sold_quantity,
      least(
        coalesce(b.current_quantity, 0),
        case
          when m.sale_unit_mode = 'both' and coalesce(m.units_per_pack, 1) > 1
          then ci.received_quantity * m.units_per_pack
          else ci.received_quantity
        end
      )                                             as returnable_quantity
    from public.challan_items ci
    left join public.medicines m on m.id = ci.medicine_id
    left join public.batches   b on b.medicine_id  = ci.medicine_id
                                and b.batch_number = ci.batch_number
                                and b.store_id     = v_store_id
                                and b.challan_id   = p_challan_id
    where ci.challan_id = p_challan_id
  ) r;

  return json_build_object(
    'challan', v_challan,
    'items',   coalesce(v_items, '[]'::json)
  );
end;
$$;

revoke all on function public.rpc_get_challan_detail(uuid) from public;
grant execute on function public.rpc_get_challan_detail(uuid) to authenticated;

-- ============================================================================
-- 5. rpc_create_challan
--    Option B: immediately upserts provisional batches tagged challan_id.
--    received_quantity is in strips; batch stores raw units (strips * units_per_pack).
-- ============================================================================

create or replace function public.rpc_create_challan(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id        uuid := auth.uid();
  v_org_id         uuid;
  v_store_id       uuid;
  v_supplier_id    uuid;
  v_challan_id     uuid;
  v_item           jsonb;
  v_medicine_id    uuid;
  v_batch_id       uuid;
  v_recv_qty       integer;
  v_batch_qty      integer;
  v_qty_after      integer;
  v_units_per_pack integer;
  v_sale_unit_mode text;
  v_batch_number   text;
  v_expiry_date    date;
  v_total_items    integer;
  v_total_qty      integer;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  v_store_id    := (p_payload->>'store_id')::uuid;
  v_supplier_id := (p_payload->>'supplier_id')::uuid;

  if v_store_id is null or v_supplier_id is null then
    raise exception 'missing_required_field' using errcode = '23502';
  end if;
  if public.user_role() not in ('super_admin','store_admin','pharmacist') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not public.user_has_store_access(v_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  v_org_id := public.current_org();

  -- Header totals
  select
    count(*),
    coalesce(sum((it->>'received_quantity')::integer), 0)
  into v_total_items, v_total_qty
  from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb)) as it;

  -- Insert challan header
  insert into public.challans (
    org_id, store_id, supplier_id,
    challan_number, challan_date, expected_return_date,
    total_items, total_quantity, notes, created_by
  ) values (
    v_org_id, v_store_id, v_supplier_id,
    p_payload->>'challan_number',
    coalesce((p_payload->>'challan_date')::date, current_date),
    (p_payload->>'expected_return_date')::date,
    v_total_items, v_total_qty,
    p_payload->>'notes',
    v_user_id
  )
  returning id into v_challan_id;

  -- Process each line
  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb)) loop
    v_medicine_id := (v_item->>'medicine_id')::uuid;
    v_recv_qty    := coalesce((v_item->>'received_quantity')::integer, 0);

    v_batch_number := coalesce(
      nullif(trim(v_item->>'batch_number'), ''),
      'CHN-' || to_char(now(), 'YYYYMMDDHH24MISS')
    );
    v_expiry_date := coalesce(
      nullif(trim(v_item->>'expiry_date'), '')::date,
      (date_trunc('year', now() + interval '1 year'))::date + interval '1 year' - interval '1 day'
    );

    -- Strips → units conversion
    select
      coalesce(m.sale_unit_mode, 'pack_only'),
      coalesce(m.units_per_pack, 1)
    into v_sale_unit_mode, v_units_per_pack
    from public.medicines m where m.id = v_medicine_id;

    v_batch_qty := case
      when v_sale_unit_mode = 'both' and v_units_per_pack > 1
      then v_recv_qty * v_units_per_pack
      else v_recv_qty
    end;

    -- Insert challan_item (received_quantity stored in strips as entered)
    insert into public.challan_items (
      org_id, store_id, challan_id, medicine_id,
      batch_number, expiry_date, received_quantity,
      purchase_rate, mrp, gst_percentage
    ) values (
      v_org_id, v_store_id, v_challan_id, v_medicine_id,
      v_batch_number, v_expiry_date, v_recv_qty,
      coalesce((v_item->>'purchase_rate')::numeric, 0),
      coalesce((v_item->>'mrp')::numeric, 0),
      coalesce((v_item->>'gst_percentage')::numeric, 0)
    );

    -- Upsert provisional batch tagged with challan_id
    insert into public.batches (
      org_id, store_id, medicine_id, supplier_id,
      batch_number, expiry_date,
      initial_quantity, current_quantity,
      purchase_rate, mrp, gst_percentage,
      challan_id, updated_by
    ) values (
      v_org_id, v_store_id, v_medicine_id, v_supplier_id,
      v_batch_number, v_expiry_date,
      v_batch_qty, v_batch_qty,
      coalesce((v_item->>'purchase_rate')::numeric, 0),
      coalesce((v_item->>'mrp')::numeric, 0),
      coalesce((v_item->>'gst_percentage')::numeric, 0),
      v_challan_id, v_user_id
    )
    on conflict (store_id, medicine_id, batch_number)
    do update set
      current_quantity = public.batches.current_quantity + excluded.current_quantity,
      initial_quantity = public.batches.initial_quantity + excluded.initial_quantity,
      purchase_rate    = coalesce(excluded.purchase_rate, public.batches.purchase_rate),
      mrp              = coalesce(excluded.mrp, public.batches.mrp),
      expiry_date      = coalesce(excluded.expiry_date, public.batches.expiry_date),
      supplier_id      = coalesce(excluded.supplier_id, public.batches.supplier_id),
      challan_id       = excluded.challan_id,
      version          = public.batches.version + 1,
      updated_by       = excluded.updated_by
    returning id, current_quantity into v_batch_id, v_qty_after;

    -- Log provisional stock-in
    insert into public.inventory_transactions (
      org_id, store_id, batch_id, medicine_id,
      transaction_type, reference_type, reference_id,
      quantity_change, quantity_after, notes, created_by
    ) values (
      v_org_id, v_store_id, v_batch_id, v_medicine_id,
      'purchase', 'challan_provisional', v_challan_id,
      v_batch_qty, v_qty_after,
      'Challan #' || (p_payload->>'challan_number'), v_user_id
    );
  end loop;

  perform public.log_audit(
    v_org_id, v_store_id, 'challans', v_challan_id::text, 'insert',
    jsonb_build_object(
      'challan_number', p_payload->>'challan_number',
      'supplier_id',    v_supplier_id::text
    )
  );

  return v_challan_id;
end;
$$;

revoke all on function public.rpc_create_challan(jsonb) from public;
grant execute on function public.rpc_create_challan(jsonb) to authenticated;

-- ============================================================================
-- 6. rpc_accept_challan
--    Converts accepted portion to a real purchases bill.
--    Batches are re-linked (purchase_item_id set, challan_id cleared).
--    Returned portion is deducted from batch inventory.
-- ============================================================================

create or replace function public.rpc_accept_challan(p_payload jsonb)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id        uuid := auth.uid();
  v_org_id         uuid;
  v_store_id       uuid;
  v_challan_id     uuid;
  v_supplier_id    uuid;
  v_challan_number text;
  v_challan_date   date;
  v_challan_status text;
  v_item           jsonb;
  v_ci_id          uuid;
  v_medicine_id    uuid;
  v_batch_id       uuid;
  v_pi_id          uuid;
  v_purchase_id    uuid;
  v_recv_qty_raw   integer;
  v_recv_units     integer;
  v_batch_number   text;
  v_expiry_date    date;
  v_purchase_rate  numeric;
  v_mrp            numeric;
  v_gst_pct        numeric;
  v_units_per_pack integer;
  v_sale_unit_mode text;
  v_accepted       integer;
  v_returned       integer;
  v_current_stock  integer;
  v_qty_after      integer;
  v_item_status    text;
  v_actual_rate    numeric;
  v_base_amount    numeric;
  v_gst_amount     numeric;
  v_item_total     numeric;
  v_total_subtotal numeric := 0;
  v_total_gst      numeric := 0;
  v_paid_amount    numeric;
  v_net_payable    numeric;
  v_sup_balance    numeric;
  v_total_accepted integer;
  v_total_received integer;
  v_acc_items      jsonb := '[]'::jsonb;
  v_acc_row        record;
  v_bill_number    text;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  v_challan_id  := (p_payload->>'challan_id')::uuid;
  v_store_id    := (p_payload->>'store_id')::uuid;
  v_paid_amount := coalesce((p_payload->>'paid_amount')::numeric, 0);

  if v_challan_id is null or v_store_id is null then
    raise exception 'missing_required_field' using errcode = '23502';
  end if;
  if not public.user_has_store_access(v_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  v_org_id := public.current_org();

  -- Get challan + guard double-process
  select supplier_id, challan_number, challan_date, status
  into v_supplier_id, v_challan_number, v_challan_date, v_challan_status
  from public.challans
  where id = v_challan_id and store_id = v_store_id and deleted_at is null;

  if not found then
    raise exception 'not_found' using errcode = '02000';
  end if;
  if v_challan_status != 'pending' then
    raise exception 'challan_already_processed: status=%', v_challan_status
      using errcode = '23505';
  end if;

  -- Pass 1: per-item accept/return decisions
  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb)) loop
    v_ci_id    := (v_item->>'challan_item_id')::uuid;
    v_accepted := coalesce((v_item->>'accepted_quantity')::integer, 0);

    select ci.medicine_id, ci.batch_number, ci.expiry_date,
           ci.received_quantity, ci.purchase_rate, ci.mrp, ci.gst_percentage,
           coalesce(m.sale_unit_mode, 'pack_only'),
           coalesce(m.units_per_pack, 1)
    into v_medicine_id, v_batch_number, v_expiry_date,
         v_recv_qty_raw, v_purchase_rate, v_mrp, v_gst_pct,
         v_sale_unit_mode, v_units_per_pack
    from public.challan_items ci
    join public.medicines m on m.id = ci.medicine_id
    where ci.id = v_ci_id and ci.challan_id = v_challan_id;

    if not found then continue; end if;

    v_recv_units := case
      when v_sale_unit_mode = 'both' and v_units_per_pack > 1
      then v_recv_qty_raw * v_units_per_pack
      else v_recv_qty_raw
    end;

    v_accepted := greatest(0, least(v_accepted, v_recv_units));
    v_returned := v_recv_units - v_accepted;

    v_item_status := case
      when v_accepted = 0 then 'returned'
      when v_returned = 0 then 'accepted'
      else                     'partial'
    end;

    update public.challan_items
    set accepted_quantity = v_accepted,
        returned_quantity = v_returned,
        status = v_item_status
    where id = v_ci_id;

    -- Remove returned units from batch (error if already sold)
    if v_returned > 0 then
      select b.id, b.current_quantity
      into v_batch_id, v_current_stock
      from public.batches b
      where b.store_id     = v_store_id
        and b.medicine_id  = v_medicine_id
        and b.batch_number = v_batch_number
        and b.challan_id   = v_challan_id;

      if found then
        if v_current_stock < v_returned then
          raise exception
            'cannot_return_sold_stock: % units of batch % already sold',
            (v_returned - v_current_stock), v_batch_number
          using errcode = '23000';
        end if;

        update public.batches
        set current_quantity = current_quantity - v_returned,
            updated_at = now()
        where id = v_batch_id;

        v_qty_after := v_current_stock - v_returned;

        insert into public.inventory_transactions (
          org_id, store_id, batch_id, medicine_id,
          transaction_type, reference_type, reference_id,
          quantity_change, quantity_after, notes, created_by
        ) values (
          v_org_id, v_store_id, v_batch_id, v_medicine_id,
          'adjustment', 'challan_return', v_challan_id,
          -v_returned, v_qty_after,
          'Challan partial return #' || v_challan_number, v_user_id
        );
      end if;
    end if;

    -- Accumulate accepted items
    if v_accepted > 0 then
      v_actual_rate := case
        when v_sale_unit_mode = 'both' and v_units_per_pack > 1
        then v_purchase_rate / v_units_per_pack::numeric
        else v_purchase_rate
      end;
      v_base_amount := v_actual_rate * v_accepted;
      v_gst_amount  := v_base_amount * v_gst_pct / 100;
      v_item_total  := v_base_amount + v_gst_amount;

      v_total_subtotal := v_total_subtotal + v_base_amount;
      v_total_gst      := v_total_gst + v_gst_amount;

      v_acc_items := v_acc_items || jsonb_build_array(jsonb_build_object(
        'medicine_id',   v_medicine_id,
        'batch_number',  v_batch_number,
        'expiry_date',   v_expiry_date,
        'accepted_qty',  v_accepted,
        'purchase_rate', v_purchase_rate,
        'mrp',           v_mrp,
        'gst_pct',       v_gst_pct,
        'item_amount',   v_item_total
      ));
    end if;
  end loop;

  -- Nothing accepted → challan fully returned
  if jsonb_array_length(v_acc_items) = 0 then
    update public.challans
    set status = 'returned', updated_at = now()
    where id = v_challan_id;
    return json_build_object('purchase_id', null);
  end if;

  -- Create purchase bill (stock already in inventory)
  v_bill_number := 'CHN-' || v_challan_number;

  insert into public.purchases (
    org_id, store_id, supplier_id,
    bill_number, bill_date,
    subtotal, taxable_amount, gst_amount,
    cgst_amount, sgst_amount, igst_amount,
    discount_amount, total_amount,
    payment_status, paid_amount, payment_method,
    notes, created_by
  ) values (
    v_org_id, v_store_id, v_supplier_id,
    v_bill_number, v_challan_date,
    v_total_subtotal, v_total_subtotal, v_total_gst,
    v_total_gst / 2, v_total_gst / 2, 0,
    0, v_total_subtotal + v_total_gst,
    coalesce(p_payload->>'payment_status', 'pending'),
    v_paid_amount,
    p_payload->>'payment_method',
    'Auto-created from Challan #' || v_challan_number,
    v_user_id
  )
  returning id into v_purchase_id;

  -- Insert purchase_items + re-link existing batches
  for v_acc_row in
    select
      (it->>'medicine_id')::uuid    as medicine_id,
      it->>'batch_number'           as batch_number,
      (it->>'expiry_date')::date    as expiry_date,
      (it->>'accepted_qty')::int    as accepted_qty,
      (it->>'purchase_rate')::numeric as purchase_rate,
      (it->>'mrp')::numeric         as mrp,
      (it->>'gst_pct')::numeric     as gst_pct,
      (it->>'item_amount')::numeric  as item_amount
    from jsonb_array_elements(v_acc_items) as it
  loop
    insert into public.purchase_items (
      org_id, store_id, purchase_id, medicine_id,
      batch_number, expiry_date,
      quantity, free_quantity,
      purchase_rate, mrp, gst_percentage,
      discount_percentage, amount
    ) values (
      v_org_id, v_store_id, v_purchase_id, v_acc_row.medicine_id,
      v_acc_row.batch_number, v_acc_row.expiry_date,
      v_acc_row.accepted_qty, 0,
      v_acc_row.purchase_rate, v_acc_row.mrp, v_acc_row.gst_pct,
      0, v_acc_row.item_amount
    )
    returning id into v_pi_id;

    -- Re-point batch from challan → purchase item (batch NOT recreated)
    update public.batches
    set purchase_item_id = v_pi_id,
        challan_id = null,
        updated_at = now()
    where store_id     = v_store_id
      and medicine_id  = v_acc_row.medicine_id
      and batch_number = v_acc_row.batch_number
      and challan_id   = v_challan_id;
  end loop;

  -- Supplier outstanding balance + ledger
  v_net_payable := (v_total_subtotal + v_total_gst) - v_paid_amount;
  if v_net_payable > 0 then
    select outstanding_balance into v_sup_balance
    from public.suppliers where id = v_supplier_id for update;

    v_sup_balance := coalesce(v_sup_balance, 0) + v_net_payable;

    update public.suppliers
    set outstanding_balance = v_sup_balance, updated_at = now()
    where id = v_supplier_id;

    insert into public.supplier_ledgers (
      org_id, store_id, supplier_id,
      transaction_type, reference_type, reference_id,
      amount, balance_after, notes, created_by
    ) values (
      v_org_id, v_store_id, v_supplier_id,
      'purchase', 'challan_accept', v_purchase_id,
      v_net_payable, v_sup_balance,
      'Purchase from Challan #' || v_challan_number, v_user_id
    );
  end if;

  -- Final challan status
  select
    coalesce(sum(accepted_quantity), 0),
    coalesce(sum(received_quantity), 0)
  into v_total_accepted, v_total_received
  from public.challan_items where challan_id = v_challan_id;

  v_challan_status := case
    when v_total_accepted = v_total_received then 'accepted'
    when v_total_accepted > 0               then 'partially_accepted'
    else                                         'returned'
  end;

  update public.challans
  set status             = v_challan_status,
      linked_purchase_id = v_purchase_id,
      updated_at         = now()
  where id = v_challan_id;

  perform public.log_audit(
    v_org_id, v_store_id, 'challans', v_challan_id::text, 'update',
    jsonb_build_object(
      'status',      v_challan_status,
      'purchase_id', v_purchase_id::text
    )
  );

  return json_build_object('purchase_id', v_purchase_id);
end;
$$;

revoke all on function public.rpc_accept_challan(jsonb) from public;
grant execute on function public.rpc_accept_challan(jsonb) to authenticated;

-- ============================================================================
-- 7. rpc_return_challan (smart: auto-accepts sold portions)
-- ============================================================================

create or replace function public.rpc_return_challan(
  p_challan_id uuid,
  p_store_id   uuid
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id         uuid := auth.uid();
  v_org_id          uuid;
  v_challan_number  text;
  v_challan_status  text;
  v_row             record;
  v_batch_id        uuid;
  v_current_stock   integer;
  v_recv_units      integer;
  v_sold_qty        integer;
  v_returnable      integer;
  v_qty_after       integer;
  v_item_status     text;
  v_total_returned  integer := 0;
  v_total_accepted  integer := 0;
  v_final_status    text;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  v_org_id := public.current_org();

  select challan_number, status
  into v_challan_number, v_challan_status
  from public.challans
  where id = p_challan_id and store_id = p_store_id and deleted_at is null;

  if not found then
    raise exception 'not_found' using errcode = '02000';
  end if;
  if v_challan_status != 'pending' then
    raise exception 'challan_already_processed: status=%', v_challan_status
      using errcode = '23505';
  end if;

  -- Process each pending item
  for v_row in
    select ci.id, ci.medicine_id, ci.batch_number, ci.received_quantity,
           coalesce(m.sale_unit_mode, 'pack_only') as sale_unit_mode,
           coalesce(m.units_per_pack, 1)           as units_per_pack
    from public.challan_items ci
    join public.medicines m on m.id = ci.medicine_id
    where ci.challan_id = p_challan_id and ci.status = 'pending'
  loop
    v_recv_units := case
      when v_row.sale_unit_mode = 'both' and v_row.units_per_pack > 1
      then v_row.received_quantity * v_row.units_per_pack
      else v_row.received_quantity
    end;

    select b.id, b.current_quantity
    into v_batch_id, v_current_stock
    from public.batches b
    where b.store_id     = p_store_id
      and b.medicine_id  = v_row.medicine_id
      and b.batch_number = v_row.batch_number
      and b.challan_id   = p_challan_id;

    v_current_stock := coalesce(v_current_stock, 0);
    v_sold_qty      := greatest(0, v_recv_units - v_current_stock);
    v_returnable    := least(v_current_stock, v_recv_units);

    if v_sold_qty > 0 then
      v_item_status := case when v_returnable = 0 then 'accepted' else 'partial' end;
      update public.challan_items
      set accepted_quantity = v_sold_qty,
          returned_quantity = v_returnable,
          status = v_item_status
      where id = v_row.id;
      v_total_accepted := v_total_accepted + v_sold_qty;
    else
      update public.challan_items
      set returned_quantity = v_recv_units,
          accepted_quantity = 0,
          status = 'returned'
      where id = v_row.id;
    end if;

    if v_returnable > 0 and v_batch_id is not null then
      update public.batches
      set current_quantity = current_quantity - v_returnable,
          updated_at = now()
      where id = v_batch_id;

      v_qty_after := v_current_stock - v_returnable;

      insert into public.inventory_transactions (
        org_id, store_id, batch_id, medicine_id,
        transaction_type, reference_type, reference_id,
        quantity_change, quantity_after, notes, created_by
      ) values (
        v_org_id, p_store_id, v_batch_id, v_row.medicine_id,
        'adjustment', 'challan_return', p_challan_id,
        -v_returnable, v_qty_after,
        'Challan return #' || v_challan_number, v_user_id
      );

      v_total_returned := v_total_returned + v_returnable;
    end if;
  end loop;

  v_final_status := case when v_total_accepted > 0 then 'partially_accepted' else 'returned' end;

  update public.challans
  set status = v_final_status, updated_at = now()
  where id = p_challan_id;

  return json_build_object(
    'returned_quantity',      v_total_returned,
    'auto_accepted_quantity', v_total_accepted,
    'status',                 v_final_status
  );
end;
$$;

revoke all on function public.rpc_return_challan(uuid, uuid) from public;
grant execute on function public.rpc_return_challan(uuid, uuid) to authenticated;

-- ============================================================================
-- 8. rpc_pending_challan_count — dashboard badge
-- ============================================================================

create or replace function public.rpc_pending_challan_count(p_store_id uuid)
returns bigint
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

  return (
    select count(*) from public.challans
    where store_id  = p_store_id
      and status    = 'pending'
      and deleted_at is null
  );
end;
$$;

revoke all on function public.rpc_pending_challan_count(uuid) from public;
grant execute on function public.rpc_pending_challan_count(uuid) to authenticated;
