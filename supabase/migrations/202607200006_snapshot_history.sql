-- Keep successful refresh snapshots as browsable history with a configurable cap.

create table if not exists public.dashboard_settings (
  id text primary key check (id = 'primary'),
  history_retention_limit integer not null default 30 check (history_retention_limit between 5 and 100),
  updated_at timestamptz not null default now()
);

insert into public.dashboard_settings (id, history_retention_limit)
values ('primary', 30)
on conflict (id) do nothing;

alter table public.dashboard_settings enable row level security;
revoke all on public.dashboard_settings from anon, authenticated;
grant select on public.dashboard_settings to service_role;

create or replace function public.update_history_retention_limit(p_limit integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_limit < 5 or p_limit > 100 then
    raise exception 'HISTORY_RETENTION_LIMIT_INVALID';
  end if;

  insert into public.dashboard_settings (id, history_retention_limit, updated_at)
  values ('primary', p_limit, now())
  on conflict (id) do update set
    history_retention_limit = excluded.history_retention_limit,
    updated_at = excluded.updated_at;
end;
$$;

-- Preserve the existing RPC signature so old and new deployments remain compatible.
-- After publishing the newest snapshot, remove refresh runs linked to snapshots beyond
-- the configured limit. The foreign key cascade removes only those stale snapshots.
create or replace function public.complete_refresh(p_run_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_snapshot_id uuid;
  retention_limit integer;
begin
  if not exists (
    select 1 from public.refresh_runs where id = p_run_id and status = 'running'
  ) then
    raise exception 'REFRESH_RUN_NOT_ACTIVE';
  end if;

  insert into public.dashboard_snapshots (refresh_run_id, payload)
  values (p_run_id, p_payload)
  returning id into new_snapshot_id;

  insert into public.dashboard_state (id, published_snapshot_id, updated_at)
  values ('primary', new_snapshot_id, now())
  on conflict (id) do update
    set published_snapshot_id = excluded.published_snapshot_id,
        updated_at = excluded.updated_at;

  update public.refresh_runs
  set status = 'success', finished_at = now(), error_summary = null
  where id = p_run_id;

  select history_retention_limit
  into retention_limit
  from public.dashboard_settings
  where id = 'primary';
  retention_limit := coalesce(retention_limit, 30);

  delete from public.refresh_runs
  where id in (
    select stale.refresh_run_id
    from public.dashboard_snapshots as stale
    order by stale.created_at desc, stale.id desc
    offset retention_limit
  );

  return new_snapshot_id;
end;
$$;

revoke all on function public.update_history_retention_limit(integer) from public, anon, authenticated;
grant execute on function public.update_history_retention_limit(integer) to service_role;
revoke all on function public.complete_refresh(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.complete_refresh(uuid, jsonb) to service_role;
