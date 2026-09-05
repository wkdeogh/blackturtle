-- On-demand, source-grounded market expectations and concerns for company profiles.
-- This data is intentionally refreshed independently from the slower-moving company profile.

alter table public.company_profiles
  add column if not exists market_view_payload jsonb,
  add column if not exists market_view_analyzed_at timestamptz,
  add column if not exists market_view_model text,
  add column if not exists market_view_prompt_version integer,
  add column if not exists market_view_status text,
  add column if not exists market_view_started_at timestamptz,
  add column if not exists market_view_workflow_run_id text,
  add column if not exists market_view_error text;

alter table public.company_profiles
  drop constraint if exists company_profiles_market_view_status_check;

alter table public.company_profiles
  add constraint company_profiles_market_view_status_check
  check (market_view_status is null or market_view_status in ('running', 'success', 'failed'));

create index if not exists company_profiles_market_view_status_idx
  on public.company_profiles(market_view_status, market_view_started_at desc);
