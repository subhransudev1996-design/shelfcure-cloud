-- ShelfCure Cloud — Migration 0026
-- POS Phase D (Sale Complete + Print + UPI QR + WhatsApp share).
--   1. stores.upi_vpa column + matching rpc helper.
--   2. rpc_get_sale_detail extended with every field a printable bill needs:
--      store address/state/phone/gstin/drug-license/upi_vpa, org name+gstin,
--      customer address/gstin/state, special_discount, misc_charge, is_prescription,
--      doctor_name, payments breakdown (already there).

alter table public.stores
  add column if not exists upi_vpa text
    check (upi_vpa is null or upi_vpa ~ '^[A-Za-z0-9._\-]+@[A-Za-z0-9.\-]+$');

comment on column public.stores.upi_vpa is
  'UPI ID (VPA) for this store. Embedded into the bill QR per WEB_PARITY_PLAN D11.';

-- A minimal RPC to set the UPI VPA without going through the broader settings
-- form (used by the inline edit on the Sale Complete modal in Phase D).
create or replace function public.rpc_update_store_upi(
  p_store_id uuid,
  p_vpa      text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.user_role();
  v_org  uuid := public.current_org();
  v_clean text := nullif(trim(coalesce(p_vpa, '')), '');
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_role not in ('super_admin','store_admin') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org
  ) then
    raise exception 'invalid_store_id' using errcode = '23503';
  end if;

  update public.stores set upi_vpa = v_clean where id = p_store_id;
  return v_clean;
end;
$$;

revoke all on function public.rpc_update_store_upi(uuid, text) from public;
grant execute on function public.rpc_update_store_upi(uuid, text) to authenticated;


-- ============================================================================
-- rpc_get_sale_detail — extended payload for print + WhatsApp.
-- Drop+create because the return-type doesn't change (still jsonb) but we
-- want to keep the code path predictable.
-- ============================================================================

create or replace function public.rpc_get_sale_detail(p_sale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select jsonb_build_object(
    'sale', to_jsonb(s.*)
      || jsonb_build_object(
        'customer_name',     coalesce(c.name, 'Walk-in'),
        'customer_phone',    c.phone,
        'customer_address',  c.address,
        'customer_gstin',    coalesce(s.customer_gstin, c.gstin),
        'customer_state',    coalesce(s.customer_state, c.state),
        'store_name',        st.name,
        'store_code',        st.code,
        'store_address',     st.address,
        'store_city',        st.city,
        'store_state',       st.state,
        'store_pincode',     st.pincode,
        'store_phone',       st.phone,
        'store_email',       st.email,
        'store_gstin',       st.gstin,
        'store_drug_license',st.drug_license_no,
        'store_upi_vpa',     st.upi_vpa,
        'org_name',          o.name,
        'org_gstin',         o.gstin_default,
        'doctor_name_resolved', coalesce(s.doctor_name, d.name),
        'doctor_specialization', d.specialization,
        'created_by_name',   up.full_name
      ),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', si.id,
        'medicine_id', si.medicine_id,
        'medicine_name', coalesce(m.name, si.misc_note, 'Item'),
        'batch_id', si.batch_id,
        'batch_number', b.batch_number,
        'expiry_date', b.expiry_date,
        'hsn_code', m.hsn_code,
        'quantity', si.quantity,
        'mrp', si.mrp,
        'gst_percentage', si.gst_percentage,
        'taxable_amount', si.taxable_amount,
        'cgst_amount', si.cgst_amount,
        'sgst_amount', si.sgst_amount,
        'igst_amount', si.igst_amount,
        'amount', si.amount,
        'is_misc_item', si.is_misc_item,
        'misc_note', si.misc_note
      ) order by si.id), '[]'::jsonb)
      from public.sale_items si
      left join public.medicines m on m.id = si.medicine_id
      left join public.batches b on b.id = si.batch_id
      where si.sale_id = s.id
    ),
    'payments', (
      select coalesce(jsonb_agg(to_jsonb(sp.*) order by sp.created_at), '[]'::jsonb)
      from public.sale_payments sp where sp.sale_id = s.id
    )
  ) into v_sale
  from public.sales s
  join public.stores st on st.id = s.store_id
  join public.organizations o on o.id = s.org_id
  left join public.customers c on c.id = s.customer_id
  left join public.doctors d on d.id = s.doctor_id
  left join public.user_profiles up on up.id = s.created_by
  where s.id = p_sale_id
    and public.user_has_store_access(s.store_id);

  if v_sale is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return v_sale;
end;
$$;

revoke all on function public.rpc_get_sale_detail(uuid) from public;
grant execute on function public.rpc_get_sale_detail(uuid) to authenticated;
