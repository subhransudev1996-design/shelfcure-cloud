-- ShelfCure Cloud — Migration 0039
-- §2.3.A Sale Detail: extend rpc_get_sale_detail with profit fields, returned_quantity
-- per item, and item discount percentage.

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
        'customer_name',        coalesce(c.name, 'Walk-in'),
        'customer_phone',       c.phone,
        'customer_address',     c.address,
        'customer_gstin',       coalesce(s.customer_gstin, c.gstin),
        'customer_state',       coalesce(s.customer_state, c.state),
        'store_name',           st.name,
        'store_code',           st.code,
        'store_address',        st.address,
        'store_city',           st.city,
        'store_state',          st.state,
        'store_pincode',        st.pincode,
        'store_phone',          st.phone,
        'store_email',          st.email,
        'store_gstin',          st.gstin,
        'store_drug_license',   st.drug_license_no,
        'store_upi_vpa',        st.upi_vpa,
        'org_name',             o.name,
        'org_gstin',            o.gstin_default,
        'doctor_name_resolved', coalesce(s.doctor_name, d.name),
        'doctor_specialization',d.specialization,
        'created_by_name',      up.full_name,
        -- profit fields (null when no batch-linked items so UI can hide the chip)
        'cost_amount',  profit.cost_amt,
        'gross_profit', case when profit.cost_amt > 0 then s.total_amount - profit.cost_amt end,
        'profit_margin_pct',
          case when profit.cost_amt > 0 then
            round(((s.total_amount - profit.cost_amt) / nullif(s.total_amount, 0)) * 100, 1)
          end
      ),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',                 si.id,
        'medicine_id',        si.medicine_id,
        'medicine_name',      coalesce(m.name, si.misc_note, 'Item'),
        'batch_id',           si.batch_id,
        'batch_number',       b.batch_number,
        'expiry_date',        b.expiry_date,
        'hsn_code',           m.hsn_code,
        'quantity',           si.quantity,
        'returned_quantity',  si.returned_quantity,
        'mrp',                si.mrp,
        'gst_percentage',     si.gst_percentage,
        'discount_percentage',si.discount_percentage,
        'taxable_amount',     si.taxable_amount,
        'cgst_amount',        si.cgst_amount,
        'sgst_amount',        si.sgst_amount,
        'igst_amount',        si.igst_amount,
        'amount',             si.amount,
        'is_misc_item',       si.is_misc_item,
        'misc_note',          si.misc_note
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
  -- COGS lateral: sum of (qty × purchase_rate) for batch-linked items
  left join lateral (
    select coalesce(sum(si2.quantity * b2.purchase_rate), 0) as cost_amt
    from public.sale_items si2
    join public.batches b2 on b2.id = si2.batch_id
    where si2.sale_id = s.id
      and si2.batch_id is not null
      and not si2.is_misc_item
  ) profit on true
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

-- ============================================================================
-- rpc_get_prescription_signed_url — short-lived signed URL for Rx image preview
-- ============================================================================

create or replace function public.rpc_get_prescription_signed_url(p_sale_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_path text;
  v_url  text;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select prescription_image_path into v_path
  from public.sales
  where id = p_sale_id
    and public.user_has_store_access(store_id);

  if v_path is null then
    return null;
  end if;

  -- Delegate to Supabase Storage HTTP API via extensions.http (available in pg_net)
  -- The signed URL is generated client-side by the supabase-js SDK with createSignedUrl;
  -- this RPC only validates access so the client can call storage.from('prescriptions').createSignedUrl.
  -- Return the path so the caller knows the bucket object key.
  return v_path;
end;
$$;

revoke all on function public.rpc_get_prescription_signed_url(uuid) from public;
grant execute on function public.rpc_get_prescription_signed_url(uuid) to authenticated;
