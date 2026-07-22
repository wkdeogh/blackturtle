-- Durable, separately billed GPT comprehensive reports for the current dashboard snapshot.

create table if not exists public.comprehensive_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid references public.dashboard_snapshots(id) on delete set null,
  status text not null check (status in ('running', 'success', 'failed')),
  stage text not null check (stage in ('queued', 'analyzing', 'saving', 'completed', 'failed')),
  workflow_run_id text,
  model text not null,
  estimated_input_tokens integer not null default 0 check (estimated_input_tokens >= 0),
  report jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_summary text
);

create unique index if not exists comprehensive_analysis_single_running_idx
  on public.comprehensive_analysis_runs ((true))
  where status = 'running';

alter table public.comprehensive_analysis_runs enable row level security;
revoke all on public.comprehensive_analysis_runs from anon, authenticated;
grant select on public.comprehensive_analysis_runs to service_role;

create or replace function public.start_comprehensive_analysis(
  p_snapshot_id uuid,
  p_model text,
  p_estimated_input_tokens integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_run_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('blackturtle-comprehensive-analysis'));

  if not exists (select 1 from public.dashboard_snapshots where id = p_snapshot_id) then
    raise exception 'ANALYSIS_SNAPSHOT_NOT_FOUND';
  end if;

  update public.comprehensive_analysis_runs
  set status = 'failed', stage = 'failed', finished_at = now(),
      error_summary = 'Workflow 등록 전에 요청이 중단되어 자동 종료되었습니다.'
  where status = 'running'
    and workflow_run_id is null
    and started_at < now() - interval '10 minutes';

  if exists (select 1 from public.comprehensive_analysis_runs where status = 'running') then
    raise exception 'ANALYSIS_ALREADY_RUNNING';
  end if;

  insert into public.comprehensive_analysis_runs (
    snapshot_id, status, stage, model, estimated_input_tokens
  ) values (
    p_snapshot_id, 'running', 'queued', left(p_model, 100), greatest(p_estimated_input_tokens, 0)
  ) returning id into new_run_id;

  return new_run_id;
end;
$$;

create or replace function public.attach_comprehensive_analysis_workflow(p_run_id uuid, p_workflow_run_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.comprehensive_analysis_runs
  set workflow_run_id = left(p_workflow_run_id, 200)
  where id = p_run_id and status = 'running';
end;
$$;

create or replace function public.set_comprehensive_analysis_stage(p_run_id uuid, p_stage text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_stage not in ('queued', 'analyzing', 'saving') then
    raise exception 'ANALYSIS_STAGE_INVALID';
  end if;
  update public.comprehensive_analysis_runs
  set stage = p_stage
  where id = p_run_id and status = 'running';
end;
$$;

create or replace function public.complete_comprehensive_analysis(p_run_id uuid, p_report jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.comprehensive_analysis_runs
  set status = 'success', stage = 'completed', report = p_report,
      finished_at = now(), error_summary = null
  where id = p_run_id and status = 'running';

  if not found and not exists (
    select 1 from public.comprehensive_analysis_runs where id = p_run_id and status = 'success'
  ) then
    raise exception 'ANALYSIS_RUN_NOT_ACTIVE';
  end if;

  delete from public.comprehensive_analysis_runs
  where id in (
    select id from public.comprehensive_analysis_runs
    where status <> 'running'
    order by coalesce(finished_at, started_at) desc, id desc
    offset 10
  );
end;
$$;

create or replace function public.fail_comprehensive_analysis(p_run_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.comprehensive_analysis_runs
  set status = 'failed', stage = 'failed', finished_at = now(),
      error_summary = left(coalesce(p_error, '알 수 없는 오류'), 1200)
  where id = p_run_id and status = 'running';
end;
$$;

revoke all on function public.start_comprehensive_analysis(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.attach_comprehensive_analysis_workflow(uuid, text) from public, anon, authenticated;
revoke all on function public.set_comprehensive_analysis_stage(uuid, text) from public, anon, authenticated;
revoke all on function public.complete_comprehensive_analysis(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fail_comprehensive_analysis(uuid, text) from public, anon, authenticated;
grant execute on function public.start_comprehensive_analysis(uuid, text, integer) to service_role;
grant execute on function public.attach_comprehensive_analysis_workflow(uuid, text) to service_role;
grant execute on function public.set_comprehensive_analysis_stage(uuid, text) to service_role;
grant execute on function public.complete_comprehensive_analysis(uuid, jsonb) to service_role;
grant execute on function public.fail_comprehensive_analysis(uuid, text) to service_role;
