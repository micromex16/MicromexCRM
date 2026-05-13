-- Discovery runs: history of Claude discovery-agent invocations.
-- Each row = one cron tick or manual trigger.

create table public.discovery_runs (
  id uuid primary key default gen_random_uuid(),
  target_id text not null,
  trigger text not null default 'manual',
  candidates_returned int not null default 0,
  companies_created int not null default 0,
  companies_skipped_dedupe int not null default 0,
  jobs_enqueued int not null default 0,
  duration_ms int,
  errors jsonb not null default '[]'::jsonb,
  error_message text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index discovery_runs_created_idx on public.discovery_runs(created_at desc);
create index discovery_runs_target_idx on public.discovery_runs(target_id, created_at desc);

alter table public.discovery_runs enable row level security;

create policy discovery_runs_member_rw on public.discovery_runs
  for all to authenticated
  using (public.is_member())
  with check (public.is_member());

-- Helper view: discovery stats summary (last 7 days).
create or replace view public.v_discovery_summary as
select
  count(*) filter (where created_at > now() - interval '7 days')::int as runs_7d,
  coalesce(sum(companies_created) filter (where created_at > now() - interval '7 days'), 0)::int as companies_7d,
  coalesce(sum(jobs_enqueued) filter (where created_at > now() - interval '7 days'), 0)::int as jobs_7d,
  coalesce(sum(companies_created) filter (where created_at > now() - interval '30 days'), 0)::int as companies_30d,
  max(created_at) as last_run_at
from public.discovery_runs;

grant select on public.v_discovery_summary to authenticated;
