-- Revoke EXECUTE on public.rls_auto_enable() from PUBLIC/anon/authenticated.
--
-- WHY: the function is the event-trigger body behind the `ensure_rls` event
-- trigger (ddl_command_end), which auto-enables RLS on every table created
-- in the public schema. It is SECURITY DEFINER and PUBLIC held EXECUTE, so
-- the security advisor flagged it as callable by anon and authenticated via
-- /rest/v1/rpc/rls_auto_enable (lints 0028 and 0029).
--
-- The grant was never usable: an event-trigger function cannot be invoked
-- directly by anyone -- Postgres rejects it at PL/pgSQL compilation with
-- "trigger functions can only be called as triggers" (verified against this
-- database before writing this migration). Revoking costs nothing and stops
-- two permanent WARNs from training us to ignore advisor output.
--
-- Event triggers do NOT consult EXECUTE privileges -- they fire as part of
-- DDL processing under the trigger owner (postgres) -- so `ensure_rls` keeps
-- working unchanged. Verified after applying: a table created post-revoke
-- still came out with relrowsecurity = true. That matters here because
-- scripts/anime-tmdb-migration creates _backup_anime_migration_* tables via
-- `create table ... as select`, and `ensure_rls` is what puts RLS on them.
-- The function and the trigger both stay; only the unusable grant goes.

revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;
