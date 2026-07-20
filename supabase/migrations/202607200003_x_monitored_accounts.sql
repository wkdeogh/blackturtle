-- Store the X accounts selected from the protected dashboard.

create table if not exists public.x_monitored_accounts (
  username text primary key,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint x_monitored_accounts_username_format
    check (username ~ '^[A-Za-z0-9_]{1,30}$')
);

alter table public.x_monitored_accounts enable row level security;
revoke all on public.x_monitored_accounts from anon, authenticated;
grant select on public.x_monitored_accounts to service_role;

create table if not exists public.x_monitor_settings (
  id text primary key check (id = 'primary'),
  lookback_days integer not null default 7 check (lookback_days between 1 and 30),
  per_account_post_limit integer check (per_account_post_limit is null or per_account_post_limit > 0),
  total_post_limit integer check (total_post_limit is null or total_post_limit > 0),
  updated_at timestamptz not null default now()
);

insert into public.x_monitor_settings (id, lookback_days)
values ('primary', 7)
on conflict (id) do nothing;

alter table public.x_monitor_settings enable row level security;
revoke all on public.x_monitor_settings from anon, authenticated;
grant select on public.x_monitor_settings to service_role;

create or replace function public.replace_x_monitor_settings(
  p_usernames text[],
  p_lookback_days integer,
  p_per_account_post_limit integer,
  p_total_post_limit integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text[];
begin
  select array_agg(username order by first_position)
  into normalized
  from (
    select lower(regexp_replace(trim(value), '^@', '')) as username,
           min(position) as first_position
    from unnest(coalesce(p_usernames, array[]::text[])) with ordinality as u(value, position)
    where trim(value) <> ''
    group by lower(regexp_replace(trim(value), '^@', ''))
  ) cleaned;

  if coalesce(cardinality(normalized), 0) < 1 then
    raise exception 'X_ACCOUNT_REQUIRED';
  end if;

  if cardinality(normalized) > 10 then
    raise exception 'X_ACCOUNT_LIMIT_EXCEEDED';
  end if;

  if p_lookback_days is null or p_lookback_days < 1 or p_lookback_days > 30 then
    raise exception 'X_LOOKBACK_DAYS_INVALID';
  end if;

  if p_per_account_post_limit is not null and p_per_account_post_limit < 1 then
    raise exception 'X_PER_ACCOUNT_POST_LIMIT_INVALID';
  end if;

  if p_total_post_limit is not null and p_total_post_limit < 1 then
    raise exception 'X_TOTAL_POST_LIMIT_INVALID';
  end if;

  if exists (
    select 1 from unnest(normalized) as u(username)
    where username !~ '^[a-z0-9_]{1,30}$'
  ) then
    raise exception 'X_ACCOUNT_INVALID_FORMAT';
  end if;

  delete from public.x_monitored_accounts;
  insert into public.x_monitored_accounts (username, position)
  select username, position::integer
  from unnest(normalized) with ordinality as u(username, position);

  insert into public.x_monitor_settings (
    id,
    lookback_days,
    per_account_post_limit,
    total_post_limit,
    updated_at
  )
  values ('primary', p_lookback_days, p_per_account_post_limit, p_total_post_limit, now())
  on conflict (id) do update
    set lookback_days = excluded.lookback_days,
        per_account_post_limit = excluded.per_account_post_limit,
        total_post_limit = excluded.total_post_limit,
        updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.replace_x_monitor_settings(text[], integer, integer, integer) from public, anon, authenticated;
grant execute on function public.replace_x_monitor_settings(text[], integer, integer, integer) to service_role;
