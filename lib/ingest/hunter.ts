import { z } from 'zod';
import { normalizeSeniority, scoreTitle, type NormalizedContact } from '@/lib/ingest/apollo';

const HUNTER_BASE = 'https://api.hunter.io/v2';

const HunterEmailSchema = z.object({
  value: z.string(),
  type: z.string().nullable().optional(),
  confidence: z.number().nullable().optional(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
  seniority: z.string().nullable().optional(),
  linkedin: z.string().nullable().optional(),
  phone_number: z.string().nullable().optional(),
});

export async function searchHunterByDomain(domain: string): Promise<NormalizedContact[]> {
  const key = process.env.HUNTER_API_KEY;
  if (!key) {
    throw new Error('HUNTER_API_KEY not set');
  }

  const url = `${HUNTER_BASE}/domain-search?domain=${encodeURIComponent(domain)}&limit=25&api_key=${key}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hunter ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  const emails: unknown[] = json?.data?.emails ?? [];

  const out: NormalizedContact[] = [];
  for (const raw of emails) {
    const parsed = HunterEmailSchema.safeParse(raw);
    if (!parsed.success) continue;
    const e = parsed.data;
    out.push({
      first_name: e.first_name ?? null,
      last_name: e.last_name ?? null,
      title: e.position ?? null,
      email: e.value,
      email_verified: (e.confidence ?? 0) >= 80,
      phone: e.phone_number ?? null,
      linkedin_url: e.linkedin ?? null,
      seniority: normalizeSeniority(e.seniority, e.position),
      role_match_score: scoreTitle(e.position),
      source: 'hunter',
    });
  }
  return out;
}
