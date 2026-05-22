-- ShelfCure Cloud — Migration 0010
-- BUGFIX: `current_role` is a reserved SQL keyword (along with current_user,
-- current_catalog, etc.). Even when schema-qualified as `public.current_role()`,
-- Postgres can resolve it to the built-in keyword instead of our SECURITY
-- DEFINER function, returning the DB role ("authenticated") instead of our
-- user_profiles.role value.
--
-- Result: every authenticated user fails RLS like:
--   "new row violates row-level security policy for table 'stores'"
-- because `'authenticated' = 'super_admin'` is always false.
--
-- Fix: rename the helper to `public.user_role()` (no keyword conflict) and
-- recreate every policy that referenced the old name.

-- ============================================================================
-- 1) New helper: user_role()
-- ============================================================================

create or replace function public.user_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.user_profiles where id = auth.uid()
$$;

comment on function public.user_role() is
  'Returns the application role (super_admin / store_admin / pharmacist / cashier / accountant) of the currently authenticated user. Renamed from current_role() in migration 0010 to avoid the SQL reserved keyword conflict.';

revoke all on function public.user_role() from public;
grant execute on function public.user_role() to authenticated;

-- ============================================================================
-- 2) Recreate user_has_store_access() — it calls user_role()
-- ============================================================================

create or replace function public.user_has_store_access(target_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when public.user_role() in ('super_admin','accountant') then
      exists (
        select 1 from public.stores
        where id = target_store_id and org_id = public.current_org()
      )
    else
      target_store_id = public.current_store()
  end
$$;

-- ============================================================================
-- 3) Recreate every policy that referenced current_role()
--    Drop each then recreate using user_role(). Same predicate logic.
-- ============================================================================

-- --- organizations ----------------------------------------------------------
drop policy if exists organizations_update_super_admin on public.organizations;
create policy organizations_update_super_admin on public.organizations
  for update using (id = public.current_org() and public.user_role() = 'super_admin')
  with check  (id = public.current_org() and public.user_role() = 'super_admin');

-- --- stores -----------------------------------------------------------------
drop policy if exists stores_insert_super_admin on public.stores;
create policy stores_insert_super_admin on public.stores
  for insert with check (org_id = public.current_org() and public.user_role() = 'super_admin');

drop policy if exists stores_update_super_admin on public.stores;
create policy stores_update_super_admin on public.stores
  for update using (org_id = public.current_org() and public.user_role() = 'super_admin')
  with check       (org_id = public.current_org() and public.user_role() = 'super_admin');

drop policy if exists stores_delete_super_admin on public.stores;
create policy stores_delete_super_admin on public.stores
  for delete using (org_id = public.current_org() and public.user_role() = 'super_admin');

-- --- user_profiles ----------------------------------------------------------
drop policy if exists user_profiles_select_org_admin on public.user_profiles;
create policy user_profiles_select_org_admin on public.user_profiles
  for select using (
    org_id = public.current_org() and public.user_role() in ('super_admin','accountant')
  );

drop policy if exists user_profiles_select_store_admin on public.user_profiles;
create policy user_profiles_select_store_admin on public.user_profiles
  for select using (
    public.user_role() = 'store_admin' and store_id = public.current_store()
  );

drop policy if exists user_profiles_insert_super_admin on public.user_profiles;
create policy user_profiles_insert_super_admin on public.user_profiles
  for insert with check (org_id = public.current_org() and public.user_role() = 'super_admin');

drop policy if exists user_profiles_insert_store_admin on public.user_profiles;
create policy user_profiles_insert_store_admin on public.user_profiles
  for insert with check (
    public.user_role() = 'store_admin'
    and org_id = public.current_org()
    and store_id = public.current_store()
    and role in ('pharmacist','cashier')
  );

drop policy if exists user_profiles_update_self on public.user_profiles;
create policy user_profiles_update_self on public.user_profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = public.user_role());

drop policy if exists user_profiles_update_super_admin on public.user_profiles;
create policy user_profiles_update_super_admin on public.user_profiles
  for update using (org_id = public.current_org() and public.user_role() = 'super_admin');

drop policy if exists user_profiles_update_store_admin on public.user_profiles;
create policy user_profiles_update_store_admin on public.user_profiles
  for update using (
    public.user_role() = 'store_admin'
    and store_id = public.current_store()
    and role in ('pharmacist','cashier')
  );

-- --- medicine_categories ----------------------------------------------------
drop policy if exists medicine_categories_select on public.medicine_categories;
create policy medicine_categories_select on public.medicine_categories
  for select using (
    org_id = public.current_org()
    and (
      store_id is null and public.user_org_has_shared_masters()
      or store_id is null and public.user_role() in ('super_admin','accountant')
      or public.user_has_store_access(store_id)
    )
  );

