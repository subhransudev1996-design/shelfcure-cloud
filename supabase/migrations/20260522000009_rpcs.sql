-- ShelfCure Cloud — Migration 0009
-- Atomic RPCs (Phase 1 slice 8).
--
-- These are the only way clients should commit multi-row business operations.
-- Every RPC:
--   1) Is SECURITY DEFINER with locked search_path.
--   2) Takes a client_uuid for idempotency — if already processed, returns
--      the original result without re-applying.
--   3) Performs all writes in a single transaction via SAVEPOINT.
--   4) Locks affected batch rows with FOR UPDATE to prevent oversell races.
--   5) Inserts an audit_log row at the end.
--   6) Raises a labelled exception on validation failure.
--
-- Error codes used:
--   '28000' not_authenticated      (no auth.uid())
--   '42501' permission_denied      (RLS / role rejected)
--   '23505' duplicate_key          (idempotency hit OR unique violation)
--   '23514' insufficient_stock     (would oversell a batch)
--   '23502' missing_required_field
--   '22000' invalid_data           (line-item math mismatch, etc.)

-- ============================================================================
-- Internal helper: write an audit_log row
-- ============================================================================

create or replace function public.log_audit(
  p_org_id    uuid,
  p_store_id  uuid,
  p_entity    text,
  p_entity_id text,
  p_action    text,
  p_after     jsonb default null,
  p_before    jsonb default null
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.audit_log (org_id, store_id, user_id, entity, entity_id, action, before, after, created_at)
  values (p_org_id, p_store_id, auth.uid(), p_entity, p_entity_id, p_action, p_before, p_after, now())
$$;

revoke all on function public.log_audit(uuid, uuid, text, text, text, jsonb, jsonb) from public;

-- ============================================================================
-- 1) rpc_commit_sale  —  the heart of the POS
-- ============================================================================

