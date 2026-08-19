-- Investor research, portfolio, observability and login throttling.
-- All tables stay server-only: browser roles have no policies or privileges.

create table if not exists public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  ticker text not null unique,
  company_name text,
  kind text not null default 'watchlist' check (kind in ('holding', 'watchlist')),
  quantity numeric not null default 0 check (quantity >= 0),
  average_cost numeric check (average_cost is null or average_cost >= 0),
  target_weight numeric check (target_weight is null or (target_weight >= 0 and target_weight <= 100)),
  sector text,
  currency text not null default 'USD' check (currency in ('USD', 'KRW')),
  thesis text,
  invalidation text,
  notes text,
  enabled boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolio_ticker_format check (ticker ~ '^[A-Z][A-Z0-9.-]{0,14}$'),
  constraint portfolio_company_length check (company_name is null or char_length(company_name) <= 120),
  constraint portfolio_sector_length check (sector is null or char_length(sector) <= 80),
  constraint portfolio_thesis_length check (thesis is null or char_length(thesis) <= 4000),
  constraint portfolio_invalidation_length check (invalidation is null or char_length(invalidation) <= 3000),
  constraint portfolio_notes_length check (notes is null or char_length(notes) <= 4000)
);

create index if not exists portfolio_items_position_idx on public.portfolio_items(position, ticker);

create table if not exists public.investor_research_state (
  id text primary key check (id = 'primary'),
  macro_payload jsonb not null default '{}'::jsonb,
  market_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.investor_research_state(id)
values ('primary')
on conflict (id) do nothing;

create table if not exists public.refresh_metrics (
  refresh_run_id uuid primary key references public.refresh_runs(id) on delete cascade,
  metrics jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.login_rate_limits (
  key_hash text primary key,
  failures integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.portfolio_items enable row level security;
alter table public.investor_research_state enable row level security;
alter table public.refresh_metrics enable row level security;
alter table public.login_rate_limits enable row level security;

revoke all on public.portfolio_items from anon, authenticated;
revoke all on public.investor_research_state from anon, authenticated;
revoke all on public.refresh_metrics from anon, authenticated;
revoke all on public.login_rate_limits from anon, authenticated;

grant select, insert, update, delete on public.portfolio_items to service_role;
grant select, insert, update on public.investor_research_state to service_role;
grant select, insert, update on public.refresh_metrics to service_role;
grant select, insert, update, delete on public.login_rate_limits to service_role;

create or replace function public.record_refresh_metric(
  p_run_id uuid,
  p_component text,
  p_metrics jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if char_length(coalesce(p_component, '')) < 1 or char_length(p_component) > 80 then
    raise exception 'REFRESH_METRIC_COMPONENT_INVALID';
  end if;

  insert into public.refresh_metrics(refresh_run_id, metrics, updated_at)
  values (p_run_id, jsonb_build_object(p_component, coalesce(p_metrics, '{}'::jsonb)), now())
  on conflict (refresh_run_id) do update set
    metrics = coalesce(public.refresh_metrics.metrics, '{}'::jsonb)
      || jsonb_build_object(p_component, coalesce(p_metrics, '{}'::jsonb)),
    updated_at = now();
end;
$$;

create or replace function public.check_login_rate_limit(p_key_hash text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining integer;
begin
  delete from public.login_rate_limits where updated_at < now() - interval '2 days';
  select greatest(0, ceil(extract(epoch from (locked_until - now())))::integer)
  into remaining
  from public.login_rate_limits
  where key_hash = p_key_hash and locked_until > now();
  return coalesce(remaining, 0);
end;
$$;

create or replace function public.record_login_attempt(p_key_hash text, p_success boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.login_rate_limits%rowtype;
  next_failures integer;
begin
  if p_success then
    delete from public.login_rate_limits where key_hash = p_key_hash;
    return;
  end if;

  select * into current_row
  from public.login_rate_limits
  where key_hash = p_key_hash
  for update;

  if not found or current_row.window_started_at < now() - interval '15 minutes' then
    insert into public.login_rate_limits(key_hash, failures, window_started_at, locked_until, updated_at)
    values (p_key_hash, 1, now(), null, now())
    on conflict (key_hash) do update set
      failures = 1,
      window_started_at = now(),
      locked_until = null,
      updated_at = now();
    return;
  end if;

  next_failures := current_row.failures + 1;
  update public.login_rate_limits
  set failures = next_failures,
      locked_until = case
        when next_failures >= 10 then now() + interval '1 hour'
        when next_failures >= 5 then now() + interval '15 minutes'
        else locked_until
      end,
      updated_at = now()
  where key_hash = p_key_hash;
end;
$$;

revoke all on function public.record_refresh_metric(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.check_login_rate_limit(text) from public, anon, authenticated;
revoke all on function public.record_login_attempt(text, boolean) from public, anon, authenticated;
grant execute on function public.record_refresh_metric(uuid, text, jsonb) to service_role;
grant execute on function public.check_login_rate_limit(text) to service_role;
grant execute on function public.record_login_attempt(text, boolean) to service_role;
