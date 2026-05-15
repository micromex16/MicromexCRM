import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { enqueue } from '@/lib/jobs';
import type { CapabilityBucket } from '@/lib/types/domain';

export const runtime = 'nodejs';
export const maxDuration = 30;

const CAPABILITY: [CapabilityBucket, ...CapabilityBucket[]] = [
  'electrical',
  'refurb',
  'packaging',
  'mechanical',
];

const Body = z.object({
  // Company
  name: z.string().trim().min(2, 'Company name required'),
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .nullable()
    .transform((v) => (v ? v.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : null)),
  website: z.string().trim().url().optional().nullable().or(z.literal('')),
  industry_segment: z.string().trim().optional().nullable(),
  hq_city: z.string().trim().optional().nullable(),
  hq_state: z.string().trim().optional().nullable(),
  revenue_band: z.string().trim().optional().nullable(),
  employee_band: z.string().trim().optional().nullable(),
  capability_match: z.array(z.enum(CAPABILITY)).default([]),
  description: z.string().trim().optional().nullable(),
  source: z
    .enum(['manual', 'referral', 'linkedin', 'csv_upload'])
    .default('manual'),
  // Optional first contact
  contact: z
    .object({
      first_name: z.string().trim().optional().nullable(),
      last_name: z.string().trim().optional().nullable(),
      title: z.string().trim().optional().nullable(),
      email: z.string().trim().email().optional().nullable().or(z.literal('')),
      phone: z.string().trim().optional().nullable(),
      linkedin_url: z.string().trim().url().optional().nullable().or(z.literal('')),
    })
    .optional()
    .nullable(),
  // Run Claude research + scoring after insert?
  enrich: z.boolean().default(false),
});

/**
 * POST /api/leads
 * Manually create a company (and optionally a first contact).
 * Caller can opt into Claude research/scoring via { enrich: true } — that runs
 * async via the job queue so the request returns immediately.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const b = parsed.data;
  const admin = createServiceClient();

  // Dedupe: if a company with this domain already exists, return it instead
  // of creating a duplicate. Caller can decide whether to navigate there.
  if (b.domain) {
    const { data: existing } = await admin
      .from('companies')
      .select('id, name')
      .eq('domain', b.domain)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        {
          ok: false,
          error: 'duplicate_domain',
          existing: existing as { id: string; name: string },
        },
        { status: 409 },
      );
    }
  }

  const websiteClean = b.website && b.website !== '' ? b.website : null;

  const { data: companyRow, error: companyErr } = await admin
    .from('companies')
    .insert({
      name: b.name,
      domain: b.domain ?? null,
      website: websiteClean,
      industry_segment: b.industry_segment ?? null,
      hq_city: b.hq_city ?? null,
      hq_state: b.hq_state ?? null,
      revenue_band: b.revenue_band ?? null,
      employee_band: b.employee_band ?? null,
      capability_match: b.capability_match,
      description: b.description ?? null,
      source: b.source,
      status: 'new',
    } as never)
    .select('id')
    .single();

  if (companyErr || !companyRow) {
    return NextResponse.json(
      { error: 'insert_company_failed', detail: companyErr?.message },
      { status: 500 },
    );
  }
  const companyId = (companyRow as { id: string }).id;

  // Activity log
  await admin.from('activities').insert({
    company_id: companyId,
    type: 'system',
    actor: 'user',
    body: `Lead added manually${b.source === 'referral' ? ' (referral)' : ''}.`,
  } as never);

  // Optional first contact
  let contactId: string | null = null;
  if (b.contact) {
    const c = b.contact;
    const hasAnything =
      (c.first_name && c.first_name.trim()) ||
      (c.last_name && c.last_name.trim()) ||
      (c.email && c.email.trim());
    if (hasAnything) {
      const email = c.email && c.email !== '' ? c.email.toLowerCase() : null;
      const linkedin = c.linkedin_url && c.linkedin_url !== '' ? c.linkedin_url : null;
      const { data: contactRow, error: contactErr } = await admin
        .from('contacts')
        .insert({
          company_id: companyId,
          first_name: c.first_name ?? null,
          last_name: c.last_name ?? null,
          title: c.title ?? null,
          email,
          phone: c.phone ?? null,
          linkedin_url: linkedin,
          is_primary: true,
          source: 'manual',
        } as never)
        .select('id')
        .single();
      if (contactErr) {
        // Don't fail the whole request — the company exists; surface the error.
        return NextResponse.json({
          ok: true,
          company_id: companyId,
          contact_id: null,
          contact_error: contactErr.message,
        });
      }
      contactId = (contactRow as { id: string }).id;
    }
  }

  // Optional enrichment (research + score). Queued — runs on next cron tick
  // or the user can hit "Run enrichment" on the lead detail page.
  let enrichment_queued = false;
  if (b.enrich) {
    try {
      await enqueue({
        targetType: 'company',
        targetId: companyId,
        jobType: 'research',
        priority: 5,
      });
      await enqueue({
        targetType: 'company',
        targetId: companyId,
        jobType: 'score',
        priority: 6,
      });
      enrichment_queued = true;
    } catch {
      /* non-fatal */
    }
  }

  return NextResponse.json({
    ok: true,
    company_id: companyId,
    contact_id: contactId,
    enrichment_queued,
  });
}
