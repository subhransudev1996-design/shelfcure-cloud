-- ShelfCure Cloud — Migration 0030
-- WEB_PARITY_PLAN §2.6.5 Purchase Returns (create + list + detail).
--
-- Adds the two cross-cutting audit-trail tables (§2.6.8) that purchase
-- returns depend on, then rewrites rpc_commit_purchase_return to fully
-- replicate desktop's create_purchase_return() side effects, and adds the
-- list/detail/update/delete RPCs plus a search RPC for the create-return flow.

-- ============================================================================
-- inventory_transactions — append-only stock-movement audit log
-- ============================================================================

create table public.inventory_transactions (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete restrict,
  store_id          uuid not null references public.stores(id) on delete restrict,
  batch_id          uuid not null references public.batches(id) on delete restrict,
  medicine_id       uuid not null references public.medicines(id) on delete restrict,
  transaction_type  text not null check (transaction_type in
                      ('purchase','sale','purchase_return','sale_return','adjustment','transfer_out','transfer_in','expired')),
  reference_type    text,
  reference_id      uuid,
  quantity_change   integer not null,
  quantity_after    integer not null,
  notes             text,
  created_by        uuid references public.user_profiles(id),
  created_at        timestamptz not null default now()
);

comment on table public.inventory_transactions is
  'Append-only audit trail of every stock movement (purchases, sales, returns, adjustments, transfers).';

create index inventory_transactions_batch_idx on public.inventory_transactions (batch_id, created_at desc);
create index inventory_transactions_store_idx on public.inventory_transactions (store_id, created_at desc);

alter table public.inventory_transactions enable row level security;

create policy inventory_transactions_select on public.inventory_transactions
  for select using (public.user_has_store_access(store_id));

create policy inventory_transactions_insert on public.inventory_transactions
  for insert with check (public.user_has_store_access(store_id));

grant select, insert on public.inventory_transactions to authenticated;

-- ============================================================================
-- supplier_ledgers — append-only supplier balance audit log
-- ============================================================================

create table public.supplier_ledgers (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete restrict,
  store_id        uuid not null references public.stores(id) on delete restrict,
  supplier_id     uuid not null references public.suppliers(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('purchase','payment','return','adjustment')),
  reference_type  text,
  reference_id    uuid,
  amount          numeric(14,2) not null,
  balance_after   numeric(14,2) not null,
  payment_method  text,
  notes           text,
  created_by      uuid references public.user_profiles(id),
  created_at      timestamptz not null default now()
);

comment on table public.supplier_ledgers is
  'Append-only audit trail of every supplier outstanding-balance change (purchases, payments, returns).';

create index supplier_ledgers_supplier_idx on public.supplier_ledgers (supplier_id, created_at desc);
create index supplier_ledgers_store_idx on public.supplier_ledgers (store_id, created_at desc);

alter table public.supplier_ledgers enable row level security;

create policy supplier_ledgers_select on public.supplier_ledgers
  for select using (public.user_has_store_access(store_id));

create policy supplier_ledgers_insert on public.supplier_ledgers
  for insert with check (public.user_has_store_access(store_id));

grant select, insert on public.supplier_ledgers to authenticated;

