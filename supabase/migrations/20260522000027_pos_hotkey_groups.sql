-- ShelfCure Cloud — Migration 0027
-- POS Phase C revision: Quick Access Hotkeys (Alt+1-9) are now **groups of
-- medicines with a name**, persisted server-side. Matches desktop POS where
-- a single Alt+digit bulk-adds every medicine in that group (e.g. "Fever Pack"
-- → Paracetamol + Cetirizine + Cough Syrup).
--
-- Previously: single-medicine-per-digit in localStorage (Phase C v1).
-- Now: org-scoped table with per-store groups, qty per medicine, named groups.

create table public.pos_hotkey_groups (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  store_id    uuid not null references public.stores(id)        on delete cascade,
  digit       integer not null check (digit between 1 and 9),
  name        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (store_id, digit)
);

comment on table public.pos_hotkey_groups is
  'Alt+1-9 quick-access groups on the POS screen. One group per store + digit.';

create index pos_hotkey_groups_store_idx on public.pos_hotkey_groups (store_id);

create trigger trg_pos_hotkey_groups_updated_at
  before update on public.pos_hotkey_groups
  for each row execute function public.tg_set_updated_at();

create table public.pos_hotkey_group_items (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.pos_hotkey_groups(id) on delete cascade,
  medicine_id  uuid not null references public.medicines(id)         on delete cascade,
  quantity     integer not null default 1 check (quantity > 0),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  unique (group_id, medicine_id)
);

create index pos_hotkey_group_items_group_idx on public.pos_hotkey_group_items (group_id);

-- ── RLS ──────────────────────────────────────────────────────

alter table public.pos_hotkey_groups       enable row level security;
alter table public.pos_hotkey_group_items  enable row level security;

create policy pos_hotkey_groups_select on public.pos_hotkey_groups
  for select using (
    org_id = public.current_org()
    and public.user_has_store_access(store_id)
  );

create policy pos_hotkey_groups_insert on public.pos_hotkey_groups
  for insert with check (
    org_id = public.current_org()
    and public.user_has_store_access(store_id)
  );

create policy pos_hotkey_groups_update on public.pos_hotkey_groups
  for update using (
    org_id = public.current_org()
    and public.user_has_store_access(store_id)
  );

create policy pos_hotkey_groups_delete on public.pos_hotkey_groups
  for delete using (
    org_id = public.current_org()
    and public.user_has_store_access(store_id)
  );

-- Items inherit access from their group.
create policy pos_hotkey_group_items_select on public.pos_hotkey_group_items
  for select using (
    exists (
      select 1 from public.pos_hotkey_groups g
      where g.id = group_id and g.org_id = public.current_org()
        and public.user_has_store_access(g.store_id)
    )
  );

create policy pos_hotkey_group_items_insert on public.pos_hotkey_group_items
  for insert with check (
    exists (
      select 1 from public.pos_hotkey_groups g
      where g.id = group_id and g.org_id = public.current_org()
        and public.user_has_store_access(g.store_id)
    )
  );

create policy pos_hotkey_group_items_update on public.pos_hotkey_group_items
  for update using (
    exists (
      select 1 from public.pos_hotkey_groups g
      where g.id = group_id and g.org_id = public.current_org()
        and public.user_has_store_access(g.store_id)
    )
  );

create policy pos_hotkey_group_items_delete on public.pos_hotkey_group_items
  for delete using (
    exists (
      select 1 from public.pos_hotkey_groups g
      where g.id = group_id and g.org_id = public.current_org()
        and public.user_has_store_access(g.store_id)
    )
  );

grant select, insert, update, delete on public.pos_hotkey_groups      to authenticated;
grant select, insert, update, delete on public.pos_hotkey_group_items to authenticated;

-- ============================================================================
-- RPCs
-- All payload-light, security definer, role gate at app-RPC layer.
-- ============================================================================

create or replace function public.rpc_pos_get_hotkey_groups(p_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org    uuid := public.current_org();
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  -- Return one object per digit (1-9), with the matching group (if any) and items.
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'digit', d.digit,
      'name',  g.name,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'medicine_id', m.id,
          'name',        m.name,
          'manufacturer', m.manufacturer,
          'mrp',         (select max(b.mrp) from public.batches b
                          where b.medicine_id = m.id and b.store_id = p_store_id and b.deleted_at is null),
          'total_stock', coalesce((select sum(b.current_quantity) from public.batches b
                                   where b.medicine_id = m.id and b.store_id = p_store_id and b.deleted_at is null), 0),
          'quantity',    i.quantity
        ) order by i.sort_order, m.name)
        from public.pos_hotkey_group_items i
        join public.medicines m on m.id = i.medicine_id and m.deleted_at is null
        where i.group_id = g.id
      ), '[]'::jsonb)
    ) as row
    from (values (1),(2),(3),(4),(5),(6),(7),(8),(9)) d(digit)
    left join public.pos_hotkey_groups g
      on g.store_id = p_store_id and g.org_id = v_org and g.digit = d.digit
    order by d.digit
  ) sub;

  return v_result;
