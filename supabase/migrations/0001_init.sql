-- Micromex Lead Engine — initial schema
-- Generated 2026-05-13

set check_function_bodies = off;

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- ============================================================================
-- updated_at trigger
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- enums
-- ============================================================================
create type public.capability_bucket as enum (
  'electrical',
  'refurb',
  'packaging',
  'mechanical'
);

create type public.lead_status as enum (
  'new',
  'researching',
  'qualified',
  'contacted',
  'replied',
  'meeting',
  'closed_won',
  'closed_lost',
  'disqualified'
);

create type public.seniority as enum (
  'c_suite',
  'vp',
  'director',
  'manager',
  'individual_contributor',
  'unknown'
);

create type public.lead_source as enum (
  'importyeti',
  'panjiva',
  'linkedin',
  'manual',
  'referral',
  'csv_upload'
);

create type public.enrichment_target as enum ('company', 'contact');

create type public.enrichment_job_type as enum (
  'research',
  'email_lookup',
  'score',
  'draft_email',
  'classify_reply'
);

create type public.job_status as enum ('pending', 'running', 'done', 'failed');

create type public.campaign_status as enum ('draft', 'live', 'paused', 'complete');

create type public.send_mode as enum ('auto', 'manual_review');

create type public.reply_handler as enum ('forward_to_giovanni', 'auto_reply_then_forward');

create type public.send_status as enum (
  'queued',
  'sent',
  'bounced',
  'replied',
  'opened',
  'clicked',
  'unsubscribed',
  'manual_hold',
  'failed'
);

create type public.activity_type as enum (
  'note',
  'email_sent',
  'email_replied',
  'meeting',
  'call',
  'status_change',
  'research_update',
  'system'
);

create type public.reply_classification as enum (
  'interested',
  'not_now',
  'not_a_fit',
  'unsubscribe',
  'auto_oof',
  'unknown'
);

-- ============================================================================
-- profiles (linked to auth.users)
-- ============================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  org_id uuid,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- companies
-- ============================================================================
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  name text not null,
  domain text unique,
  country text,
  industry_segment text,
  hq_city text,
  hq_state text,
  revenue_band text,
  employee_band text,
  website text,
  linkedin_url text,
  logo_url text,
  description text,
  capability_match public.capability_bucket[] default '{}'::public.capability_bucket[],
  tariff_exposure_score int default 0 check (tariff_exposure_score between 0 and 100),
  fit_score int default 0 check (fit_score between 0 and 100),
  status public.lead_status not null default 'new',
  research_summary text,
  research_intelligence_json jsonb,
  source public.lead_source default 'manual',
  source_ref text,
  assigned_to uuid references public.profiles(id) on delete set null,
  last_activity_at timestamptz,
  next_action_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index companies_domain_idx on public.companies(domain);
create index companies_status_idx on public.companies(status);
create index companies_fit_score_idx on public.companies(fit_score desc);
create index companies_capability_match_idx on public.companies using gin(capability_match);
create index companies_industry_idx on public.companies(industry_segment);
create index companies_assigned_to_idx on public.companies(assigned_to);

create trigger companies_updated_at before update on public.companies
  for each row execute function public.set_updated_at();

-- ============================================================================
-- contacts
-- ============================================================================
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  company_id uuid not null references public.companies(id) on delete cascade,
  first_name text,
  last_name text,
  full_name text generated always as (
    trim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
  ) stored,
  title text,
  seniority public.seniority default 'unknown',
  email text,
  email_verified boolean default false,
  phone text,
  linkedin_url text,
  role_match_score int default 0 check (role_match_score between 0 and 100),
  is_primary boolean default false,
  unsubscribed boolean default false,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contacts_company_id_idx on public.contacts(company_id);
create index contacts_email_idx on public.contacts(email);
create unique index contacts_company_email_unique
  on public.contacts(company_id, lower(email))
  where email is not null;

create trigger contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

-- Only one primary contact per company
create unique index contacts_one_primary_per_company
  on public.contacts(company_id)
  where is_primary = true;

-- ============================================================================
-- shipments (raw import data)
-- ============================================================================
create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  consignee_name_raw text not null,
  consignee_address text,
  shipper_name text,
  shipper_country text,
  shipper_address text,
  product_description text,
  hts_code text,
  weight_kg numeric,
  container_count int,
  value_usd numeric,
  arrival_date date,
  port_of_unlading text,
  port_of_lading text,
  vessel_name text,
  bill_of_lading text,
  source public.lead_source default 'importyeti',
  raw_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shipments_company_id_idx on public.shipments(company_id);
create index shipments_arrival_date_idx on public.shipments(arrival_date desc);
create index shipments_hts_code_idx on public.shipments(hts_code);
create index shipments_consignee_raw_idx on public.shipments(lower(consignee_name_raw));
create unique index shipments_bol_unique
  on public.shipments(bill_of_lading)
  where bill_of_lading is not null;

create trigger shipments_updated_at before update on public.shipments
  for each row execute function public.set_updated_at();