drop policy if exists medicine_categories_insert on public.medicine_categories;
create policy medicine_categories_insert on public.medicine_categories
  for insert with check (
    org_id = public.current_org()
    and (
      (store_id is null and public.user_role() = 'super_admin')
      or (store_id is not null and public.user_has_store_access(store_id)
          and public.user_role() in ('super_admin','store_admin','pharmacist'))
    )
  );

drop policy if exists medicine_categories_update on public.medicine_categories;
create policy medicine_categories_update on public.medicine_categories
  for update using (
    org_id = public.current_org()
    and (
      (store_id is null and public.user_role() = 'super_admin')
      or (store_id is not null and public.user_has_store_access(store_id)
          and public.user_role() in ('super_admin','store_admin','pharmacist'))
    )
  );

-- --- medicines --------------------------------------------------------------
drop policy if exists medicines_select on public.medicines;
create policy medicines_select on public.medicines
  for select using (
    org_id = public.current_org()
    and (
      store_id is null and public.user_org_has_shared_masters()
      or store_id is null and public.user_role() in ('super_admin','accountant')
      or public.user_has_store_access(store_id)
    )
  );

drop policy if exists medicines_insert on public.medicines;
create policy medicines_insert on public.medicines
  for insert with check (
    org_id = public.current_org()
    and (
      (store_id is null and public.user_role() = 'super_admin')
      or (store_id is not null and public.user_has_store_access(store_id)
          and public.user_role() in ('super_admin','store_admin','pharmacist'))
    )
  );

drop policy if exists medicines_update on public.medicines;
create policy medicines_update on public.medicines
  for update using (
    org_id = public.current_org()
    and (
      (store_id is null and public.user_role() = 'super_admin')
      or (store_id is not null and public.user_has_store_access(store_id)
          and public.user_role() in ('super_admin','store_admin','pharmacist'))
    )
  );