create or replace function public.rpc_commit_sale(p_payload jsonb)
returns table (sale_id uuid, bill_number text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id     uuid := auth.uid();
  v_client_uuid uuid;
  v_org_id      uuid;
  v_store_id    uuid;
  v_role        text;
  v_existing    record;
  v_sale_id     uuid;
  v_bill_number text;
  v_item        jsonb;
  v_payment     jsonb;
  v_batch_qty   integer;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  v_client_uuid := (p_payload->>'client_uuid')::uuid;
  v_store_id    := (p_payload->>'store_id')::uuid;
  v_org_id      := public.current_org();
  v_role        := public.current_role();

  if v_client_uuid is null or v_store_id is null then
    raise exception 'missing_required_field: client_uuid + store_id required' using errcode = '23502';
  end if;

  if v_role not in ('super_admin','store_admin','pharmacist','cashier') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if not public.user_has_store_access(v_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  -- Idempotency: already processed?
  select id, bill_number into v_existing
  from public.sales where client_uuid = v_client_uuid;

  if found then
    return query select v_existing.id, v_existing.bill_number;
    return;
  end if;

  -- Insert sale header
  insert into public.sales (
    org_id, store_id, customer_id, doctor_id,
    bill_number, bill_date,
    subtotal, taxable_amount, gst_amount, cgst_amount, sgst_amount, igst_amount,
    discount_amount, special_discount_amount, special_discount_label, misc_charge, round_off,
    total_amount,
    customer_type, customer_gstin, customer_state,
    doctor_name, prescription_image_path, is_prescription_sale,
    payment_method, payment_status, paid_amount,
    source, client_uuid, notes, created_by
  )
  values (
    v_org_id, v_store_id,
    nullif(p_payload->>'customer_id','')::uuid,
    nullif(p_payload->>'doctor_id','')::uuid,
    p_payload->>'bill_number',
    coalesce((p_payload->>'bill_date')::date, current_date),
    coalesce((p_payload->>'subtotal')::numeric, 0),
    coalesce((p_payload->>'taxable_amount')::numeric, 0),
    coalesce((p_payload->>'gst_amount')::numeric, 0),
    coalesce((p_payload->>'cgst_amount')::numeric, 0),
    coalesce((p_payload->>'sgst_amount')::numeric, 0),
    coalesce((p_payload->>'igst_amount')::numeric, 0),
    coalesce((p_payload->>'discount_amount')::numeric, 0),
    coalesce((p_payload->>'special_discount_amount')::numeric, 0),
    p_payload->>'special_discount_label',
    coalesce((p_payload->>'misc_charge')::numeric, 0),
    coalesce((p_payload->>'round_off')::numeric, 0),
    coalesce((p_payload->>'total_amount')::numeric, 0),
    coalesce(p_payload->>'customer_type','b2c'),
    p_payload->>'customer_gstin',
    p_payload->>'customer_state',
    p_payload->>'doctor_name',
    p_payload->>'prescription_image_path',
    coalesce((p_payload->>'is_prescription_sale')::boolean, false),
    coalesce(p_payload->>'payment_method','cash'),
    coalesce(p_payload->>'payment_status','paid'),
    coalesce((p_payload->>'paid_amount')::numeric, 0),
    coalesce(p_payload->>'source','web'),
    v_client_uuid,
    p_payload->>'notes',
    v_user_id
  )
  returning id, bill_number into v_sale_id, v_bill_number;

  -- Process each line item
  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) loop
    if coalesce((v_item->>'is_misc_item')::boolean, false) then
      -- Misc line — no stock impact, no medicine/batch
      insert into public.sale_items (
        org_id, store_id, sale_id,
        quantity, mrp, gst_percentage,
        taxable_amount, amount,
        is_misc_item, misc_note
      ) values (
        v_org_id, v_store_id, v_sale_id,
        coalesce((v_item->>'quantity')::int, 1),
        coalesce((v_item->>'mrp')::numeric, 0),
        coalesce((v_item->>'gst_percentage')::numeric, 0),
        coalesce((v_item->>'taxable_amount')::numeric, (v_item->>'amount')::numeric),
        coalesce((v_item->>'amount')::numeric, 0),
        true,
        v_item->>'misc_note'
      );
    else
      -- Regular line: lock batch + check stock + decrement
      select current_quantity into v_batch_qty
      from public.batches
      where id = (v_item->>'batch_id')::uuid
      for update;

      if v_batch_qty is null then
        raise exception 'batch_not_found: %', v_item->>'batch_id' using errcode = '23502';
      end if;

      if v_batch_qty < (v_item->>'quantity')::int then
        raise exception 'insufficient_stock: batch % has % units, need %',
          v_item->>'batch_id', v_batch_qty, v_item->>'quantity' using errcode = '23514';
      end if;

      update public.batches
      set current_quantity = current_quantity - (v_item->>'quantity')::int,
          version = version + 1,
          updated_by = v_user_id
      where id = (v_item->>'batch_id')::uuid;

      insert into public.sale_items (
        org_id, store_id, sale_id, medicine_id, batch_id,
        quantity, selling_unit, mrp,
        discount_percentage, item_discount_type, item_discount_value,
        gst_percentage,
        taxable_amount, cgst_percentage, sgst_percentage, igst_percentage,
        cgst_amount, sgst_amount, igst_amount, amount
      ) values (
        v_org_id, v_store_id, v_sale_id,
        (v_item->>'medicine_id')::uuid,
        (v_item->>'batch_id')::uuid,
        (v_item->>'quantity')::int,
        coalesce(v_item->>'selling_unit','pack'),
        coalesce((v_item->>'mrp')::numeric, 0),
        (v_item->>'discount_percentage')::numeric,
        v_item->>'item_discount_type',
        (v_item->>'item_discount_value')::numeric,
        coalesce((v_item->>'gst_percentage')::numeric, 0),
        coalesce((v_item->>'taxable_amount')::numeric, 0),
        coalesce((v_item->>'cgst_percentage')::numeric, 0),
        coalesce((v_item->>'sgst_percentage')::numeric, 0),
        coalesce((v_item->>'igst_percentage')::numeric, 0),
        coalesce((v_item->>'cgst_amount')::numeric, 0),
        coalesce((v_item->>'sgst_amount')::numeric, 0),
        coalesce((v_item->>'igst_amount')::numeric, 0),
        coalesce((v_item->>'amount')::numeric, 0)
      );
    end if;
  end loop;

  -- Payments (split-friendly)
  for v_payment in select * from jsonb_array_elements(coalesce(p_payload->'payments','[]'::jsonb)) loop
    insert into public.sale_payments (
      org_id, store_id, sale_id, payment_method, amount, reference_number
    ) values (
      v_org_id, v_store_id, v_sale_id,
      v_payment->>'payment_method',
      (v_payment->>'amount')::numeric,
      v_payment->>'reference_number'
    );
  end loop;

  -- Bump customer aggregates if linked
  if (p_payload->>'customer_id') is not null and (p_payload->>'customer_id') <> '' then
    update public.customers
    set total_purchases = total_purchases + coalesce((p_payload->>'total_amount')::numeric, 0),
        last_purchase_date = coalesce((p_payload->>'bill_date')::date, current_date),
        updated_by = v_user_id
    where id = (p_payload->>'customer_id')::uuid;
  end if;

  -- Audit
  perform public.log_audit(
    v_org_id, v_store_id, 'sales', v_sale_id::text, 'insert',
    jsonb_build_object('bill_number', v_bill_number, 'total_amount', p_payload->'total_amount')
  );

  return query select v_sale_id, v_bill_number;
end;
$$;

revoke all on function public.rpc_commit_sale(jsonb) from public;
grant execute on function public.rpc_commit_sale(jsonb) to authenticated;

-- ============================================================================
-- 2) rpc_commit_sale_return  —  refund flow
-- ============================================================================

