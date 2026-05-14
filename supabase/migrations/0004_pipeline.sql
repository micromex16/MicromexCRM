-- Pipeline tracking: deal value + quote sent timestamp + 'quoted' stage.

-- 1. Add 'quoted' between 'meeting' and 'closed_won' so the natural progression
--    is: new -> researching -> qualified -> contacted -> replied -> meeting
--       -> quoted -> closed_won / closed_lost / disqualified
alter type public.lead_status add value if not exists 'quoted' before 'closed_won';

-- 2. Add deal-tracking fields to companies
alter table public.companies
  add column if not exists deal_value_usd numeric(12, 2),
  add column if not exists quote_sent_at timestamptz,
  add column if not exists pipeline_notes text;

create index if not exists companies_deal_value_idx
  on public.companies(deal_value_usd desc nulls last);

-- 3. Pipeline summary view — used by the dashboard
create or replace view public.v_pipeline_value as
select
  status,
  count(*)::int as count,
  coalesce(sum(deal_value_usd), 0)::numeric(14,2) as total_value_usd,
  coalesce(avg(deal_value_usd), 0)::numeric(14,2) as avg_value_usd
from public.companies
where status not in ('closed_lost', 'disqualified')
group by status;

grant select on public.v_pipeline_value to authenticated;
