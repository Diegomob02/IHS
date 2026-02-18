create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  type text not null,
  payload jsonb not null,
  livemode boolean,
  api_version text,
  received_at timestamptz not null default now(),
  last_received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received' check (status in ('received', 'processed', 'failed')),
  attempts int not null default 1,
  last_error text
);

create index if not exists idx_stripe_webhook_events_type on public.stripe_webhook_events(type);
create index if not exists idx_stripe_webhook_events_status on public.stripe_webhook_events(status);

alter table public.stripe_webhook_events enable row level security;

drop policy if exists "Super admins can read stripe webhook events" on public.stripe_webhook_events;
create policy "Super admins can read stripe webhook events"
on public.stripe_webhook_events
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'super_admin'
  )
);