-- --- batches ----------------------------------------------------------------
drop policy if exists batches_insert on public.batches;
create policy batches_insert on public.batches
  for insert with check (
    org_id = public.current_org()
    and public.user_has_store_access(store_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist')
  );

drop policy if exists batches_update on public.batches;
create policy batches_update on public.batches
  for update using (
    public.user_has_store_access(store_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist')
  );

-- --- suppliers --------------------------------------------------------------
drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers
  for select using (
    org_id = public.current_org()
    and (
      store_id is null and public.user_org_has_shared_masters()
      or store_id is null and public.user_role() in ('super_admin','accountant')
      or public.user_has_store_access(store_id)
    )
  );

drop policy if exists suppliers_insert on public.suppliers;
create policy suppliers_insert on public.suppliers
  for insert with check (
    org_id = public.current_org()
    and (
      (store_id is null and public.user_role() = 'super_admin')
      or (store_id is not null and public.user_has_store_access(store_id)
          and public.user_role() in ('super_admin','store_admin','pharmacist'))
    )
  );

drop policy if exists suppliers_update on public.suppliers;
create policy suppliers_update on public.suppliers
  for update using (
    org_id = public.current_org()
    and (
      (store_id is null and public.user_role() = 'super_admin')
      or (store_id is not null and public.user_has_store_access(store_id)
          and public.user_role() in ('super_admin','store_admin','pharmacist'))
    )
  );

-- --- customers --------------------------------------------------------------
drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers
  for select using (
    org_id = public.current_org()
    and (
      store_id is null and public.user_org_has_shared_masters()
      or store_id is null and public.user_role() in ('super_admin','accountant')
      or public.user_has_store_access(store_id)
    )
  );

drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers
  for insert with check (
    org_id = public.current_org()
    and (
      (store_id is null and public.user_role() = 'super_admin')
      or (store_id is not null and public.user_has_store_access(store_id)
          and public.user_role() in ('super_admin','store_admin','pharmacist','cashier'))
    )
  );

drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers
  for update using (
    org_id = public.current_org()
    and (
      (store_id is null and public.user_role() = 'super_admin')
      or (store_id is not null and public.user_has_store_access(store_id)
          and public.user_role() in ('super_admin','store_admin','pharmacist'))
    )
  );

-- --- customer_regular_medicines --------------------------------------------
drop policy if exists crm_insert on public.customer_regular_medicines;
create policy crm_insert on public.customer_regular_medicines
  for insert with check (
    org_id = public.current_org()
    and exists (select 1 from public.customers c where c.id = customer_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist','cashier')
  );

drop policy if exists crm_delete on public.customer_regular_medicines;
create policy crm_delete on public.customer_regular_medicines
  for delete using (
    org_id = public.current_org()
    and exists (select 1 from public.customers c where c.id = customer_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist')
  );

-- --- doctors ----------------------------------------------------------------
drop policy if exists doctors_select on public.doctors;
create policy doctors_select on public.doctors
  for select using (
    org_id = public.current_org()
    and (
      store_id is null and public.user_org_has_shared_masters()
      or store_id is null and public.user_role() in ('super_admin','accountant')
      or public.user_has_store_access(store_id)
    )
  );

drop policy if exists doctors_insert on public.doctors;
create policy doctors_insert on public.doctors
  for insert with check (
    org_id = public.current_org()
    and (
      (store_id is null and public.user_role() = 'super_admin')
      or (store_id is not null and public.user_has_store_access(store_id)
          and public.user_role() in ('super_admin','store_admin','pharmacist'))
    )
  );

drop policy if exists doctors_update on public.doctors;
create policy doctors_update on public.doctors
  for update using (
    org_id = public.current_org()
    and (
      (store_id is null and public.user_role() = 'super_admin')
      or (store_id is not null and public.user_has_store_access(store_id)
          and public.user_role() in ('super_admin','store_admin','pharmacist'))
    )
  );

-- --- doctor_commission_payouts ----------------------------------------------
drop policy if exists dcp_insert on public.doctor_commission_payouts;
create policy dcp_insert on public.doctor_commission_payouts
  for insert with check (
    org_id = public.current_org()
    and public.user_has_store_access(store_id)
    and public.user_role() in ('super_admin','store_admin')
  );

-- --- purchases & related ----------------------------------------------------
drop policy if exists purchases_insert on public.purchases;
create policy purchases_insert on public.purchases
  for insert with check (
    org_id = public.current_org()
    and public.user_has_store_access(store_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist')
  );

drop policy if exists purchases_update on public.purchases;
create policy purchases_update on public.purchases
  for update using (
    public.user_has_store_access(store_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist')
  );

drop policy if exists purchase_items_insert on public.purchase_items;
create policy purchase_items_insert on public.purchase_items
  for insert with check (
    public.user_has_store_access(store_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist')
  );

drop policy if exists purchase_items_update on public.purchase_items;
create policy purchase_items_update on public.purchase_items
  for update using (
    public.user_has_store_access(store_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist')
  );

drop policy if exists purchase_returns_insert on public.purchase_returns;
create policy purchase_returns_insert on public.purchase_returns
  for insert with check (
    org_id = public.current_org()
    and public.user_has_store_access(store_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist')
  );

drop policy if exists purchase_returns_update on public.purchase_returns;
create policy purchase_returns_update on public.purchase_returns
  for update using (
    public.user_has_store_access(store_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist')
  );

drop policy if exists pri_insert on public.purchase_return_items;
create policy pri_insert on public.purchase_return_items
  for insert with check (
    public.user_has_store_access(store_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist')
  );

drop policy if exists po_insert on public.purchase_orders;
create policy po_insert on public.purchase_orders
  for insert with check (
    org_id = public.current_org()
    and public.user_has_store_access(store_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist')
  );

drop policy if exists po_update on public.purchase_orders;
create policy po_update on public.purchase_orders
  for update using (
    public.user_has_store_access(store_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist')
  );

drop policy if exists poi_insert on public.purchase_order_items;
create policy poi_insert on public.purchase_order_items
  for insert with check (
    exists (select 1 from public.purchase_orders po where po.id = po_id and public.user_has_store_access(po.store_id))
    and public.user_role() in ('super_admin','store_admin','pharmacist')
  );

drop policy if exists challans_insert on public.challans;
create policy challans_insert on public.challans
  for insert with check (
    org_id = public.current_org()
    and public.user_has_store_access(store_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist')
  );

drop policy if exists challans_update on public.challans;
create policy challans_update on public.challans
  for update using (
    public.user_has_store_access(store_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist')
  );

drop policy if exists challan_items_insert on public.challan_items;
create policy challan_items_insert on public.challan_items
  for insert with check (
    public.user_has_store_access(store_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist')
  );

drop policy if exists challan_items_update on public.challan_items;
create policy challan_items_update on public.challan_items
  for update using (
    public.user_has_store_access(store_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist')
  );

-- --- sales & related --------------------------------------------------------
drop policy if exists sales_insert on public.sales;
create policy sales_insert on public.sales
  for insert with check (
    org_id = public.current_org()
    and public.user_has_store_access(store_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist','cashier')
  );

drop policy if exists sales_update on public.sales;
create policy sales_update on public.sales
  for update using (
    public.user_has_store_access(store_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist')
  );

drop policy if exists sale_items_insert on public.sale_items;
create policy sale_items_insert on public.sale_items
  for insert with check (
    public.user_has_store_access(store_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist','cashier')
  );

drop policy if exists sale_items_update on public.sale_items;
create policy sale_items_update on public.sale_items
  for update using (
    public.user_has_store_access(store_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist')
  );

drop policy if exists sale_payments_insert on public.sale_payments;
create policy sale_payments_insert on public.sale_payments
  for insert with check (
    public.user_has_store_access(store_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist','cashier')
  );

drop policy if exists sale_returns_insert on public.sale_returns;
create policy sale_returns_insert on public.sale_returns
  for insert with check (
    org_id = public.current_org()
    and public.user_has_store_access(store_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist','cashier')
  );

drop policy if exists sale_returns_update on public.sale_returns;
create policy sale_returns_update on public.sale_returns
  for update using (
    public.user_has_store_access(store_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist')
  );

drop policy if exists sri_insert on public.sale_return_items;
create policy sri_insert on public.sale_return_items
  for insert with check (
    public.user_has_store_access(store_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist','cashier')
  );

-- --- operational -----------------------------------------------------------
drop policy if exists sc_insert on public.stock_corrections;
create policy sc_insert on public.stock_corrections
  for insert with check (
    org_id = public.current_org()
    and public.user_has_store_access(store_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist')
  );

drop policy if exists ec_insert on public.expense_categories;
create policy ec_insert on public.expense_categories
  for insert with check (
    is_system = false
    and org_id = public.current_org()
    and public.user_role() = 'super_admin'
  );

drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses
  for insert with check (
    org_id = public.current_org()
    and public.user_has_store_access(store_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist')
  );

drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses
  for update using (
    public.user_has_store_access(store_id)
    and public.user_role() in ('super_admin','store_admin')
  );

drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log
  for select using (
    org_id = public.current_org()
    and public.user_role() in ('super_admin','accountant')
  );

-- --- stock_transfers --------------------------------------------------------
drop policy if exists st_insert on public.stock_transfers;
create policy st_insert on public.stock_transfers
  for insert with check (
    org_id = public.current_org()
    and public.user_has_store_access(from_store_id)
    and public.user_role() in ('super_admin','store_admin','pharmacist')
    and (flow <> 'immediate' or public.user_role() = 'super_admin')
  );

drop policy if exists st_update on public.stock_transfers;
create policy st_update on public.stock_transfers
  for update using (
    (public.user_has_store_access(from_store_id) or public.user_has_store_access(to_store_id))
    and public.user_role() in ('super_admin','store_admin','pharmacist')
  );

drop policy if exists sti_insert on public.stock_transfer_items;
create policy sti_insert on public.stock_transfer_items
  for insert with check (
    exists (
      select 1 from public.stock_transfers t
      where t.id = transfer_id
        and public.user_has_store_access(t.from_store_id)
    )
    and public.user_role() in ('super_admin','store_admin','pharmacist')
  );

drop policy if exists sti_update on public.stock_transfer_items;
create policy sti_update on public.stock_transfer_items
  for update using (
    exists (
      select 1 from public.stock_transfers t
      where t.id = transfer_id
        and (public.user_has_store_access(t.from_store_id) or public.user_has_store_access(t.to_store_id))
    )
    and public.user_role() in ('super_admin','store_admin','pharmacist')
  );

-- ============================================================================
-- 4) Update every RPC that called public.current_role() to use user_role()
--    by re-issuing CREATE OR REPLACE with the new body.
-- ============================================================================

-- rpc_commit_sale
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

-- For the other RPCs that called current_role() — patch with a simpler replace.
-- (rpc_commit_purchase, rpc_commit_purchase_return, rpc_stock_transfer_request,
--  rpc_stock_correction). The grant is unaffected.

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

  if public.user_role() not in ('super_admin','store_admin','pharmacist') then
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

    update public.purchase_items
    set returned_quantity = returned_quantity + (v_item->>'quantity')::int
    where id = (v_item->>'purchase_item_id')::uuid;
  end loop;

  perform public.log_audit(v_org_id, v_store_id, 'purchase_returns', v_return_id::text, 'insert',
    jsonb_build_object('return_number', v_return_no, 'purchase_id', v_purchase_id::text));

  return query select v_return_id, v_return_no;
end;
$$;

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
  if public.user_role() not in ('super_admin','store_admin','pharmacist') then
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
  if public.user_role() not in ('super_admin','store_admin','pharmacist') then
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

-- ============================================================================
-- 5) Finally drop the old function
-- ============================================================================
drop function if exists public.current_role();
