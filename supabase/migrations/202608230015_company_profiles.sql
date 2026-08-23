-- Cached TOP 200 company financials and on-demand OpenAI company profiles.
-- All data remains server-only and is accessed with the service role.

create table if not exists public.company_profiles (
  ticker text primary key,
  company_name text not null,
  sector text,
  industry text,
  country text,
  cik bigint,
  financial_payload jsonb,
  financial_checked_at timestamptz,
  financial_updated_at timestamptz,
  financial_filing_accession text,
  financial_filing_form text,
  financial_filing_date date,
  financial_source_url text,
  profile_payload jsonb,
  profile_analyzed_at timestamptz,
  profile_model text,
  profile_prompt_version integer,
  profile_source_accession text,
  profile_source_filing_date date,
  profile_source_url text,
  profile_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_profiles_ticker_format check (ticker ~ '^[A-Z][A-Z0-9.-]{0,14}$')
);

create table if not exists public.company_profile_runs (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('bulk', 'single')),
  requested_ticker text,
  status text not null check (status in ('running', 'success', 'partial', 'failed')),
  stage text not null check (stage in ('queued', 'financials', 'analyzing', 'saving', 'completed', 'failed')),
  workflow_run_id text,
  model text not null,
  prompt_version integer not null,
  total_count integer not null default 0 check (total_count >= 0),
  completed_count integer not null default 0 check (completed_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  estimated_input_tokens integer not null default 0 check (estimated_input_tokens >= 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_summary text
);

create unique index if not exists company_profile_single_running_idx
  on public.company_profile_runs ((true))
  where status = 'running';

create index if not exists company_profile_runs_started_idx
  on public.company_profile_runs(started_at desc);

alter table public.company_profiles enable row level security;
alter table public.company_profile_runs enable row level security;
revoke all on public.company_profiles from anon, authenticated;
revoke all on public.company_profile_runs from anon, authenticated;
grant select, insert, update on public.company_profiles to service_role;
grant select, insert, update, delete on public.company_profile_runs to service_role;

create or replace function public.start_company_profile_run(
  p_mode text,
  p_ticker text,
  p_model text,
  p_prompt_version integer,
  p_total_count integer,
  p_skipped_count integer,
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
  perform pg_advisory_xact_lock(hashtext('blackturtle-company-profiles'));

  if p_mode not in ('bulk', 'single') then
    raise exception 'COMPANY_PROFILE_MODE_INVALID';
  end if;
  if p_mode = 'single' and coalesce(p_ticker, '') !~ '^[A-Z][A-Z0-9.-]{0,14}$' then
    raise exception 'COMPANY_PROFILE_TICKER_INVALID';
  end if;

  update public.company_profile_runs
  set status = 'failed', stage = 'failed', finished_at = now(),
      error_summary = 'Workflow 등록 전에 요청이 중단되어 자동 종료되었습니다.'
  where status = 'running'
    and workflow_run_id is null
    and started_at < now() - interval '10 minutes';

  if exists (select 1 from public.company_profile_runs where status = 'running') then
    raise exception 'COMPANY_PROFILE_ALREADY_RUNNING';
  end if;

  insert into public.company_profile_runs (
    mode, requested_ticker, status, stage, model, prompt_version,
    total_count, skipped_count, estimated_input_tokens
  ) values (
    p_mode,
    case when p_mode = 'single' then upper(p_ticker) else null end,
    'running', 'queued', left(p_model, 100), greatest(p_prompt_version, 1),
    greatest(p_total_count, 0), greatest(p_skipped_count, 0), greatest(p_estimated_input_tokens, 0)
  ) returning id into new_run_id;

  return new_run_id;
end;
$$;

create or replace function public.attach_company_profile_workflow(p_run_id uuid, p_workflow_run_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.company_profile_runs
  set workflow_run_id = left(p_workflow_run_id, 200)
  where id = p_run_id and status = 'running';
end;
$$;

create or replace function public.set_company_profile_progress(
  p_run_id uuid,
  p_stage text,
  p_completed_count integer,
  p_failed_count integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_stage not in ('financials', 'analyzing', 'saving') then
    raise exception 'COMPANY_PROFILE_STAGE_INVALID';
  end if;
  update public.company_profile_runs
  set stage = p_stage,
      completed_count = greatest(p_completed_count, 0),
      failed_count = greatest(p_failed_count, 0)
  where id = p_run_id and status = 'running';
end;
$$;

create or replace function public.complete_company_profile_run(
  p_run_id uuid,
  p_completed_count integer,
  p_failed_count integer,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.company_profile_runs
  set status = case when greatest(p_failed_count, 0) > 0 then 'partial' else 'success' end,
      stage = 'completed',
      completed_count = greatest(p_completed_count, 0),
      failed_count = greatest(p_failed_count, 0),
      finished_at = now(),
      error_summary = case when greatest(p_failed_count, 0) > 0 then left(coalesce(p_error, ''), 2000) else null end
  where id = p_run_id and status = 'running';

  delete from public.company_profile_runs
  where id in (
    select id from public.company_profile_runs
    where status <> 'running'
    order by coalesce(finished_at, started_at) desc, id desc
    offset 20
  );
end;
$$;

create or replace function public.fail_company_profile_run(p_run_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.company_profile_runs
  set status = 'failed', stage = 'failed', finished_at = now(),
      error_summary = left(coalesce(p_error, '알 수 없는 오류'), 2000)
  where id = p_run_id and status = 'running';
end;
$$;

revoke all on function public.start_company_profile_run(text, text, text, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.attach_company_profile_workflow(uuid, text) from public, anon, authenticated;
revoke all on function public.set_company_profile_progress(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.complete_company_profile_run(uuid, integer, integer, text) from public, anon, authenticated;
revoke all on function public.fail_company_profile_run(uuid, text) from public, anon, authenticated;
grant execute on function public.start_company_profile_run(text, text, text, integer, integer, integer, integer) to service_role;
grant execute on function public.attach_company_profile_workflow(uuid, text) to service_role;
grant execute on function public.set_company_profile_progress(uuid, text, integer, integer) to service_role;
grant execute on function public.complete_company_profile_run(uuid, integer, integer, text) to service_role;
grant execute on function public.fail_company_profile_run(uuid, text) to service_role;