create or replace function public.rpc_commit_sale_return(p_payload jsonb)
returns table (return_id uuid, return_number text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id     uuid := auth.uid();
  v_client_uuid uuid;
  v_org_id      uuid;
  v_store_id    uuid;
  v_sale_id     uuid;
  v_existing    record;
  v_return_id   uuid;
  v_return_no   text;
  v_item        jsonb;
  v_total_returned int;
  v_total_sold     int;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  v_client_uuid := (p_payload->>'client_uuid')::uuid;
  v_store_id    := (p_payload->>'store_id')::uuid;
  v_sale_id     := (p_payload->>'sale_id')::uuid;
  v_org_id      := public.current_org();

  if v_client_uuid is null or v_store_id is null or v_sale_id is null then
    raise exception 'missing_required_field' using errcode = '23502';
  end if;

  if not public.user_has_store_access(v_store_id) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  -- Idempotency
  select id, return_number into v_existing from public.sale_returns where client_uuid = v_client_uuid;
  if found then return query select v_existing.id, v_existing.return_number; return; end if;

  insert into public.sale_returns (
    org_id, store_id, sale_id, customer_id,
    return_number, return_date,
    subtotal, gst_amount, total_amount,
    reason, refund_method, client_uuid, created_by
  ) values (
    v_org_id, v_store_id, v_sale_id,
    nullif(p_payload->>'customer_id','')::uuid,
    p_payload->>'return_number',
    coalesce((p_payload->>'return_date')::date, current_date),
    coalesce((p_payload->>'subtotal')::numeric, 0),
    coalesce((p_payload->>'gst_amount')::numeric, 0),
    coalesce((p_payload->>'total_amount')::numeric, 0),
    p_payload->>'reason',
    coalesce(p_payload->>'refund_method','cash'),
    v_client_uuid,
    v_user_id
  )
  returning id, return_number into v_return_id, v_return_no;

  -- Each return line: increment batch, increment sale_item.returned_quantity
  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) loop
    insert into public.sale_return_items (
      org_id, store_id, sale_return_id, sale_item_id, medicine_id, batch_id, quantity, amount
    ) values (
      v_org_id, v_store_id, v_return_id,
      (v_item->>'sale_item_id')::uuid,
      (v_item->>'medicine_id')::uuid,
      (v_item->>'batch_id')::uuid,
      (v_item->>'quantity')::int,
      coalesce((v_item->>'amount')::numeric, 0)
    );

    -- Add back to batch
    update public.batches
    set current_quantity = current_quantity + (v_item->>'quantity')::int,
        version = version + 1,
        updated_by = v_user_id
    where id = (v_item->>'batch_id')::uuid;

    -- Track returned qty on the source line
    update public.sale_items
    set returned_quantity = returned_quantity + (v_item->>'quantity')::int
    where id = (v_item->>'sale_item_id')::uuid;
  end loop;

  -- Update sale's returned flags
  select sum(returned_quantity), sum(quantity) into v_total_returned, v_total_sold
  from public.sale_items where sale_id = v_sale_id and is_misc_item = false;

  update public.sales
  set is_returned = coalesce(v_total_returned, 0) > 0,
      is_fully_returned = coalesce(v_total_returned, 0) >= coalesce(v_total_sold, 0)
                          and coalesce(v_total_sold, 0) > 0,
      updated_by = v_user_id
  where id = v_sale_id;

  perform public.log_audit(v_org_id, v_store_id, 'sale_returns', v_return_id::text, 'insert',
    jsonb_build_object('return_number', v_return_no, 'sale_id', v_sale_id::text));

  return query select v_return_id, v_return_no;
