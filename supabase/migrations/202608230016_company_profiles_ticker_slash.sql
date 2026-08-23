-- Nasdaq Screener can return share-class tickers containing a slash (for example BRK/B).
-- This only broadens the accepted ticker format; it does not delete or rewrite stored data.

alter table public.company_profiles
  drop constraint if exists company_profiles_ticker_format;

alter table public.company_profiles
  add constraint company_profiles_ticker_format
  check (ticker ~ '^[A-Z][A-Z0-9./-]{0,14}$');

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
  if p_mode = 'single' and coalesce(p_ticker, '') !~ '^[A-Z][A-Z0-9./-]{0,14}$' then
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

revoke all on function public.start_company_profile_run(text, text, text, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.start_company_profile_run(text, text, text, integer, integer, integer, integer) to service_role;
