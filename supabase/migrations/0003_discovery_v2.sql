-- Discovery v2: custom targets, lookalike expansion, per-target metrics.

-- 1. Add lookalike_discovery to the enrichment_job_type enum
alter type public.enrichment_job_type add value if not exists 'lookalike_discovery';

-- 2. Custom (user-defined) discovery targets
create table public.custom_discovery_targets (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  capability public.capability_bucket not null,
  industry_segment text not null,
  description text not null default '',
  import_origins text[] not null default '{}',
  revenue_band text not null default '$5M-$200M',
  search_hints text[] not null default '{}',
  product_signals text[] not null default '{}',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index custom_targets_active_idx on public.custom_discovery_targets(is_active);
create index custom_targets_capability_idx on public.custom_discovery_targets(capability);

alter table public.custom_discovery_targets enable row level security;

create policy custom_targets_member_rw on public.custom_discovery_targets
  for all to authenticated
  using (public.is_member())
  with check (public.is_member());

create trigger custom_targets_updated_at before update on public.custom_discovery_targets
  for each row execute function public.set_updated_at();

-- 3. Per-target metrics view — foundation for self-learning (phase 2 reads this)
create or replace view public.v_discovery_target_metrics as
with target_runs as (
  select
    target_id,
    sum(candidates_returned)::int as candidates_total,
    sum(companies_created)::int as companies_total,
    sum(companies_skipped_dedupe)::int as dedupes_total,
    count(*)::int as run_count,
    coalesce(avg(duration_ms)::int, 0) as avg_duration_ms,
    max(created_at) as last_run_at
  from public.discovery_runs
  group by target_id
),
target_companies as (
  select
    -- discovery:<id> or lookalike:<id>; we just split on : and keep the rest
    substring(source_ref from position(':' in source_ref) + 1) as target_id,
    coalesce(avg(nullif(fit_score, 0))::int, 0) as avg_fit_score,
    count(*) filter (where status = 'qualified')::int as qualified_count,
    count(*) filter (where status = 'contacted')::int as contacted_count,
    count(*) filter (where status = 'replied')::int as replied_count,
    count(*) filter (where status = 'meeting')::int as meeting_count,
    count(*) filter (where status = 'closed_won')::int as won_count,
    count(*) filter (where status = 'disqualified')::int as disqualified_count,
    count(*)::int as total_count
  from public.companies
  where source_ref like 'discovery:%' or source_ref like 'lookalike:%'
  group by substring(source_ref from position(':' in source_ref) + 1)
)
select
  r.target_id,
  r.run_count,
  r.candidates_total,
  r.companies_total,
  r.dedupes_total,
  r.avg_duration_ms,
  r.last_run_at,
  coalesce(c.avg_fit_score, 0) as avg_fit_score,
  coalesce(c.qualified_count, 0) as qualified_count,
  coalesce(c.contacted_count, 0) as contacted_count,
  coalesce(c.replied_count, 0) as replied_count,
  coalesce(c.meeting_count, 0) as meeting_count,
  coalesce(c.won_count, 0) as won_count,
  coalesce(c.disqualified_count, 0) as disqualified_count,
  -- a simple performance index: rewards replies + meetings + wins,
  -- penalizes disqualifieds. used by phase 2 weighted rotation.
  greatest(
    0,
    coalesce(c.qualified_count, 0) * 1
      + coalesce(c.contacted_count, 0) * 2
      + coalesce(c.replied_count, 0) * 5
      + coalesce(c.meeting_count, 0) * 10
      + coalesce(c.won_count, 0) * 25
      - coalesce(c.disqualified_count, 0) * 3
  )::int as performance_score
from target_runs r
left join target_companies c on c.target_id = r.target_id;

grant select on public.v_discovery_target_metrics to authenticated;