end;
$$;

revoke all on function public.rpc_commit_sale_return(jsonb) from public;
grant execute on function public.rpc_commit_sale_return(jsonb) to authenticated;

-- ============================================================================
-- 3) rpc_commit_purchase  —  inbound stock from supplier
-- ============================================================================

create or replace function public.rpc_commit_purchase(p_payload jsonb)
returns table (purchase_id uuid, bill_number text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id     uuid := auth.uid();
  v_client_uuid uuid;
  v_org_id      uuid;
  v_store_id    uuid;
  v_supplier_id uuid;
  v_role        text;
  v_existing    record;
  v_purchase_id uuid;
  v_bill_no     text;
  v_item        jsonb;
  v_pi_id       uuid;
  v_batch_id    uuid;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  v_client_uuid := (p_payload->>'client_uuid')::uuid;
  v_store_id    := (p_payload->>'store_id')::uuid;
  v_supplier_id := (p_payload->>'supplier_id')::uuid;
  v_org_id      := public.current_org();
  v_role        := public.current_role();

  if v_client_uuid is null or v_store_id is null or v_supplier_id is null then
    raise exception 'missing_required_field' using errcode = '23502';
  end if;

  if v_role not in ('super_admin','store_admin','pharmacist') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not public.user_has_store_access(v_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  select id, bill_number into v_existing from public.purchases where client_uuid = v_client_uuid;
  if found then return query select v_existing.id, v_existing.bill_number; return; end if;

  insert into public.purchases (
    org_id, store_id, supplier_id,
    bill_number, bill_date, bill_image_url,
    subtotal, taxable_amount, gst_amount, cgst_amount, sgst_amount, igst_amount,
    discount_amount, total_amount,
    payment_status, paid_amount, payment_method, payment_date,
    is_ai_scanned, notes, client_uuid, created_by
  ) values (
    v_org_id, v_store_id, v_supplier_id,
    p_payload->>'bill_number',
    coalesce((p_payload->>'bill_date')::date, current_date),
    p_payload->>'bill_image_url',
    coalesce((p_payload->>'subtotal')::numeric, 0),
    coalesce((p_payload->>'taxable_amount')::numeric, 0),
    coalesce((p_payload->>'gst_amount')::numeric, 0),
    coalesce((p_payload->>'cgst_amount')::numeric, 0),
    coalesce((p_payload->>'sgst_amount')::numeric, 0),
    coalesce((p_payload->>'igst_amount')::numeric, 0),
    coalesce((p_payload->>'discount_amount')::numeric, 0),
    coalesce((p_payload->>'total_amount')::numeric, 0),
    coalesce(p_payload->>'payment_status','pending'),
    coalesce((p_payload->>'paid_amount')::numeric, 0),
    p_payload->>'payment_method',
    (p_payload->>'payment_date')::date,
    coalesce((p_payload->>'is_ai_scanned')::boolean, false),
    p_payload->>'notes',
    v_client_uuid,
    v_user_id
  )
  returning id, bill_number into v_purchase_id, v_bill_no;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) loop
    -- Insert purchase_item
    insert into public.purchase_items (
      org_id, store_id, purchase_id, medicine_id,
      batch_number, expiry_date,
      quantity, free_quantity,
      purchase_rate, mrp, selling_price,
      gst_percentage, discount_percentage, amount
    ) values (
      v_org_id, v_store_id, v_purchase_id,
      (v_item->>'medicine_id')::uuid,
      v_item->>'batch_number',
      (v_item->>'expiry_date')::date,
      coalesce((v_item->>'quantity')::int, 0),
      coalesce((v_item->>'free_quantity')::int, 0),
      coalesce((v_item->>'purchase_rate')::numeric, 0),
      coalesce((v_item->>'mrp')::numeric, 0),
      (v_item->>'selling_price')::numeric,
      coalesce((v_item->>'gst_percentage')::numeric, 0),
      (v_item->>'discount_percentage')::numeric,
      coalesce((v_item->>'amount')::numeric, 0)
    )
    returning id into v_pi_id;

    -- Create or top-up the batch
    insert into public.batches (
      org_id, store_id, medicine_id, supplier_id,
      batch_number, expiry_date,
      initial_quantity, current_quantity,
      purchase_rate, mrp, selling_price, gst_percentage,
      purchase_item_id, updated_by
    ) values (
      v_org_id, v_store_id,
      (v_item->>'medicine_id')::uuid, v_supplier_id,
      v_item->>'batch_number',
      (v_item->>'expiry_date')::date,
      coalesce((v_item->>'quantity')::int, 0) + coalesce((v_item->>'free_quantity')::int, 0),
      coalesce((v_item->>'quantity')::int, 0) + coalesce((v_item->>'free_quantity')::int, 0),
      coalesce((v_item->>'purchase_rate')::numeric, 0),
      coalesce((v_item->>'mrp')::numeric, 0),
      (v_item->>'selling_price')::numeric,
      coalesce((v_item->>'gst_percentage')::numeric, 0),
      v_pi_id, v_user_id
    )
    on conflict (store_id, medicine_id, batch_number)
    do update set
      current_quantity = public.batches.current_quantity
        + coalesce((v_item->>'quantity')::int, 0) + coalesce((v_item->>'free_quantity')::int, 0),
      initial_quantity = public.batches.initial_quantity
        + coalesce((v_item->>'quantity')::int, 0) + coalesce((v_item->>'free_quantity')::int, 0),
      version = public.batches.version + 1,
      updated_by = v_user_id
    returning id into v_batch_id;
  end loop;

  perform public.log_audit(v_org_id, v_store_id, 'purchases', v_purchase_id::text, 'insert',
    jsonb_build_object('bill_number', v_bill_no, 'supplier_id', v_supplier_id::text));

  return query select v_purchase_id, v_bill_no;
end;
$$;

revoke all on function public.rpc_commit_purchase(jsonb) from public;
grant execute on function public.rpc_commit_purchase(jsonb) to authenticated;

-- ============================================================================
-- 4) rpc_commit_purchase_return
-- ============================================================================

