-- Allow saved X accounts to remain configured while being excluded from collection.

alter table public.x_monitored_accounts
  add column if not exists enabled boolean not null default true;

create or replace function public.replace_x_monitored_accounts_v2(
  p_usernames text[],
  p_enabled boolean[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text[];
begin
  normalized := array(
    select lower(regexp_replace(trim(value), '^@', ''))
    from unnest(coalesce(p_usernames, array[]::text[])) with ordinality as input(value, ordinal)
    order by ordinal
  );

  if cardinality(normalized) > 10 then
    raise exception 'X_ACCOUNT_COUNT_INVALID';
  end if;
  if cardinality(normalized) <> cardinality(coalesce(p_enabled, array[]::boolean[])) then
    raise exception 'X_ACCOUNT_ENABLED_COUNT_INVALID';
  end if;
  if exists (select 1 from unnest(normalized) as item(value) where value !~ '^[a-z0-9_]{1,30}$') then
    raise exception 'X_ACCOUNT_FORMAT_INVALID';
  end if;
  if cardinality(normalized) <> (select count(distinct value) from unnest(normalized) as item(value)) then
    raise exception 'X_ACCOUNT_DUPLICATE';
  end if;

  insert into public.x_monitored_accounts(username, position, enabled)
  select username, ordinal::integer - 1, enabled
  from unnest(normalized, coalesce(p_enabled, array[]::boolean[])) with ordinality as input(username, enabled, ordinal)
  on conflict (username) do update
    set position = excluded.position,
        enabled = excluded.enabled;

  delete from public.x_monitored_accounts
  where not (username = any(normalized));
end;
$$;

revoke all on function public.replace_x_monitored_accounts_v2(text[], boolean[]) from public, anon, authenticated;
grant execute on function public.replace_x_monitored_accounts_v2(text[], boolean[]) to service_role;
