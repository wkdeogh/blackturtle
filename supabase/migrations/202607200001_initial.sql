-- Black Turtle MVP: server-only persistence.
-- RLS is enabled with no public policies. The app accesses these tables only
-- through SUPABASE_SECRET_KEY on the server.

create extension if not exists pgcrypto;

create table if not exists public.refresh_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('running', 'success', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_summary text
);

create unique index if not exists refresh_runs_single_running_idx
  on public.refresh_runs ((true))
  where status = 'running';

create table if not exists public.dashboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  refresh_run_id uuid not null unique references public.refresh_runs(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.dashboard_state (
  id text primary key check (id = 'primary'),
  published_snapshot_id uuid references public.dashboard_snapshots(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.refresh_runs enable row level security;
alter table public.dashboard_snapshots enable row level security;
alter table public.dashboard_state enable row level security;

revoke all on public.refresh_runs from anon, authenticated;
revoke all on public.dashboard_snapshots from anon, authenticated;
revoke all on public.dashboard_state from anon, authenticated;

-- Projects created with "Automatically expose new tables" disabled do not
-- grant table access automatically. Keep browser roles blocked while allowing
-- the server-only secret key to read the published snapshot.
grant usage on schema public to service_role;
grant select on public.refresh_runs to service_role;
grant select on public.dashboard_snapshots to service_role;
grant select on public.dashboard_state to service_role;

create or replace function public.start_refresh()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_run_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('blackturtle-refresh'));

  update public.refresh_runs
  set status = 'failed',
      finished_at = now(),
      error_summary = '실행 제한 시간을 넘겨 자동 종료되었습니다.'
  where status = 'running'
    and started_at < now() - interval '15 minutes';

  if exists (select 1 from public.refresh_runs where status = 'running') then
    raise exception 'REFRESH_ALREADY_RUNNING';
  end if;

  insert into public.refresh_runs (status)
  values ('running')
  returning id into new_run_id;

  return new_run_id;
end;
$$;

create or replace function public.complete_refresh(p_run_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_snapshot_id uuid;
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

  return new_snapshot_id;
end;
$$;

create or replace function public.fail_refresh(p_run_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.refresh_runs
  set status = 'failed',
      finished_at = now(),
      error_summary = left(coalesce(p_error, '알 수 없는 오류'), 1000)
  where id = p_run_id and status = 'running';
end;
$$;

revoke all on function public.start_refresh() from public, anon, authenticated;
revoke all on function public.complete_refresh(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fail_refresh(uuid, text) from public, anon, authenticated;
grant execute on function public.start_refresh() to service_role;
grant execute on function public.complete_refresh(uuid, jsonb) to service_role;
grant execute on function public.fail_refresh(uuid, text) to service_role;