-- ============================================================================
-- rpc_commit_purchase_return — full rewrite
--   + server-generated return_number ("PR-{:06}")
--   + inventory_transactions logging (negative, 'purchase_return')
--   + supplier outstanding_balance reduction + supplier_ledgers entry
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
  v_seq         integer;
  v_item        jsonb;
  v_batch_qty   integer;
  v_new_qty     integer;
  v_balance     numeric(14,2);
  v_total       numeric(14,2);
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  v_client_uuid := (p_payload->>'client_uuid')::uuid;
  v_store_id    := (p_payload->>'store_id')::uuid;
  v_purchase_id := (p_payload->>'purchase_id')::uuid;
  v_supplier_id := (p_payload->>'supplier_id')::uuid;
  v_org_id      := public.current_org();
  v_total       := coalesce((p_payload->>'total_amount')::numeric, 0);

  if v_client_uuid is null or v_store_id is null or v_purchase_id is null or v_supplier_id is null then
    raise exception 'missing_required_field' using errcode = '23502';
  end if;

  if public.user_role() not in ('super_admin','store_admin','pharmacist') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not public.user_has_store_access(v_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  select id, return_number into v_existing from public.purchase_returns where client_uuid = v_client_uuid;
  if found then return query select v_existing.id, v_existing.return_number; return; end if;

  -- Generate return_number = "PR-{:06}" per store.
  select coalesce(max(substring(return_number from 'PR-(\d+)')::int), 0) + 1
    into v_seq
  from public.purchase_returns
  where store_id = v_store_id;

  v_return_no := 'PR-' || lpad(v_seq::text, 6, '0');

  insert into public.purchase_returns (
    org_id, store_id, purchase_id, supplier_id,
    return_number, return_date,
    subtotal, gst_amount, total_amount, reason,
    client_uuid, created_by
  ) values (
    v_org_id, v_store_id, v_purchase_id, v_supplier_id,
    v_return_no,
    coalesce((p_payload->>'return_date')::date, current_date),
    coalesce((p_payload->>'subtotal')::numeric, 0),
    coalesce((p_payload->>'gst_amount')::numeric, 0),
    v_total,
    p_payload->>'reason',
    v_client_uuid, v_user_id
  )
  returning id, return_number into v_return_id, v_return_no;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) loop
    select current_quantity into v_batch_qty
    from public.batches
    where id = (v_item->>'batch_id')::uuid
    for update;

    if v_batch_qty is null or v_batch_qty < (v_item->>'quantity')::int then
      raise exception 'insufficient_stock for purchase return on batch %', v_item->>'batch_id' using errcode = '23514';
    end if;

    v_new_qty := v_batch_qty - (v_item->>'quantity')::int;

    update public.batches
    set current_quantity = v_new_qty,
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

    update public.purchase_items
    set returned_quantity = returned_quantity + (v_item->>'quantity')::int
    where id = (v_item->>'purchase_item_id')::uuid;

    insert into public.inventory_transactions (
      org_id, store_id, batch_id, medicine_id,
      transaction_type, reference_type, reference_id,
      quantity_change, quantity_after, notes, created_by
    ) values (
      v_org_id, v_store_id, (v_item->>'batch_id')::uuid, (v_item->>'medicine_id')::uuid,
      'purchase_return', 'purchase_return', v_return_id,
      -((v_item->>'quantity')::int), v_new_qty,
      'Purchase Return #' || v_return_no, v_user_id
    );
  end loop;

  -- Reduce supplier outstanding balance (we owe them less after the return).
  select outstanding_balance into v_balance from public.suppliers where id = v_supplier_id for update;
  v_balance := greatest(0, coalesce(v_balance, 0) - v_total);

  update public.suppliers
  set outstanding_balance = v_balance,
      updated_at = now()
  where id = v_supplier_id;

  insert into public.supplier_ledgers (
    org_id, store_id, supplier_id, transaction_type, reference_type, reference_id,
    amount, balance_after, notes, created_by
  ) values (
    v_org_id, v_store_id, v_supplier_id, 'return', 'purchase_return', v_return_id,
    v_total, v_balance, 'Purchase Return #' || v_return_no, v_user_id
  );

  perform public.log_audit(v_org_id, v_store_id, 'purchase_returns', v_return_id::text, 'insert',
    jsonb_build_object('return_number', v_return_no, 'purchase_id', v_purchase_id::text));

  return query select v_return_id, v_return_no;
end;
$$;

revoke all on function public.rpc_commit_purchase_return(jsonb) from public;
grant execute on function public.rpc_commit_purchase_return(jsonb) to authenticated;

-- ============================================================================
-- rpc_get_purchase_for_return — search a purchase by bill number for the
-- Create Return flow (§2.6.5.a)
-- ============================================================================

create or replace function public.rpc_get_purchase_for_return(p_store_id uuid, p_bill_number text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_purchase record;
  v_result   jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  select p.id, p.bill_number, p.bill_date, p.supplier_id, p.subtotal, p.gst_amount, p.total_amount
    into v_purchase
  from public.purchases p
  where p.store_id = p_store_id
    and p.deleted_at is null
    and p.bill_number = p_bill_number
  order by p.bill_date desc
  limit 1;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'purchase', jsonb_build_object(
      'id', v_purchase.id,
      'bill_number', v_purchase.bill_number,
      'bill_date', v_purchase.bill_date,
      'supplier_id', v_purchase.supplier_id,
      'supplier_name', sup.name,
      'subtotal', v_purchase.subtotal,
      'gst_amount', v_purchase.gst_amount,
      'total_amount', v_purchase.total_amount
    ),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', pi.id,
        'medicine_id', pi.medicine_id,
        'medicine_name', m.name,
        'batch_id', b.id,
        'batch_number', b.batch_number,
        'quantity', pi.quantity,
        'free_quantity', pi.free_quantity,
        'returned_quantity', pi.returned_quantity,
        'amount', pi.amount,
        'gst_percentage', pi.gst_percentage,
        'batch_current_quantity', coalesce(b.current_quantity, 0),
        'sold_quantity', coalesce(sq.sold, 0),
        'sale_unit_mode', coalesce(m.sale_unit_mode, 'pack_only'),
        'units_per_pack', coalesce(m.units_per_pack, 1)
      ) order by pi.id), '[]'::jsonb)
      from public.purchase_items pi
      left join public.medicines m on m.id = pi.medicine_id
      left join public.batches b on b.purchase_item_id = pi.id
      left join lateral (
        select sum(si.quantity) as sold
        from public.sale_items si
        join public.sales s on s.id = si.sale_id
        where si.batch_id = b.id and s.deleted_at is null
      ) sq on true
      where pi.purchase_id = v_purchase.id
    )
  ) into v_result
  from public.suppliers sup
  where sup.id = v_purchase.supplier_id;

  return v_result;
