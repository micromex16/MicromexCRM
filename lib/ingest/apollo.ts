import { z } from 'zod';

const APOLLO_BASE = 'https://api.apollo.io/v1';

// Titles that map to Micromex buyer roles, in priority order.
const PRIORITY_TITLES = [
  /supply\s*chain/i,
  /sourcing/i,
  /procurement/i,
  /operations/i,
  /manufacturing/i,
  /engineering/i,
  /head of (ops|supply|sourcing)/i,
  /\bcoo\b/i,
  /\bvp\b/i,
  /director/i,
  /founder|ceo|president/i,
];

const ApolloPersonSchema = z.object({
  id: z.string().optional(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  email_status: z.string().nullable().optional(),
  linkedin_url: z.string().nullable().optional(),
  seniority: z.string().nullable().optional(),
  phone_numbers: z
    .array(z.object({ raw_number: z.string().nullable().optional() }))
    .optional(),
});

export type ApolloPerson = z.infer<typeof ApolloPersonSchema>;

export interface NormalizedContact {
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  email: string | null;
  email_verified: boolean;
  phone: string | null;
  linkedin_url: string | null;
  seniority: 'c_suite' | 'vp' | 'director' | 'manager' | 'individual_contributor' | 'unknown';
  role_match_score: number;
  source: 'apollo' | 'hunter';
}

export async function searchApolloByDomain(domain: string): Promise<NormalizedContact[]> {
  const key = process.env.APOLLO_API_KEY;
  if (!key) {
    throw new Error('APOLLO_API_KEY not set');
  }

  const res = await fetch(`${APOLLO_BASE}/mixed_people/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': key,
    },
    body: JSON.stringify({
      q_organization_domains: domain,
      page: 1,
      per_page: 25,
      person_titles: [
        'VP Operations',
        'VP Supply Chain',
        'Director Operations',
        'Director Supply Chain',
        'Director Manufacturing',
        'Director Sourcing',
        'COO',
        'Head of Operations',
        'Head of Supply Chain',
        'Director Procurement',
        'Founder',
        'CEO',
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apollo ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  const people: unknown[] = json.people ?? json.contacts ?? [];

  const out: NormalizedContact[] = [];
  for (const raw of people) {
    const parsed = ApolloPersonSchema.safeParse(raw);
    if (!parsed.success) continue;
    const p = parsed.data;
    if (!p.first_name && !p.last_name) continue;
    out.push({
      first_name: p.first_name ?? null,
      last_name: p.last_name ?? null,
      title: p.title ?? null,
      email: p.email ?? null,
      email_verified: p.email_status === 'verified',
      phone: p.phone_numbers?.[0]?.raw_number ?? null,
      linkedin_url: p.linkedin_url ?? null,
      seniority: normalizeSeniority(p.seniority, p.title),
      role_match_score: scoreTitle(p.title),
      source: 'apollo',
    });
  }
  return out;
}

export function normalizeSeniority(
  apollo: string | null | undefined,
  title: string | null | undefined,
): NormalizedContact['seniority'] {
  const s = (apollo ?? '').toLowerCase();
  if (s.includes('c_suite') || s === 'c_level') return 'c_suite';
  if (s.includes('vp') || s.includes('vice_president')) return 'vp';
  if (s.includes('director') || s.includes('head')) return 'director';
  if (s.includes('manager')) return 'manager';
  if (s.includes('individual') || s.includes('entry') || s.includes('senior')) return 'individual_contributor';

  // Fall back to title heuristics
  const t = (title ?? '').toLowerCase();
  if (/\b(ceo|cfo|coo|cto|founder|president)\b/.test(t)) return 'c_suite';
  if (/\bvp\b|vice president/.test(t)) return 'vp';
  if (/director|head/.test(t)) return 'director';
  if (/manager/.test(t)) return 'manager';
  return 'unknown';
}

export function scoreTitle(title: string | null | undefined): number {
  if (!title) return 10;
  for (let i = 0; i < PRIORITY_TITLES.length; i++) {
    if (PRIORITY_TITLES[i].test(title)) {
      // Earlier matches score higher: 90, 85, 80, ...
      return Math.max(20, 95 - i * 5);
    }
  }
  return 15;
}