end;
$$;

revoke all on function public.rpc_pos_get_hotkey_groups(uuid) from public;
grant execute on function public.rpc_pos_get_hotkey_groups(uuid) to authenticated;


-- Upsert the group row (create if missing) and set its name.
create or replace function public.rpc_pos_set_hotkey_name(
  p_store_id uuid,
  p_digit    integer,
  p_name     text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org  uuid := public.current_org();
  v_clean text := nullif(trim(coalesce(p_name, '')), '');
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;
  if p_digit < 1 or p_digit > 9 then raise exception 'invalid_digit' using errcode = '22023'; end if;

  insert into public.pos_hotkey_groups (org_id, store_id, digit, name)
  values (v_org, p_store_id, p_digit, v_clean)
  on conflict (store_id, digit)
  do update set name = v_clean, updated_at = now();
end;
$$;

revoke all on function public.rpc_pos_set_hotkey_name(uuid, integer, text) from public;
grant execute on function public.rpc_pos_set_hotkey_name(uuid, integer, text) to authenticated;


-- Add a medicine to a digit's group. Creates the group on demand.
create or replace function public.rpc_pos_add_hotkey_medicine(
  p_store_id    uuid,
  p_digit       integer,
  p_medicine_id uuid,
  p_quantity    integer default 1
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org      uuid := public.current_org();
  v_group_id uuid;
  v_qty      integer := greatest(1, coalesce(p_quantity, 1));
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;
  if p_digit < 1 or p_digit > 9 then raise exception 'invalid_digit' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.medicines m
    where m.id = p_medicine_id and m.org_id = v_org and m.deleted_at is null
  ) then
    raise exception 'medicine_not_found' using errcode = 'P0002';
  end if;

  -- Find or create the group.
  insert into public.pos_hotkey_groups (org_id, store_id, digit)
  values (v_org, p_store_id, p_digit)
  on conflict (store_id, digit) do update set updated_at = now()
  returning id into v_group_id;
  if v_group_id is null then
    select id into v_group_id from public.pos_hotkey_groups
    where store_id = p_store_id and digit = p_digit;
  end if;

  -- Append (or bump qty if already there).
  insert into public.pos_hotkey_group_items (group_id, medicine_id, quantity, sort_order)
  values (
    v_group_id, p_medicine_id, v_qty,
    coalesce((select max(sort_order) + 1 from public.pos_hotkey_group_items where group_id = v_group_id), 0)
  )
  on conflict (group_id, medicine_id)
  do update set quantity = excluded.quantity;
end;
$$;

revoke all on function public.rpc_pos_add_hotkey_medicine(uuid, integer, uuid, integer) from public;
grant execute on function public.rpc_pos_add_hotkey_medicine(uuid, integer, uuid, integer) to authenticated;


-- Remove a single medicine from a group.
create or replace function public.rpc_pos_remove_hotkey_medicine(
  p_store_id    uuid,
  p_digit       integer,
  p_medicine_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;

  select id into v_group_id from public.pos_hotkey_groups
  where store_id = p_store_id and digit = p_digit;
  if v_group_id is null then return; end if;

  delete from public.pos_hotkey_group_items
  where group_id = v_group_id and medicine_id = p_medicine_id;
end;
$$;

revoke all on function public.rpc_pos_remove_hotkey_medicine(uuid, integer, uuid) from public;
grant execute on function public.rpc_pos_remove_hotkey_medicine(uuid, integer, uuid) to authenticated;


-- Clear an entire group (drops items + nulls the name).
create or replace function public.rpc_pos_clear_hotkey_group(
  p_store_id uuid,
  p_digit    integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_store_access(p_store_id) then
    raise exception 'permission_denied: store access' using errcode = '42501';
  end if;
  delete from public.pos_hotkey_groups where store_id = p_store_id and digit = p_digit;
end;
$$;

revoke all on function public.rpc_pos_clear_hotkey_group(uuid, integer) from public;
grant execute on function public.rpc_pos_clear_hotkey_group(uuid, integer) to authenticated;