end;
$$;

revoke all on function public.rpc_get_purchase_for_return(uuid, text) from public;
grant execute on function public.rpc_get_purchase_for_return(uuid, text) to authenticated;

-- ============================================================================
-- rpc_list_purchase_returns
-- ============================================================================

create or replace function public.rpc_list_purchase_returns(p_store_id uuid, p_limit integer default 100)
returns table (
  id            uuid,
  return_number text,
  return_date   date,
  bill_number   text,
  supplier_id   uuid,
  supplier_name text,
  total_amount  numeric,
  item_count    bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_lim integer := greatest(1, least(coalesce(p_limit, 100), 500));
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  return query
  select
    pr.id, pr.return_number, pr.return_date,
    p.bill_number, pr.supplier_id, sup.name,
    pr.total_amount,
    (select count(*) from public.purchase_return_items pri where pri.purchase_return_id = pr.id)
  from public.purchase_returns pr
  left join public.purchases p on p.id = pr.purchase_id
  left join public.suppliers sup on sup.id = pr.supplier_id
  where pr.store_id = p_store_id
    and pr.deleted_at is null
  order by pr.return_date desc, pr.created_at desc
  limit v_lim;
end;
$$;

revoke all on function public.rpc_list_purchase_returns(uuid, integer) from public;
grant execute on function public.rpc_list_purchase_returns(uuid, integer) to authenticated;

-- ============================================================================
-- rpc_get_purchase_return_detail
-- ============================================================================

create or replace function public.rpc_get_purchase_return_detail(p_return_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_header     jsonb;
  v_items      jsonb;
  v_items_sum  numeric;
  v_header_total numeric;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select jsonb_build_object(
    'id', pr.id,
    'return_number', pr.return_number,
    'return_date', pr.return_date,
    'subtotal', pr.subtotal,
    'gst_amount', pr.gst_amount,
    'total_amount', pr.total_amount,
    'reason', pr.reason,
    'purchase_id', pr.purchase_id,
    'bill_number', p.bill_number,
    'bill_date', p.bill_date,
    'supplier_id', pr.supplier_id,
    'supplier_name', sup.name
  ) into v_header
  from public.purchase_returns pr
  left join public.purchases p on p.id = pr.purchase_id
  left join public.suppliers sup on sup.id = pr.supplier_id
  where pr.id = p_return_id
    and pr.deleted_at is null
    and public.user_has_store_access(pr.store_id);

  if v_header is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pri.id,
    'medicine_id', pri.medicine_id,
    'medicine_name', m.name,
    'batch_id', pri.batch_id,
    'batch_number', case when b.medicine_id = pri.medicine_id then b.batch_number end,
    'quantity', pri.quantity,
    'amount', pri.amount,
    'purchase_rate', coalesce(
      pi.purchase_rate,
      case when pri.quantity > 0 then pri.amount / pri.quantity end,
      b.purchase_rate,
      0
    ),
    'gst_percentage', coalesce(pi.gst_percentage, b.gst_percentage, 0),
    'sale_unit_mode', coalesce(m.sale_unit_mode, 'pack_only'),
    'units_per_pack', coalesce(m.units_per_pack, 1)
  ) order by pri.id), '[]'::jsonb), coalesce(sum(pri.amount), 0)
  into v_items, v_items_sum
  from public.purchase_return_items pri
  left join public.medicines m on m.id = pri.medicine_id
  left join public.batches b on b.id = pri.batch_id
  left join public.purchase_items pi on pi.id = pri.purchase_item_id
  where pri.purchase_return_id = p_return_id;

  v_header_total := coalesce((v_header->>'total_amount')::numeric, 0);

  return jsonb_build_object(
    'header', v_header,
    'items', v_items,
    'items_incomplete', (abs(v_items_sum - v_header_total) > 0.05 and v_header_total > 0),
    'items_sum', round(v_items_sum, 2)
  );
end;
$$;