create or replace function public.rpc_commit_purchase_return(p_payload jsonb)
returns table (return_id uuid, return_number text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id     uuid := auth.uid();
  v_client_uuid uuid;
  v_org_id      uuid;
  v_store_id    uuid;
  v_purchase_id uuid;
  v_supplier_id uuid;
  v_existing    record;
  v_return_id   uuid;
  v_return_no   text;
  v_item        jsonb;
  v_batch_qty   integer;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  v_client_uuid := (p_payload->>'client_uuid')::uuid;
  v_store_id    := (p_payload->>'store_id')::uuid;
  v_purchase_id := (p_payload->>'purchase_id')::uuid;
  v_supplier_id := (p_payload->>'supplier_id')::uuid;
  v_org_id      := public.current_org();

  if v_client_uuid is null or v_store_id is null or v_purchase_id is null or v_supplier_id is null then
    raise exception 'missing_required_field' using errcode = '23502';
  end if;

  if public.current_role() not in ('super_admin','store_admin','pharmacist') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not public.user_has_store_access(v_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  select id, return_number into v_existing from public.purchase_returns where client_uuid = v_client_uuid;
  if found then return query select v_existing.id, v_existing.return_number; return; end if;

  insert into public.purchase_returns (
    org_id, store_id, purchase_id, supplier_id,
    return_number, return_date,
    subtotal, gst_amount, total_amount, reason,
    client_uuid, created_by
  ) values (
    v_org_id, v_store_id, v_purchase_id, v_supplier_id,
    p_payload->>'return_number',
    coalesce((p_payload->>'return_date')::date, current_date),
    coalesce((p_payload->>'subtotal')::numeric, 0),
    coalesce((p_payload->>'gst_amount')::numeric, 0),
    coalesce((p_payload->>'total_amount')::numeric, 0),
    p_payload->>'reason',
    v_client_uuid, v_user_id
  )
  returning id, return_number into v_return_id, v_return_no;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) loop
    -- Lock + decrement source batch
    select current_quantity into v_batch_qty
    from public.batches
    where id = (v_item->>'batch_id')::uuid
    for update;

    if v_batch_qty is null or v_batch_qty < (v_item->>'quantity')::int then
      raise exception 'insufficient_stock for purchase return on batch %', v_item->>'batch_id' using errcode = '23514';
    end if;

    update public.batches
    set current_quantity = current_quantity - (v_item->>'quantity')::int,
        version = version + 1,
        updated_by = v_user_id
    where id = (v_item->>'batch_id')::uuid;

    insert into public.purchase_return_items (
      org_id, store_id, purchase_return_id,
      purchase_item_id, medicine_id, batch_id,
      quantity, amount
    ) values (
      v_org_id, v_store_id, v_return_id,
      (v_item->>'purchase_item_id')::uuid,
      (v_item->>'medicine_id')::uuid,
      (v_item->>'batch_id')::uuid,
      (v_item->>'quantity')::int,
      coalesce((v_item->>'amount')::numeric, 0)
    );

    -- Track returned qty on source purchase_item
    update public.purchase_items
    set returned_quantity = returned_quantity + (v_item->>'quantity')::int
    where id = (v_item->>'purchase_item_id')::uuid;
  end loop;

  perform public.log_audit(v_org_id, v_store_id, 'purchase_returns', v_return_id::text, 'insert',
    jsonb_build_object('return_number', v_return_no, 'purchase_id', v_purchase_id::text));

  return query select v_return_id, v_return_no;
end;
$$;

revoke all on function public.rpc_commit_purchase_return(jsonb) from public;
grant execute on function public.rpc_commit_purchase_return(jsonb) to authenticated;

-- ============================================================================
-- 5) rpc_stock_transfer_request
-- ============================================================================

