-- §2.10 Finance: expense_categories + expenses tables + all 8 RPCs
-- expense_categories: store-scoped custom + global system rows (store_id IS NULL)
-- expenses: store-scoped expense log

create table if not exists expense_categories (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid references stores(id) on delete cascade,   -- NULL = system/global
  org_id      uuid references organizations(id) on delete cascade,
  name        text not null,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- System seed (store_id IS NULL, no org_id required)
-- We seed with a stable UUID per name so re-running is idempotent
insert into expense_categories (id, store_id, org_id, name, is_system) values
  ('00000000-0000-0000-0001-000000000001', null, null, 'Rent',          true),
  ('00000000-0000-0000-0001-000000000002', null, null, 'Electricity',   true),
  ('00000000-0000-0000-0001-000000000003', null, null, 'Salaries',      true),
  ('00000000-0000-0000-0001-000000000004', null, null, 'Maintenance',   true),
  ('00000000-0000-0000-0001-000000000005', null, null, 'Transport',     true),
  ('00000000-0000-0000-0001-000000000006', null, null, 'Miscellaneous', true)
on conflict (id) do nothing;

-- RLS on expense_categories
alter table expense_categories enable row level security;

-- Authenticated users can read system categories (store_id IS NULL) OR their store's categories
create policy "expense_categories_select"
  on expense_categories for select
  using (
    auth.uid() is not null
    and (
      store_id is null   -- system categories readable by everyone
      or store_id in (
        select s.id from stores s
        join user_profiles up on up.org_id = s.org_id
        where up.id = auth.uid()
      )
    )
  );

-- Only store-scoped (custom) categories can be inserted/deleted by org members
create policy "expense_categories_insert"
  on expense_categories for insert
  with check (
    auth.uid() is not null
    and store_id is not null
    and store_id in (
      select s.id from stores s
      join user_profiles up on up.org_id = s.org_id
      where up.id = auth.uid()
    )
  );

create policy "expense_categories_delete"
  on expense_categories for delete
  using (
    auth.uid() is not null
    and is_system = false
    and store_id in (
      select s.id from stores s
      join user_profiles up on up.org_id = s.org_id
      where up.id = auth.uid()
    )
  );

-- expenses table
create table if not exists expenses (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references stores(id) on delete cascade,
  org_id          uuid not null references organizations(id) on delete cascade,
  category_id     uuid references expense_categories(id) on delete set null,
  description     text not null,
  amount          numeric(12,2) not null check (amount > 0),
  expense_date    date not null,
  payment_method  text check (payment_method in ('cash','upi','card','bank_transfer','cheque')),
  notes           text,
  created_by      uuid references user_profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists expenses_store_date_idx on expenses(store_id, expense_date desc);
create index if not exists expenses_category_idx  on expenses(category_id);

-- RLS on expenses
alter table expenses enable row level security;

create policy "expenses_select"
  on expenses for select
  using (
    auth.uid() is not null
    and store_id in (
      select s.id from stores s
      join user_profiles up on up.org_id = s.org_id
      where up.id = auth.uid()
    )
  );

create policy "expenses_insert"
  on expenses for insert
  with check (
    auth.uid() is not null
    and store_id in (
      select s.id from stores s
      join user_profiles up on up.org_id = s.org_id
      where up.id = auth.uid()
    )
  );

create policy "expenses_update"
  on expenses for update
  using (
    auth.uid() is not null
    and store_id in (
      select s.id from stores s
      join user_profiles up on up.org_id = s.org_id
      where up.id = auth.uid()
    )
  );

create policy "expenses_delete"
  on expenses for delete
  using (
    auth.uid() is not null
    and store_id in (
      select s.id from stores s
      join user_profiles up on up.org_id = s.org_id
      where up.id = auth.uid()
    )
  );

-- ─── RPCs ──────────────────────────────────────────────────────────────────

-- List expense categories (store-scoped ∪ global system)
create or replace function rpc_list_expense_categories(p_store_id uuid)
returns table (
  id          uuid,
  name        text,
  is_system   boolean
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
    select ec.id, ec.name, ec.is_system
    from expense_categories ec
    where ec.store_id = p_store_id or ec.store_id is null
    order by ec.is_system desc, ec.name;
end;
$$;

-- Add a custom expense category (store-scoped)
create or replace function rpc_add_expense_category(
  p_store_id uuid,
  p_name     text
)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org_id uuid;
  v_new_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select org_id into v_org_id from user_profiles where id = auth.uid();
  insert into expense_categories (store_id, org_id, name, is_system)
    values (p_store_id, v_org_id, trim(p_name), false)
    returning id into v_new_id;
  return v_new_id;
end;
$$;

-- Delete a custom category (is_system=false guard inside)
create or replace function rpc_delete_expense_category(
  p_store_id   uuid,
  p_category_id uuid
)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  delete from expense_categories
  where id = p_category_id
    and store_id = p_store_id
    and is_system = false;
end;
$$;

-- List expenses in date range
create or replace function rpc_list_expenses(
  p_store_id uuid,
  p_from     date,
  p_to       date
)
returns table (
  id             uuid,
  category_id    uuid,
  category_name  text,
  description    text,
  amount         numeric,
  expense_date   date,
  payment_method text,
  notes          text,
  created_at     timestamptz
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
    select
      e.id,
      e.category_id,
      ec.name as category_name,
      e.description,
      e.amount,
      e.expense_date,
      e.payment_method,
      e.notes,
      e.created_at
    from expenses e
    left join expense_categories ec on ec.id = e.category_id
    where e.store_id = p_store_id
      and e.expense_date between p_from and p_to
    order by e.expense_date desc, e.id desc;
end;
$$;

-- Add an expense
create or replace function rpc_add_expense(
  p_store_id      uuid,
  p_description   text,
  p_amount        numeric,
  p_expense_date  date,
  p_category_id   uuid    default null,
  p_payment_method text   default 'cash',
  p_notes         text    default null
)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org_id uuid;
  v_new_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select org_id into v_org_id from user_profiles where id = auth.uid();
  insert into expenses (store_id, org_id, category_id, description, amount, expense_date, payment_method, notes, created_by)
    values (p_store_id, v_org_id, p_category_id, trim(p_description), p_amount, p_expense_date, p_payment_method, p_notes, auth.uid())
    returning id into v_new_id;
  return v_new_id;
end;
$$;

-- Update an expense
create or replace function rpc_update_expense(
  p_expense_id     uuid,
  p_store_id       uuid,
  p_description    text,
  p_amount         numeric,
  p_expense_date   date,
  p_category_id    uuid    default null,
  p_payment_method text    default 'cash',
  p_notes          text    default null
)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  update expenses set
    description    = trim(p_description),
    amount         = p_amount,
    expense_date   = p_expense_date,
    category_id    = p_category_id,
    payment_method = p_payment_method,
    notes          = p_notes
  where id = p_expense_id and store_id = p_store_id;
end;
$$;

-- Delete an expense
create or replace function rpc_delete_expense(
  p_expense_id uuid,
  p_store_id   uuid
)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  delete from expenses where id = p_expense_id and store_id = p_store_id;
end;
$$;

-- Expense summary by category (for the By Category panel)
create or replace function rpc_expense_summary(
  p_store_id uuid,
  p_from     date,
  p_to       date
)
returns table (
  category  text,
  total     numeric,
  cnt       bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
    select
      coalesce(ec.name, 'Uncategorized') as category,
      sum(e.amount)                       as total,
      count(*)                            as cnt
    from expenses e
    left join expense_categories ec on ec.id = e.category_id
    where e.store_id = p_store_id
      and e.expense_date between p_from and p_to
    group by coalesce(ec.name, 'Uncategorized')
    order by sum(e.amount) desc;
end;
$$;
