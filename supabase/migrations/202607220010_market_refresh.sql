-- Allow the durable refresh queue to run the independent market-data workflow.

create or replace function public.start_refresh_job(p_source text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_run_id uuid;
begin
  if p_source not in ('macro', 'market', 'social') then
    raise exception 'REFRESH_SOURCE_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtext('blackturtle-refresh'));

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

revoke all on function public.start_refresh_job(text) from public, anon, authenticated;
grant execute on function public.start_refresh_job(text) to service_role;