revoke all on function public.rpc_get_purchase_return_detail(uuid) from public;
grant execute on function public.rpc_get_purchase_return_detail(uuid) to authenticated;

-- ============================================================================
-- rpc_update_purchase_return — date/reason/per-item amounts; recalcs totals
-- ============================================================================

create or replace function public.rpc_update_purchase_return(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_return_id uuid := (p_payload->>'id')::uuid;
  v_store_id  uuid;
  v_org_id    uuid;
  v_item      jsonb;
  v_new_total numeric;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_return_id is null then raise exception 'missing_required_field' using errcode = '23502'; end if;

  select store_id, org_id into v_store_id, v_org_id
  from public.purchase_returns
  where id = v_return_id and deleted_at is null;

  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if public.user_role() not in ('super_admin','store_admin','pharmacist') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not public.user_has_store_access(v_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) loop
    update public.purchase_return_items
    set amount = coalesce((v_item->>'amount')::numeric, amount)
    where id = (v_item->>'id')::uuid and purchase_return_id = v_return_id;
  end loop;

  select coalesce(sum(amount), 0) into v_new_total
  from public.purchase_return_items
  where purchase_return_id = v_return_id;

  update public.purchase_returns
  set return_date = coalesce((p_payload->>'return_date')::date, return_date),
      reason      = coalesce(p_payload->>'reason', reason),
      subtotal    = v_new_total,
      total_amount = v_new_total,
      version     = version + 1
  where id = v_return_id;

  perform public.log_audit(v_org_id, v_store_id, 'purchase_returns', v_return_id::text, 'update',
    jsonb_build_object('total_amount', v_new_total));
end;
$$;

revoke all on function public.rpc_update_purchase_return(jsonb) from public;
grant execute on function public.rpc_update_purchase_return(jsonb) to authenticated;

-- ============================================================================
-- rpc_delete_purchase_return — full reversal (batch, inventory_transactions,
-- returned_quantity, supplier ledger). Skips reversal if purchase_id is null.
-- ============================================================================

create or replace function public.rpc_delete_purchase_return(p_return_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id     uuid := auth.uid();
  v_return      record;
  v_item        record;
  v_new_qty     integer;
  v_balance     numeric(14,2);
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select id, org_id, store_id, purchase_id, supplier_id, total_amount, return_number
    into v_return
  from public.purchase_returns
  where id = p_return_id and deleted_at is null;

  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if public.user_role() not in ('super_admin','store_admin','pharmacist') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not public.user_has_store_access(v_return.store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  if v_return.purchase_id is not null then
    for v_item in
      select pri.batch_id, pri.medicine_id, pri.quantity, pri.purchase_item_id
      from public.purchase_return_items pri
      where pri.purchase_return_id = v_return.id
    loop
      update public.batches
      set current_quantity = current_quantity + v_item.quantity,
          version = version + 1,
          updated_by = v_user_id
      where id = v_item.batch_id
      returning current_quantity into v_new_qty;

      insert into public.inventory_transactions (
        org_id, store_id, batch_id, medicine_id,
        transaction_type, reference_type, reference_id,
        quantity_change, quantity_after, notes, created_by
      ) values (
        v_return.org_id, v_return.store_id, v_item.batch_id, v_item.medicine_id,
        'adjustment', 'purchase_return_delete', v_return.id,
        v_item.quantity, v_new_qty, 'Purchase return deleted', v_user_id
      );

      if v_item.purchase_item_id is not null then
        update public.purchase_items
        set returned_quantity = greatest(0, returned_quantity - v_item.quantity)
        where id = v_item.purchase_item_id;
      end if;
    end loop;

    select outstanding_balance into v_balance from public.suppliers where id = v_return.supplier_id for update;
    v_balance := coalesce(v_balance, 0) + v_return.total_amount;

    update public.suppliers
    set outstanding_balance = v_balance,
        updated_at = now()
    where id = v_return.supplier_id;

    insert into public.supplier_ledgers (
      org_id, store_id, supplier_id, transaction_type, reference_type, reference_id,
      amount, balance_after, notes, created_by
    ) values (
      v_return.org_id, v_return.store_id, v_return.supplier_id, 'adjustment', 'purchase_return_delete', v_return.id,
      v_return.total_amount, v_balance, 'Purchase return deleted', v_user_id
    );
  end if;

  update public.purchase_returns set deleted_at = now() where id = v_return.id;

  perform public.log_audit(v_return.org_id, v_return.store_id, 'purchase_returns', v_return.id::text, 'delete',
    jsonb_build_object('return_number', v_return.return_number));
end;
$$;

revoke all on function public.rpc_delete_purchase_return(uuid) from public;
grant execute on function public.rpc_delete_purchase_return(uuid) to authenticated;
