-- ShelfCure Cloud — Migration 0070
-- ShelfCure Console: bulk CSV import for the master_medicines catalog.
-- Builds on migration 0069 (single-row CRUD RPCs). Lets a platform admin
-- import many medicines in one request instead of adding them one-by-one.
--
-- Duplicate policy: rows whose name already exists in master_medicines
-- (case-insensitive), or that repeat a name already seen earlier in the
-- same import batch, are skipped rather than overwritten — matches existing
-- catalog entries are left untouched. The caller (Console UI) parses the
-- CSV into a jsonb array of {name, salt_composition, manufacturer, strength,
-- dosage_form, pack_unit, pack_size, category} objects client-side.

create or replace function public.rpc_console_bulk_import_master_medicines(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item     jsonb;
  v_name     text;
  v_seen     text[] := array[]::text[];
  v_inserted integer := 0;
  v_skipped  jsonb := '[]'::jsonb;
  v_errors   jsonb := '[]'::jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'permission_denied: platform admin only' using errcode = '42501';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'invalid_items: expected a json array' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_name := trim(coalesce(v_item->>'name', ''));

    if v_name = '' then
      v_errors := v_errors || to_jsonb('(blank row skipped: missing medicine name)'::text);
      continue;
    end if;

    if lower(v_name) = any (v_seen)
       or exists (select 1 from public.master_medicines m where lower(m.name) = lower(v_name))
    then
      v_skipped := v_skipped || to_jsonb(v_name);
      continue;
    end if;

    insert into public.master_medicines (
      name, salt_composition, strength, manufacturer, dosage_form,
      pack_size, pack_unit, units_per_pack, category
    ) values (
      v_name,
      nullif(trim(coalesce(v_item->>'salt_composition', '')), ''),
      nullif(trim(coalesce(v_item->>'strength', '')), ''),
      nullif(trim(coalesce(v_item->>'manufacturer', '')), ''),
      nullif(trim(coalesce(v_item->>'dosage_form', '')), ''),
      (v_item->>'pack_size')::integer,
      nullif(trim(coalesce(v_item->>'pack_unit', '')), ''),
      (v_item->>'pack_size')::integer,
      nullif(trim(coalesce(v_item->>'category', '')), '')
    );

    v_seen := v_seen || lower(v_name);
    v_inserted := v_inserted + 1;
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted,
    'skipped', v_skipped,
    'errors', v_errors
  );
end;
$$;

comment on function public.rpc_console_bulk_import_master_medicines(jsonb) is
  'Platform-admin-only: bulk-inserts master_medicines rows from a parsed CSV. Skips rows whose name already exists in the catalog or repeats within the same batch; reports skipped names and any blank-name rows.';

revoke all on function public.rpc_console_bulk_import_master_medicines(jsonb) from public;
grant execute on function public.rpc_console_bulk_import_master_medicines(jsonb) to authenticated;
