-- ShelfCure Cloud — Migration 0024
-- POS Phase B (cart power tools):
--   1. rpc_pos_list_batches_for_medicine — lists ALL in-stock, non-expired batches
--      for one medicine so the cashier can pick a non-FEFO batch (swap-batch flow).
--   2. Storage bucket `prescriptions` with per-org RLS — backs the prescription
--      image upload on the POS doctor/prescription section (D10 default).

-- ============================================================================
-- 1. rpc_pos_list_batches_for_medicine
-- ============================================================================

create or replace function public.rpc_pos_list_batches_for_medicine(
  p_store_id    uuid,
  p_medicine_id uuid
)
returns table (
  batch_id        uuid,
  batch_number    text,
  expiry_date     date,
  current_quantity integer,
  mrp             numeric,
  selling_price   numeric,
  purchase_rate   numeric,
  gst_percentage  numeric,
  days_to_expiry  integer,
  supplier_name   text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  return query
  select
    b.id, b.batch_number, b.expiry_date, b.current_quantity::integer,
    b.mrp, b.selling_price, b.purchase_rate, b.gst_percentage,
    (b.expiry_date - current_date)::integer,
    sup.name
  from public.batches b
  left join public.suppliers sup on sup.id = b.supplier_id
  where b.medicine_id = p_medicine_id
    and b.store_id    = p_store_id
    and b.deleted_at  is null
    and b.is_blocked  = false
    and b.current_quantity > 0
    and b.expiry_date >= current_date
  order by b.expiry_date asc, b.created_at asc;
end;
$$;

revoke all on function public.rpc_pos_list_batches_for_medicine(uuid, uuid) from public;
grant execute on function public.rpc_pos_list_batches_for_medicine(uuid, uuid) to authenticated;

-- ============================================================================
-- 2. Prescriptions storage bucket + RLS
-- Files are keyed by path `{org_id}/{yyyy}/{mm}/{uuid}.{ext}`. RLS checks that
-- the leading path segment matches the caller's org_id. Service-role bypasses.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('prescriptions', 'prescriptions', false)
on conflict (id) do nothing;

-- Drop pre-existing policies (idempotency for re-runs).
drop policy if exists "prescriptions_select_org_members" on storage.objects;
drop policy if exists "prescriptions_insert_org_members" on storage.objects;
drop policy if exists "prescriptions_update_org_members" on storage.objects;
drop policy if exists "prescriptions_delete_org_admin"   on storage.objects;

-- SELECT: anyone in the org can read prescriptions filed under their org's prefix.
create policy "prescriptions_select_org_members"
on storage.objects for select
to authenticated
using (
  bucket_id = 'prescriptions'
  and (storage.foldername(name))[1]::uuid = public.current_org()
);

-- INSERT: any authenticated member of the org can upload, must use org_id prefix.
create policy "prescriptions_insert_org_members"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'prescriptions'
  and (storage.foldername(name))[1]::uuid = public.current_org()
);

-- UPDATE: same as insert (e.g. metadata changes).
create policy "prescriptions_update_org_members"
on storage.objects for update
to authenticated
using (
  bucket_id = 'prescriptions'
  and (storage.foldername(name))[1]::uuid = public.current_org()
);

-- DELETE: super_admin / store_admin only — prescriptions are a legal record.
create policy "prescriptions_delete_org_admin"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'prescriptions'
  and (storage.foldername(name))[1]::uuid = public.current_org()
  and public.user_role() in ('super_admin','store_admin')
);
