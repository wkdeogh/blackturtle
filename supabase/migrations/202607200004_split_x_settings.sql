-- Split account management from paid X collection controls.

create or replace function public.replace_x_monitored_accounts(p_usernames text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text[];
begin
  select array_agg(lower(regexp_replace(trim(value), '^@', '')) order by ordinal)
  into normalized
  from unnest(p_usernames) with ordinality as input(value, ordinal)
  where trim(value) <> '';

  normalized := coalesce(normalized, array[]::text[]);

  if cardinality(normalized) > 10 then
    raise exception 'X_ACCOUNT_COUNT_INVALID';
  end if;
  if exists (select 1 from unnest(normalized) as item(value) where value !~ '^[a-z0-9_]{1,30}$') then
    raise exception 'X_ACCOUNT_FORMAT_INVALID';
  end if;
  if cardinality(normalized) <> (select count(distinct value) from unnest(normalized) as item(value)) then
    raise exception 'X_ACCOUNT_DUPLICATE';
  end if;

  delete from public.x_monitored_accounts;
  insert into public.x_monitored_accounts(username, position)
  select value, ordinal::integer - 1
  from unnest(normalized) with ordinality as input(value, ordinal);
end;
$$;

create or replace function public.update_x_collection_settings(
  p_lookback_days integer,
  p_per_account_post_limit integer default null,
  p_total_post_limit integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_lookback_days < 1 or p_lookback_days > 30 then
    raise exception 'X_LOOKBACK_INVALID';
  end if;
  if p_per_account_post_limit is not null and p_per_account_post_limit < 1 then
    raise exception 'X_PER_ACCOUNT_LIMIT_INVALID';
  end if;
  if p_total_post_limit is not null and p_total_post_limit < 1 then
    raise exception 'X_TOTAL_LIMIT_INVALID';
  end if;

  insert into public.x_monitor_settings(id, lookback_days, per_account_post_limit, total_post_limit, updated_at)
  values ('primary', p_lookback_days, p_per_account_post_limit, p_total_post_limit, now())
  on conflict (id) do update set
    lookback_days = excluded.lookback_days,
    per_account_post_limit = excluded.per_account_post_limit,
    total_post_limit = excluded.total_post_limit,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.replace_x_monitored_accounts(text[]) from public, anon, authenticated;
grant execute on function public.replace_x_monitored_accounts(text[]) to service_role;
revoke all on function public.update_x_collection_settings(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.update_x_collection_settings(integer, integer, integer) to service_role;