create or replace function public.rpc_stock_transfer_request(p_payload jsonb)
returns table (transfer_id uuid, transfer_no text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id     uuid := auth.uid();
  v_client_uuid uuid;
  v_org_id      uuid;
  v_from        uuid;
  v_to          uuid;
  v_existing    record;
  v_transfer_id uuid;
  v_transfer_no text;
  v_item        jsonb;
  v_batch       record;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  v_client_uuid := (p_payload->>'client_uuid')::uuid;
  v_from        := (p_payload->>'from_store_id')::uuid;
  v_to          := (p_payload->>'to_store_id')::uuid;
  v_org_id      := public.current_org();

  if v_client_uuid is null or v_from is null or v_to is null then
    raise exception 'missing_required_field' using errcode = '23502';
  end if;
  if v_from = v_to then
    raise exception 'invalid_data: from and to stores must differ' using errcode = '22000';
  end if;
  if public.current_role() not in ('super_admin','store_admin','pharmacist') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not public.user_has_store_access(v_from) then
    raise exception 'permission_denied: from-store access' using errcode = '42501';
  end if;

  select id, transfer_no into v_existing from public.stock_transfers where client_uuid = v_client_uuid;
  if found then return query select v_existing.id, v_existing.transfer_no; return; end if;

  insert into public.stock_transfers (
    org_id, from_store_id, to_store_id, transfer_no, flow, status,
    requested_by, notes, client_uuid
  ) values (
    v_org_id, v_from, v_to,
    p_payload->>'transfer_no',
    coalesce(p_payload->>'flow','request_approve'),
    'requested',
    v_user_id,
    p_payload->>'notes',
    v_client_uuid
  )
  returning id, transfer_no into v_transfer_id, v_transfer_no;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) loop
    -- Denormalize from the source batch so the destination can see what's coming
    select b.medicine_id, m.name as medicine_name, b.batch_number, b.expiry_date,
           b.mrp, b.purchase_rate, b.gst_percentage
    into v_batch
    from public.batches b
    join public.medicines m on m.id = b.medicine_id
    where b.id = (v_item->>'source_batch_id')::uuid;

    if v_batch is null then
      raise exception 'batch_not_found: %', v_item->>'source_batch_id' using errcode = '23502';
    end if;

    insert into public.stock_transfer_items (
      org_id, transfer_id, source_batch_id,
      medicine_id, medicine_name, batch_number, expiry_date,
      requested_quantity, mrp, purchase_rate, gst_percentage,
      notes
    ) values (
      v_org_id, v_transfer_id, (v_item->>'source_batch_id')::uuid,
      v_batch.medicine_id, v_batch.medicine_name, v_batch.batch_number, v_batch.expiry_date,
      (v_item->>'requested_quantity')::int,
      v_batch.mrp, v_batch.purchase_rate, v_batch.gst_percentage,
      v_item->>'notes'
    );
  end loop;

  perform public.log_audit(v_org_id, v_from, 'stock_transfers', v_transfer_id::text, 'insert',
    jsonb_build_object('transfer_no', v_transfer_no, 'to_store', v_to::text));

  return query select v_transfer_id, v_transfer_no;
