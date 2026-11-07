-- Server-only subscriptions and a durable per-device delivery outbox.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique check (length(endpoint) <= 4096),
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.push_notification_state (
  id text primary key check (id = 'primary'),
  nasdaq_peak double precision not null default 0 check (nasdaq_peak >= 0)
);
create table public.push_events (
  id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create table public.push_deliveries (
  event_id text not null references public.push_events(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  primary key (event_id, subscription_id)
);
create index push_deliveries_pending on public.push_deliveries(next_attempt_at) where status in ('pending', 'sending');
alter table public.push_subscriptions enable row level security;
alter table public.push_notification_state enable row level security;
alter table public.push_events enable row level security;
alter table public.push_deliveries enable row level security;
revoke all on public.push_subscriptions, public.push_notification_state, public.push_events, public.push_deliveries from public, anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions, public.push_notification_state, public.push_events, public.push_deliveries to service_role;

-- Publishing and queueing commit together. Lost RPC responses and workflow
-- retries reuse the existing snapshot without generating another delivery.
create function public.publish_refresh_with_notifications(p_run_id uuid, p_events jsonb, p_nasdaq_peak double precision, p_recovery_error text default null)
returns boolean
language plpgsql security invoker set search_path = public
as $$
declare
  event jsonb;
  event_id text;
  recovered boolean;
begin
  perform pg_advisory_xact_lock(hashtext('blackturtle-notification-publish'));
  if exists (select 1 from public.dashboard_snapshots where refresh_run_id = p_run_id) then
    return true;
  end if;
  if p_recovery_error is null then
    perform public.complete_refresh_from_draft(p_run_id);
  else
    recovered := public.recover_refresh_draft_or_fail(p_run_id, p_recovery_error);
    if not recovered then return false; end if;
  end if;
  insert into public.push_notification_state(id, nasdaq_peak)
  values ('primary', greatest(0, coalesce(p_nasdaq_peak, 0)))
  on conflict (id) do update set nasdaq_peak = greatest(push_notification_state.nasdaq_peak, excluded.nasdaq_peak);
  for event in select value from jsonb_array_elements(p_events) loop
    event_id := p_run_id::text || ':' || (event->>'key');
    insert into public.push_events(id, payload) values (event_id, event) on conflict do nothing;
    insert into public.push_deliveries(event_id, subscription_id)
    select event_id, s.id from public.push_subscriptions s
    on conflict do nothing;
  end loop;
  delete from public.push_events where created_at < now() - interval '7 days';
  return true;
end;
$$;

-- Lease each recipient atomically so simultaneous workers cannot send it twice.
create function public.claim_push_deliveries(p_limit integer default 50)
returns table(event_id text, subscription_id uuid, payload jsonb, subscription jsonb, attempts integer)
language sql security invoker set search_path = public
as $$
  with candidates as (
    select d.event_id, d.subscription_id from public.push_deliveries d
    join public.push_events e on e.id = d.event_id
    where d.status in ('pending', 'sending') and d.next_attempt_at <= now()
      and d.attempts < 5 and e.created_at > now() - interval '1 day'
    order by e.created_at, d.event_id, d.subscription_id
    limit greatest(1, least(p_limit, 100)) for update of d skip locked
  ), claimed as (
    update public.push_deliveries d set status = 'sending', attempts = d.attempts + 1,
      next_attempt_at = now() + interval '10 minutes'
    from candidates c where d.event_id = c.event_id and d.subscription_id = c.subscription_id
    returning d.event_id, d.subscription_id, d.attempts
  )
  select c.event_id, c.subscription_id, e.payload, s.subscription, c.attempts from claimed c
  join public.push_events e on e.id = c.event_id
  join public.push_subscriptions s on s.id = c.subscription_id;
$$;
revoke all on function public.publish_refresh_with_notifications(uuid, jsonb, double precision, text) from public, anon, authenticated;
revoke all on function public.claim_push_deliveries(integer) from public, anon, authenticated;
grant execute on function public.publish_refresh_with_notifications(uuid, jsonb, double precision, text) to service_role;
grant execute on function public.claim_push_deliveries(integer) to service_role;
