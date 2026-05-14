// Domain-level types used across the app.
// These are hand-maintained; Supabase row types come from lib/types/database.ts.

export type CapabilityBucket = 'electrical' | 'refurb' | 'packaging' | 'mechanical';

export const CAPABILITY_LABELS: Record<CapabilityBucket, string> = {
  electrical: 'Electrical assemblies',
  refurb: 'Refurbishment / reman',
  packaging: 'Custom packaging',
  mechanical: 'Mechanical assembly',
};

export const CAPABILITY_SHORT: Record<CapabilityBucket, string> = {
  electrical: 'Electrical',
  refurb: 'Refurb',
  packaging: 'Packaging',
  mechanical: 'Mechanical',
};

export type LeadStatus =
  | 'new'
  | 'researching'
  | 'qualified'
  | 'contacted'
  | 'replied'
  | 'meeting'
  | 'quoted'
  | 'closed_won'
  | 'closed_lost'
  | 'disqualified';

export const STATUS_ORDER: LeadStatus[] = [
  'new',
  'researching',
  'qualified',
  'contacted',
  'replied',
  'meeting',
  'quoted',
  'closed_won',
  'closed_lost',
  'disqualified',
];

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  researching: 'Researching',
  qualified: 'Qualified',
  contacted: 'Contacted',
  replied: 'Replied',
  meeting: 'Meeting',
  quoted: 'Quoted',
  closed_won: 'Closed (won)',
  closed_lost: 'Closed (lost)',
  disqualified: 'Disqualified',
};

/** Higher-level grouping for at-a-glance pipeline temperature. */
export type Temperature = 'cold' | 'warm' | 'hot' | 'won' | 'lost';

export const TEMPERATURE_BY_STATUS: Record<LeadStatus, Temperature> = {
  new: 'cold',
  researching: 'cold',
  qualified: 'cold',
  contacted: 'cold',
  replied: 'warm',
  meeting: 'hot',
  quoted: 'hot',
  closed_won: 'won',
  closed_lost: 'lost',
  disqualified: 'lost',
};

export const TEMPERATURE_LABELS: Record<Temperature, string> = {
  cold: 'Cold',
  warm: 'Warm',
  hot: 'Hot',
  won: 'Won',
  lost: 'Lost',
};

export type ResearchIntelligence = {
  primary_capability_match: CapabilityBucket;
  secondary_capability_matches: CapabilityBucket[];
  estimated_annual_spend_usd: { low: number; high: number };
  current_vendor_guess: string;
  tariff_exposure_pct_estimate: number;
  decision_cycle_weeks: { low: number; high: number };
  switching_triggers: string[];
  buying_committee_titles: string[];
  opening_hook: string;
  risk_flags: string[];
};

// HTS codes Micromex hunts on
export const TARGET_HTS_CODES = [
  { code: '8544', label: 'Insulated wire, cable, harnesses', capability: 'electrical' },
  { code: '8504', label: 'Transformers, inductors, power supplies', capability: 'electrical' },
  { code: '8536', label: 'Switches, plugs, connectors, breakers', capability: 'electrical' },
  { code: '8537', label: 'Control panels', capability: 'electrical' },
  { code: '7326', label: 'Sheet metal articles', capability: 'mechanical' },
  { code: '8516', label: 'Small electrical appliances', capability: 'refurb' },
  { code: '9503', label: 'Toys', capability: 'packaging' },
  { code: '4911', label: 'Printed temporary tattoos', capability: 'packaging' },
  { code: '3919', label: 'Adhesive plastic sheets / temp tattoo', capability: 'packaging' },
  { code: '8302', label: 'Door hardware, sheaves, hinges', capability: 'mechanical' },
] as const;