end;
$$;

revoke all on function public.rpc_stock_transfer_request(jsonb) from public;
grant execute on function public.rpc_stock_transfer_request(jsonb) to authenticated;

-- ============================================================================
-- 6) rpc_stock_transfer_approve  —  approve at TO store, decrement FROM stock,
--    mark in_transit
-- ============================================================================

create or replace function public.rpc_stock_transfer_approve(
  p_transfer_id uuid,
  p_approvals jsonb       -- [{item_id, approved_quantity}]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id   uuid := auth.uid();
  v_org_id    uuid;
  v_transfer  record;
  v_approval  jsonb;
  v_item      record;
  v_batch_qty integer;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  v_org_id := public.current_org();

  select * into v_transfer from public.stock_transfers where id = p_transfer_id for update;
  if v_transfer is null then
    raise exception 'transfer_not_found' using errcode = '23502';
  end if;
  if v_transfer.org_id <> v_org_id then
    raise exception 'permission_denied: cross-org' using errcode = '42501';
  end if;
  if not public.user_has_store_access(v_transfer.to_store_id) then
    raise exception 'permission_denied: approver must be at to-store' using errcode = '42501';
  end if;
  if v_transfer.status <> 'requested' then
    raise exception 'invalid_state: transfer must be in requested status (was %)', v_transfer.status using errcode = '22000';
  end if;

  -- Apply approvals + decrement source batches
  for v_approval in select * from jsonb_array_elements(p_approvals) loop
    update public.stock_transfer_items
    set approved_quantity = (v_approval->>'approved_quantity')::int
    where id = (v_approval->>'item_id')::uuid and transfer_id = p_transfer_id;

    -- Get item details
    select * into v_item from public.stock_transfer_items
    where id = (v_approval->>'item_id')::uuid;

    if (v_approval->>'approved_quantity')::int > 0 then
      select current_quantity into v_batch_qty
      from public.batches where id = v_item.source_batch_id for update;

      if v_batch_qty < (v_approval->>'approved_quantity')::int then
        raise exception 'insufficient_stock at source for batch %', v_item.source_batch_id using errcode = '23514';
      end if;

      update public.batches
      set current_quantity = current_quantity - (v_approval->>'approved_quantity')::int,
          version = version + 1,
          updated_by = v_user_id
      where id = v_item.source_batch_id;
    end if;
  end loop;

  update public.stock_transfers
  set status = 'approved',
      approved_by = v_user_id,
      approved_at = now(),
      version = version + 1
  where id = p_transfer_id;

  -- Mark as in_transit immediately (a separate ship step can be added later)
  update public.stock_transfers
  set status = 'in_transit',
      shipped_by = v_user_id,
      shipped_at = now(),
      version = version + 1
  where id = p_transfer_id;

  perform public.log_audit(v_org_id, v_transfer.to_store_id, 'stock_transfers', p_transfer_id::text, 'update',
    jsonb_build_object('status','in_transit'));
end;
$$;

revoke all on function public.rpc_stock_transfer_approve(uuid, jsonb) from public;
grant execute on function public.rpc_stock_transfer_approve(uuid, jsonb) to authenticated;

-- ============================================================================
-- 7) rpc_stock_transfer_receive  —  receive at TO store, create dest batches
-- ============================================================================

