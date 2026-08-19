-- Add X recent-search monitoring for a saved ticker watchlist.

create table if not exists public.x_monitored_tickers (
  ticker text primary key,
  company_name text,
  enabled boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint x_monitored_tickers_ticker_format check (ticker ~ '^[A-Z][A-Z0-9.-]{0,9}$'),
  constraint x_monitored_tickers_company_name_length check (company_name is null or char_length(company_name) <= 80)
);

alter table public.x_monitored_tickers enable row level security;
revoke all on public.x_monitored_tickers from anon, authenticated;
grant select on public.x_monitored_tickers to service_role;

create table if not exists public.x_ticker_monitor_settings (
  id text primary key check (id = 'primary'),
  lookback_days integer not null default 1 check (lookback_days between 1 and 7),
  per_ticker_post_limit integer check (per_ticker_post_limit is null or per_ticker_post_limit > 0),
  total_post_limit integer check (total_post_limit is null or total_post_limit > 0),
  updated_at timestamptz not null default now()
);

insert into public.x_ticker_monitor_settings (id, lookback_days, per_ticker_post_limit, total_post_limit)
values ('primary', 1, 20, 50)
on conflict (id) do nothing;

alter table public.x_ticker_monitor_settings enable row level security;
revoke all on public.x_ticker_monitor_settings from anon, authenticated;
grant select on public.x_ticker_monitor_settings to service_role;

create or replace function public.replace_x_monitored_tickers_v1(
  p_tickers text[],
  p_company_names text[],
  p_enabled boolean[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text[];
  names text[];
  enabled_values boolean[];
begin
  normalized := array(
    select upper(ltrim(trim(value), '$'))
    from unnest(coalesce(p_tickers, array[]::text[])) with ordinality as input(value, ordinal)
    order by ordinal
  );
  names := coalesce(p_company_names, array[]::text[]);
  enabled_values := coalesce(p_enabled, array[]::boolean[]);

  if cardinality(normalized) > 50 then raise exception 'X_SAVED_TICKER_COUNT_INVALID'; end if;
  if cardinality(normalized) <> cardinality(names) or cardinality(normalized) <> cardinality(enabled_values) then
    raise exception 'X_TICKER_FIELD_COUNT_INVALID';
  end if;
  if (select count(*) from unnest(enabled_values) as item(value) where value) > 10 then
    raise exception 'X_ACTIVE_TICKER_COUNT_INVALID';
  end if;
  if exists (select 1 from unnest(normalized) as item(value) where value !~ '^[A-Z][A-Z0-9.-]{0,9}$') then
    raise exception 'X_TICKER_FORMAT_INVALID';
  end if;
  if exists (select 1 from unnest(names) as item(value) where char_length(value) > 80) then
    raise exception 'X_TICKER_COMPANY_NAME_INVALID';
  end if;
  if cardinality(normalized) <> (select count(distinct value) from unnest(normalized) as item(value)) then
    raise exception 'X_TICKER_DUPLICATE';
  end if;

  insert into public.x_monitored_tickers(ticker, company_name, enabled, position)
  select ticker, nullif(trim(company_name), ''), enabled, ordinal::integer - 1
  from unnest(normalized, names, enabled_values) with ordinality as input(ticker, company_name, enabled, ordinal)
  on conflict (ticker) do update set
    company_name = excluded.company_name,
    enabled = excluded.enabled,
    position = excluded.position;

  delete from public.x_monitored_tickers
  where not (ticker = any(normalized));
end;
$$;

create or replace function public.update_x_ticker_collection_settings(
  p_lookback_days integer,
  p_per_ticker_post_limit integer default null,
  p_total_post_limit integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_lookback_days < 1 or p_lookback_days > 7 then raise exception 'X_TICKER_LOOKBACK_INVALID'; end if;
  if p_per_ticker_post_limit is not null and p_per_ticker_post_limit < 1 then raise exception 'X_PER_TICKER_LIMIT_INVALID'; end if;
  if p_total_post_limit is not null and p_total_post_limit < 1 then raise exception 'X_TICKER_TOTAL_LIMIT_INVALID'; end if;

  insert into public.x_ticker_monitor_settings(id, lookback_days, per_ticker_post_limit, total_post_limit, updated_at)
  values ('primary', p_lookback_days, p_per_ticker_post_limit, p_total_post_limit, now())
  on conflict (id) do update set
    lookback_days = excluded.lookback_days,
    per_ticker_post_limit = excluded.per_ticker_post_limit,
    total_post_limit = excluded.total_post_limit,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.replace_x_monitored_tickers_v1(text[], text[], boolean[]) from public, anon, authenticated;
grant execute on function public.replace_x_monitored_tickers_v1(text[], text[], boolean[]) to service_role;
revoke all on function public.update_x_ticker_collection_settings(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.update_x_ticker_collection_settings(integer, integer, integer) to service_role;
