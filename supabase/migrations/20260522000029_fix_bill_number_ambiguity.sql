-- ShelfCure Cloud — Migration 0029
-- Fix "column reference \"bill_number\" is ambiguous" in rpc_commit_sale and
-- rpc_commit_purchase. Both functions declare `returns table (... bill_number text)`
-- which Postgres exposes as an OUT parameter. Bare references to `bill_number`
-- inside SELECT and INSERT ... RETURNING then conflict with the actual table
-- column. The fix is `#variable_conflict use_column` — same directive already
-- used elsewhere in this codebase. Body otherwise unchanged.

create or replace function public.rpc_commit_sale(p_payload jsonb)
returns table (sale_id uuid, bill_number text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
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
  v_role        := public.user_role();

  if v_client_uuid is null or v_store_id is null then
    raise exception 'missing_required_field: client_uuid + store_id required' using errcode = '23502';
  end if;

  if v_role not in ('super_admin','store_admin','pharmacist','cashier') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if not public.user_has_store_access(v_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  select id, bill_number into v_existing
  from public.sales where client_uuid = v_client_uuid;

  if found then
    return query select v_existing.id, v_existing.bill_number;
    return;
  end if;

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

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) loop
    if coalesce((v_item->>'is_misc_item')::boolean, false) then
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

  if (p_payload->>'customer_id') is not null and (p_payload->>'customer_id') <> '' then
    update public.customers
    set total_purchases = total_purchases + coalesce((p_payload->>'total_amount')::numeric, 0),
        last_purchase_date = coalesce((p_payload->>'bill_date')::date, current_date),
        updated_by = v_user_id
    where id = (p_payload->>'customer_id')::uuid;
  end if;

  perform public.log_audit(
    v_org_id, v_store_id, 'sales', v_sale_id::text, 'insert',
    jsonb_build_object('bill_number', v_bill_number, 'total_amount', p_payload->'total_amount')
  );

  return query select v_sale_id, v_bill_number;
end;
$$;


create or replace function public.rpc_commit_purchase(p_payload jsonb)
returns table (purchase_id uuid, bill_number text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
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
  v_role        := public.user_role();

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