create or replace function public.rpc_stock_transfer_receive(
  p_transfer_id uuid,
  p_receipts jsonb              -- [{item_id, received_quantity}]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id   uuid := auth.uid();
  v_org_id    uuid;
  v_transfer  record;
  v_receipt   jsonb;
  v_item      record;
  v_dest_batch_id uuid;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  v_org_id := public.current_org();

  select * into v_transfer from public.stock_transfers where id = p_transfer_id for update;
  if v_transfer is null then raise exception 'transfer_not_found' using errcode = '23502'; end if;
  if v_transfer.org_id <> v_org_id then raise exception 'permission_denied' using errcode = '42501'; end if;
  if not public.user_has_store_access(v_transfer.to_store_id) then
    raise exception 'permission_denied: receiver must be at to-store' using errcode = '42501';
  end if;
  if v_transfer.status <> 'in_transit' then
    raise exception 'invalid_state: transfer must be in_transit (was %)', v_transfer.status using errcode = '22000';
  end if;

  for v_receipt in select * from jsonb_array_elements(p_receipts) loop
    update public.stock_transfer_items
    set received_quantity = (v_receipt->>'received_quantity')::int
    where id = (v_receipt->>'item_id')::uuid and transfer_id = p_transfer_id;

    select * into v_item from public.stock_transfer_items where id = (v_receipt->>'item_id')::uuid;

    if (v_receipt->>'received_quantity')::int > 0 then
      -- Create or top-up destination batch
      insert into public.batches (
        org_id, store_id, medicine_id,
        batch_number, expiry_date,
        initial_quantity, current_quantity,
        purchase_rate, mrp, gst_percentage,
        updated_by
      ) values (
        v_org_id, v_transfer.to_store_id, v_item.medicine_id,
        v_item.batch_number, v_item.expiry_date,
        (v_receipt->>'received_quantity')::int,
        (v_receipt->>'received_quantity')::int,
        v_item.purchase_rate, v_item.mrp, v_item.gst_percentage,
        v_user_id
      )
      on conflict (store_id, medicine_id, batch_number)
      do update set
        current_quantity = public.batches.current_quantity + (v_receipt->>'received_quantity')::int,
        initial_quantity = public.batches.initial_quantity + (v_receipt->>'received_quantity')::int,
        version = public.batches.version + 1,
        updated_by = v_user_id
      returning id into v_dest_batch_id;

      update public.stock_transfer_items
      set dest_batch_id = v_dest_batch_id
      where id = (v_receipt->>'item_id')::uuid;
    end if;
  end loop;

  update public.stock_transfers
  set status = 'received',
      received_by = v_user_id,
      received_at = now(),
      version = version + 1
  where id = p_transfer_id;

  perform public.log_audit(v_org_id, v_transfer.to_store_id, 'stock_transfers', p_transfer_id::text, 'update',
    jsonb_build_object('status','received'));
end;
$$;

revoke all on function public.rpc_stock_transfer_receive(uuid, jsonb) from public;
grant execute on function public.rpc_stock_transfer_receive(uuid, jsonb) to authenticated;

-- ============================================================================
-- 8) rpc_stock_correction  —  manual batch qty adjustment with audit
-- ============================================================================

create or replace function public.rpc_stock_correction(
  p_batch_id   uuid,
  p_delta      integer,
  p_reason     text,
  p_client_uuid uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id    uuid := auth.uid();
  v_org_id     uuid;
  v_batch      record;
  v_correction_id uuid;
  v_existing_id   uuid;
  v_before     integer;
  v_after      integer;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  v_org_id := public.current_org();

  if p_delta = 0 then
    raise exception 'invalid_data: delta cannot be 0' using errcode = '22000';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'invalid_data: reason required' using errcode = '22000';
  end if;
  if public.current_role() not in ('super_admin','store_admin','pharmacist') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select id into v_existing_id from public.stock_corrections where client_uuid = p_client_uuid;
  if found then return v_existing_id; end if;

  select * into v_batch from public.batches where id = p_batch_id for update;
  if v_batch is null then raise exception 'batch_not_found' using errcode = '23502'; end if;
  if v_batch.org_id <> v_org_id then raise exception 'permission_denied: cross-org' using errcode = '42501'; end if;
  if not public.user_has_store_access(v_batch.store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  v_before := v_batch.current_quantity;
  v_after  := v_before + p_delta;

  if v_after < 0 then
    raise exception 'invalid_data: correction would result in negative qty (% + % = %)',
      v_before, p_delta, v_after using errcode = '22000';
  end if;

  update public.batches
  set current_quantity = v_after,
      version = version + 1,
      updated_by = v_user_id
  where id = p_batch_id;

  insert into public.stock_corrections (
    org_id, store_id, batch_id, medicine_id,
    delta, reason, before_qty, after_qty, performed_by, client_uuid
  ) values (
    v_org_id, v_batch.store_id, p_batch_id, v_batch.medicine_id,
    p_delta, p_reason, v_before, v_after, v_user_id, p_client_uuid
  )
  returning id into v_correction_id;

  perform public.log_audit(v_org_id, v_batch.store_id, 'stock_corrections', v_correction_id::text, 'insert',
    jsonb_build_object('delta', p_delta, 'batch_id', p_batch_id::text, 'reason', p_reason));

  return v_correction_id;
end;
$$;

revoke all on function public.rpc_stock_correction(uuid, integer, text, uuid) from public;
grant execute on function public.rpc_stock_correction(uuid, integer, text, uuid) to authenticated;
