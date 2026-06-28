-- ShelfCure Cloud — Migration 0072
-- Re-fix "column reference \"bill_number\" is ambiguous" in rpc_commit_purchase.
--
-- Migration 0029 fixed this exact error by adding `#variable_conflict use_column`
-- (the function returns `bill_number` as an OUT parameter, which otherwise
-- conflicts with the `purchases.bill_number` column in bare SELECT/RETURNING
-- references). Migration 0032 then re-issued rpc_commit_purchase to add
-- inventory_transactions logging and supplier ledger updates, but the
-- `create or replace` body omitted the directive, silently reintroducing the
-- bug for every purchase commit (manual entry and AI-scanned alike) since
-- 0032 was applied. Body is otherwise identical to 0032's version.

create or replace function public.rpc_commit_purchase(p_payload jsonb)
returns table (purchase_id uuid, bill_number text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_user_id       uuid := auth.uid();
  v_client_uuid   uuid;
  v_org_id        uuid;
  v_store_id      uuid;
  v_supplier_id   uuid;
  v_existing      record;
  v_purchase_id   uuid;
  v_bill_no       text;
  v_item          jsonb;
  v_pi_id         uuid;
  v_batch_id      uuid;
  v_qty           integer;
  v_qty_after     integer;
  v_total         numeric;
  v_paid          numeric;
  v_net_payable   numeric;
  v_sup_balance   numeric;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  v_client_uuid := (p_payload->>'client_uuid')::uuid;
  v_store_id    := (p_payload->>'store_id')::uuid;
  v_supplier_id := (p_payload->>'supplier_id')::uuid;
  v_org_id      := public.current_org();

  if v_client_uuid is null or v_store_id is null or v_supplier_id is null then
    raise exception 'missing_required_field' using errcode = '23502';
  end if;
  if public.user_role() not in ('super_admin','store_admin','pharmacist') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not public.user_has_store_access(v_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  -- Idempotency
  select id, bill_number into v_existing from public.purchases where client_uuid = v_client_uuid;
  if found then return query select v_existing.id, v_existing.bill_number; return; end if;

  v_total := coalesce((p_payload->>'total_amount')::numeric, 0);
  v_paid  := coalesce((p_payload->>'paid_amount')::numeric, 0);

  -- Insert purchase header
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
    v_total,
    coalesce(p_payload->>'payment_status','pending'),
    v_paid,
    p_payload->>'payment_method',
    (p_payload->>'payment_date')::date,
    coalesce((p_payload->>'is_ai_scanned')::boolean, false),
    p_payload->>'notes',
    v_client_uuid,
    v_user_id
  )
  returning id, bill_number into v_purchase_id, v_bill_no;

  -- Process line items
  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) loop
    v_qty := coalesce((v_item->>'quantity')::int, 0) + coalesce((v_item->>'free_quantity')::int, 0);

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

    -- Upsert batch — on conflict: add qty AND refresh rate/mrp/expiry/supplier (D25 fix)
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
      v_qty, v_qty,
      coalesce((v_item->>'purchase_rate')::numeric, 0),
      coalesce((v_item->>'mrp')::numeric, 0),
      (v_item->>'selling_price')::numeric,
      coalesce((v_item->>'gst_percentage')::numeric, 0),
      v_pi_id, v_user_id
    )
    on conflict (store_id, medicine_id, batch_number)
    do update set
      current_quantity = public.batches.current_quantity + excluded.current_quantity,
      initial_quantity = public.batches.initial_quantity + excluded.initial_quantity,
      purchase_rate    = coalesce(excluded.purchase_rate, public.batches.purchase_rate),
      mrp              = coalesce(excluded.mrp, public.batches.mrp),
      selling_price    = coalesce(excluded.selling_price, public.batches.selling_price),
      expiry_date      = coalesce(excluded.expiry_date, public.batches.expiry_date),
      supplier_id      = coalesce(excluded.supplier_id, public.batches.supplier_id),
      version          = public.batches.version + 1,
      updated_by       = excluded.updated_by
    returning id, current_quantity into v_batch_id, v_qty_after;

    -- Inventory transaction — batch_id NOT NULL, quantity_after required (schema from 0030)
    insert into public.inventory_transactions (
      org_id, store_id, batch_id, medicine_id,
      transaction_type, reference_type, reference_id,
      quantity_change, quantity_after, notes, created_by
    ) values (
      v_org_id, v_store_id, v_batch_id, (v_item->>'medicine_id')::uuid,
      'purchase', 'purchase', v_purchase_id,
      v_qty, v_qty_after,
      'Purchase #' || v_bill_no, v_user_id
    );
  end loop;

  -- Supplier ledger — lock row to compute balance_after consistently
  v_net_payable := v_total - v_paid;
  if v_net_payable > 0 then
    select outstanding_balance into v_sup_balance
    from public.suppliers where id = v_supplier_id for update;

    v_sup_balance := coalesce(v_sup_balance, 0) + v_net_payable;

    update public.suppliers
    set outstanding_balance = v_sup_balance,
        updated_at = now()
    where id = v_supplier_id;

    insert into public.supplier_ledgers (
      org_id, store_id, supplier_id,
      transaction_type, reference_type, reference_id,
      amount, balance_after, notes, created_by
    ) values (
      v_org_id, v_store_id, v_supplier_id,
      'purchase', 'purchase', v_purchase_id,
      v_net_payable, v_sup_balance,
      'Purchase #' || v_bill_no, v_user_id
    );
  end if;

  perform public.log_audit(v_org_id, v_store_id, 'purchases', v_purchase_id::text, 'insert',
    jsonb_build_object('bill_number', v_bill_no, 'supplier_id', v_supplier_id::text));

  return query select v_purchase_id, v_bill_no;
end;
$$;

revoke all on function public.rpc_commit_purchase(jsonb) from public;
grant execute on function public.rpc_commit_purchase(jsonb) to authenticated;