-- ============================================================================
-- enrichment_jobs (background queue)
-- ============================================================================
create table public.enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  target_type public.enrichment_target not null,
  target_id uuid not null,
  job_type public.enrichment_job_type not null,
  status public.job_status not null default 'pending',
  attempts int not null default 0,
  max_attempts int not null default 3,
  priority int not null default 5,
  scheduled_for timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  result_json jsonb,
  metadata_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index enrichment_pending_idx
  on public.enrichment_jobs(scheduled_for, priority desc)
  where status = 'pending';
create index enrichment_target_idx on public.enrichment_jobs(target_type, target_id);
create index enrichment_job_type_idx on public.enrichment_jobs(job_type, status);

create trigger enrichment_jobs_updated_at before update on public.enrichment_jobs
  for each row execute function public.set_updated_at();

-- ============================================================================
-- email_templates
-- ============================================================================
create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  capability_bucket public.capability_bucket not null,
  variant_label text not null default 'A',
  subject text not null,
  body_md text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index email_templates_name_variant
  on public.email_templates(name, variant_label);
create index email_templates_capability_idx
  on public.email_templates(capability_bucket, is_active);

create trigger email_templates_updated_at before update on public.email_templates
  for each row execute function public.set_updated_at();

-- ============================================================================
-- campaigns
-- ============================================================================
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  capability_bucket public.capability_bucket not null,
  template_id uuid references public.email_templates(id) on delete restrict,
  segment_filter jsonb,
  status public.campaign_status not null default 'draft',
  send_mode public.send_mode not null default 'manual_review',
  reply_handler public.reply_handler not null default 'forward_to_giovanni',
  daily_send_cap int not null default 50,
  total_targets int default 0,
  total_sent int default 0,
  total_replied int default 0,
  total_bounced int default 0,
  total_unsubscribed int default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index campaigns_status_idx on public.campaigns(status);

create trigger campaigns_updated_at before update on public.campaigns
  for each row execute function public.set_updated_at();

-- ============================================================================
-- sends
-- ============================================================================
create table public.sends (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  template_id uuid references public.email_templates(id) on delete set null,
  variant_label text,
  subject_rendered text not null,
  body_rendered text not null,
  status public.send_status not null default 'queued',
  resend_message_id text,
  scheduled_for timestamptz default now(),
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  replied_at timestamptz,
  bounced_at timestamptz,
  unsubscribed_at timestamptz,
  reply_body text,
  reply_classification public.reply_classification,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sends_campaign_status_idx on public.sends(campaign_id, status);
create index sends_contact_idx on public.sends(contact_id);
create index sends_status_scheduled_idx
  on public.sends(scheduled_for)
  where status = 'queued';
create index sends_resend_msg_idx on public.sends(resend_message_id);

create trigger sends_updated_at before update on public.sends
  for each row execute function public.set_updated_at();

-- ============================================================================
-- activities (timeline)
-- ============================================================================
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  type public.activity_type not null,
  body text,
  actor text not null default 'system',
  metadata_json jsonb,
  created_at timestamptz not null default now()
);

create index activities_company_created_idx
  on public.activities(company_id, created_at desc);
create index activities_contact_created_idx
  on public.activities(contact_id, created_at desc);
create index activities_type_idx on public.activities(type);

-- ============================================================================
-- suppression_list (global unsubscribes / domains we should never email)
-- ============================================================================
create table public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  email text,
  domain text,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint suppression_email_or_domain check (email is not null or domain is not null)
);

create unique index suppression_email_unique
  on public.suppression_list(lower(email)) where email is not null;
create unique index suppression_domain_unique
  on public.suppression_list(lower(domain)) where domain is not null;

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.shipments enable row level security;
alter table public.enrichment_jobs enable row level security;
alter table public.email_templates enable row level security;
alter table public.campaigns enable row level security;
alter table public.sends enable row level security;
alter table public.activities enable row level security;
alter table public.suppression_list enable row level security;

-- Helper: is the user a Micromex member?
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid()
  );
$$;

-- All authenticated members can read and write
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'profiles','companies','contacts','shipments',
      'enrichment_jobs','email_templates','campaigns',
      'sends','activities','suppression_list'
    ])
  loop
    execute format($pol$
      create policy %1$I on public.%2$I
        for all
        to authenticated
        using (public.is_member())
        with check (public.is_member());
    $pol$, t || '_member_rw', t);
  end loop;
end$$;

-- Profiles: a user can always see their own row regardless of membership func.
create policy profiles_self_read on public.profiles
  for select to authenticated using (id = auth.uid());

-- ============================================================================
-- helper view: lead pipeline
-- ============================================================================
create or replace view public.v_lead_pipeline as
select
  status,
  count(*)::int as count,
  round(avg(fit_score))::int as avg_fit_score
from public.companies
where status not in ('disqualified', 'closed_lost')
group by status;

-- ============================================================================
-- helper view: top hot leads
-- ============================================================================
create or replace view public.v_hot_leads as
select
  c.id,
  c.name,
  c.domain,
  c.industry_segment,
  c.fit_score,
  c.tariff_exposure_score,
  c.capability_match,
  c.status,
  c.last_activity_at
from public.companies c
where c.status in ('new','researching','qualified','contacted','replied')
order by c.fit_score desc nulls last, c.tariff_exposure_score desc nulls last
limit 50;

grant select on public.v_lead_pipeline to authenticated;
grant select on public.v_hot_leads to authenticated;
