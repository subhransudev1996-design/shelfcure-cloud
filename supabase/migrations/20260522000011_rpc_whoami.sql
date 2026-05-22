-- ShelfCure Cloud — Migration 0011
-- Diagnostic RPC: returns the authenticated user's RLS context.
-- Lets us see exactly what every helper function returns from the user's
-- perspective, so we can pinpoint why an insert fails RLS.

create or replace function public.rpc_whoami()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'auth_uid', auth.uid(),
    'user_role_fn', public.user_role(),
    'current_org_fn', public.current_org(),
    'current_store_fn', public.current_store(),
    'profile_id', (select id from public.user_profiles where id = auth.uid()),
    'profile_role', (select role from public.user_profiles where id = auth.uid()),
    'profile_org', (select org_id from public.user_profiles where id = auth.uid()),
    'profile_store', (select store_id from public.user_profiles where id = auth.uid()),
    'profile_email', (select email::text from public.user_profiles where id = auth.uid()),
    'profile_is_active', (select is_active from public.user_profiles where id = auth.uid())
  )
$$;

comment on function public.rpc_whoami() is
  'Diagnostic — returns the RLS context the server sees for the current JWT.';

revoke all on function public.rpc_whoami() from public;
grant execute on function public.rpc_whoami() to authenticated;
