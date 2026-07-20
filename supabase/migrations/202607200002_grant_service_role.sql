-- Apply this migration to projects that already ran 202607200001_initial.sql.
-- It fixes "permission denied for table dashboard_state" when automatic table
-- exposure was disabled during Supabase project creation.

grant usage on schema public to service_role;
grant select on public.refresh_runs to service_role;
grant select on public.dashboard_snapshots to service_role;
grant select on public.dashboard_state to service_role;
