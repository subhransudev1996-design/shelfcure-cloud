-- ShelfCure Cloud — Migration 0059
-- platform_admins has RLS enabled with NO policies at all (RPC-only access —
-- see migration 0058's header comment), so apps/console's auth gate
-- (app/console/layout.tsx) cannot do a raw `.from('platform_admins').select()`
-- the way apps/admin's layout reads user_profiles directly. This RPC is the
-- one exception: a user always being allowed to look up their OWN
-- platform-admin status (no is_platform_admin() check needed — there's
-- nothing sensitive about a user knowing whether they themselves are one).

create or replace function public.rpc_console_whoami()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', pa.id,
    'full_name', pa.full_name,
    'email', pa.email::text,
    'is_active', pa.is_active
  )
  from public.platform_admins pa
  where pa.id = auth.uid()
$$;

comment on function public.rpc_console_whoami() is
  'Returns the calling user''s own platform_admins row (or NULL), for the Console auth gate. No permission check — looking up your own status is always allowed.';

revoke all on function public.rpc_console_whoami() from public;
grant execute on function public.rpc_console_whoami() to authenticated;
