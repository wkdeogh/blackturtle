-- Durable refresh jobs: Vercel Workflow runs independently from the browser,
-- while Supabase remains the source of truth for user-visible progress.

alter table public.refresh_runs add column if not exists source text;
alter table public.refresh_runs add column if not exists stage text;
alter table public.refresh_runs add column if not exists workflow_run_id text;
alter table public.refresh_runs add column if not exists draft_payload jsonb;

update public.refresh_runs
set stage = case status
  when 'running' then 'queued'
  when 'success' then 'completed'
  else 'failed'
end
where stage is null;

create or replace function public.start_refresh_job(p_source text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_run_id uuid;
begin
  if p_source not in ('macro', 'social') then
    raise exception 'REFRESH_SOURCE_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtext('blackturtle-refresh'));

  -- Recover only requests that died before a Workflow run could be attached.
  -- Attached Workflow runs are durable and must not be expired by wall-clock time.
  update public.refresh_runs
  set status = 'failed',
      stage = 'failed',
      finished_at = now(),
      error_summary = 'Workflow 등록 전에 요청이 중단되어 자동 종료되었습니다.'
  where status = 'running'
    and workflow_run_id is null
    and started_at < now() - interval '10 minutes';

  if exists (select 1 from public.refresh_runs where status = 'running') then
    raise exception 'REFRESH_ALREADY_RUNNING';
  end if;

  insert into public.refresh_runs (status, source, stage)
  values ('running', p_source, 'queued')
  returning id into new_run_id;

  return new_run_id;
end;
$$;

create or replace function public.attach_refresh_workflow(p_run_id uuid, p_workflow_run_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.refresh_runs
  set workflow_run_id = left(p_workflow_run_id, 200)
  where id = p_run_id;
end;
$$;

create or replace function public.set_refresh_stage(p_run_id uuid, p_stage text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_stage not in ('queued', 'collecting', 'saving') then
    raise exception 'REFRESH_STAGE_INVALID';
  end if;

  update public.refresh_runs
  set stage = p_stage
  where id = p_run_id and status = 'running';
end;
$$;

create or replace function public.save_refresh_draft(p_run_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.refresh_runs
  set draft_payload = p_payload,
      stage = 'saving'
  where id = p_run_id and status = 'running';

  if not found then
    raise exception 'REFRESH_RUN_NOT_ACTIVE';
  end if;
end;
$$;

-- Publishing is idempotent: if the durable step loses its response after a
-- successful commit, a repeat call returns the existing snapshot.
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
  select id into new_snapshot_id
  from public.dashboard_snapshots
  where refresh_run_id = p_run_id;
  if new_snapshot_id is not null then
    return new_snapshot_id;
  end if;

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
  set status = 'success', stage = 'completed', finished_at = now(), error_summary = null, draft_payload = null
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

create or replace function public.complete_refresh_from_draft(p_run_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
  snapshot_id uuid;
begin
  select draft_payload into payload
  from public.refresh_runs
  where id = p_run_id;

  if payload is null then
    select id into snapshot_id
    from public.dashboard_snapshots
    where refresh_run_id = p_run_id;
    if snapshot_id is not null then
      return snapshot_id;
    end if;
    raise exception 'REFRESH_DRAFT_NOT_FOUND';
  end if;

  select public.complete_refresh(p_run_id, payload) into snapshot_id;
  return snapshot_id;
end;
$$;

create or replace function public.recover_refresh_draft_or_fail(p_run_id uuid, p_error text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  has_draft boolean;
  has_snapshot boolean;
begin
  select draft_payload is not null into has_draft
  from public.refresh_runs
  where id = p_run_id;
  select exists (
    select 1 from public.dashboard_snapshots where refresh_run_id = p_run_id
  ) into has_snapshot;

  if coalesce(has_draft, false) or has_snapshot then
    perform public.complete_refresh_from_draft(p_run_id);
    return true;
  end if;

  perform public.fail_refresh(p_run_id, p_error);
  return false;
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
      stage = 'failed',
      finished_at = now(),
      error_summary = left(coalesce(p_error, '알 수 없는 오류'), 1000)
  where id = p_run_id and status = 'running';
end;
$$;

revoke all on function public.start_refresh_job(text) from public, anon, authenticated;
revoke all on function public.attach_refresh_workflow(uuid, text) from public, anon, authenticated;
revoke all on function public.set_refresh_stage(uuid, text) from public, anon, authenticated;
revoke all on function public.save_refresh_draft(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.complete_refresh(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.complete_refresh_from_draft(uuid) from public, anon, authenticated;
revoke all on function public.recover_refresh_draft_or_fail(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_refresh(uuid, text) from public, anon, authenticated;
grant execute on function public.start_refresh_job(text) to service_role;
grant execute on function public.attach_refresh_workflow(uuid, text) to service_role;
grant execute on function public.set_refresh_stage(uuid, text) to service_role;
grant execute on function public.save_refresh_draft(uuid, jsonb) to service_role;
grant execute on function public.complete_refresh(uuid, jsonb) to service_role;
grant execute on function public.complete_refresh_from_draft(uuid) to service_role;
grant execute on function public.recover_refresh_draft_or_fail(uuid, text) to service_role;
grant execute on function public.fail_refresh(uuid, text) to service_role;
