-- Supabase safe-update mode rejects DELETE statements without a WHERE clause.
-- Replace the account-list function with an upsert + scoped delete.

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

  insert into public.x_monitored_accounts(username, position)
  select value, ordinal::integer - 1
  from unnest(normalized) with ordinality as input(value, ordinal)
  on conflict (username) do update set position = excluded.position;

  delete from public.x_monitored_accounts
  where not (username = any(normalized));
end;
$$;

revoke all on function public.replace_x_monitored_accounts(text[]) from public, anon, authenticated;
grant execute on function public.replace_x_monitored_accounts(text[]) to service_role;
