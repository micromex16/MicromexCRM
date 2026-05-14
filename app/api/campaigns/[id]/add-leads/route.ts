import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { enqueue } from '@/lib/jobs';
import { draftEmail } from '@/lib/enrichment/draft';
import type { CapabilityBucket } from '@/lib/types/domain';

export const runtime = 'nodejs';
export const maxDuration = 60;

// How long to spend drafting inline before bailing to the queue.
const DEADLINE_MS = 50_000;
const PARALLEL = 3;

const Body = z.object({
  company_ids: z.array(z.string().uuid()).min(1).max(200),
});

interface AddableCompany {
  id: string;
  name: string;
  domain: string | null;
  fit_score: number | null;
  status: string;
  capability_match: string[] | null;
  industry_segment: string | null;
  contact_count: number;
  already_in_campaign: boolean;
}

/**
 * GET — list companies that could be added to this campaign.
 * Returns companies whose capability_match overlaps the campaign's bucket,
 * minus ones already in the campaign. Supports a `q` text filter.
 */
export async function GET(request: NextRequest, ctx: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const q = params.get('q')?.trim() ?? '';
  const min = parseInt(params.get('min') ?? '0', 10) || 0;
  // Optional override — by default we restrict to the campaign's bucket. Caller
  // can pass ?capability=electrical to peek at other buckets, but the UI
  // discourages this since the template won't match.
  const requestedCapability = params.get('capability') as CapabilityBucket | null;

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, capability_bucket')
    .eq('id', ctx.params.id)
    .single();
  if (!campaign) return NextResponse.json({ error: 'campaign_not_found' }, { status: 404 });
  const campaignBucket = (campaign as { capability_bucket: CapabilityBucket }).capability_bucket;
  const bucket: CapabilityBucket = requestedCapability ?? campaignBucket;

  // Companies that already have sends in this campaign
  const { data: existingSends } = await supabase
    .from('sends')
    .select('company_id')
    .eq('campaign_id', ctx.params.id);
  const existingCompanyIds = new Set(
    ((existingSends ?? []) as { company_id: string }[]).map((s) => s.company_id),
  );

  // Pull candidate companies in this capability bucket
  let query = supabase
    .from('companies')
    .select('id, name, domain, fit_score, status, capability_match, industry_segment, contacts(id, email, unsubscribed)')
    .overlaps('capability_match', [bucket])
    .not('status', 'in', '(disqualified,closed_lost,closed_won)')
    .order('fit_score', { ascending: false, nullsFirst: false })
    .limit(100);

  if (q) query = query.ilike('name', `%${q}%`);
  if (min > 0) query = query.gte('fit_score', min);

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const companies: AddableCompany[] = ((rows ?? []) as Array<{
    id: string;
    name: string;
    domain: string | null;
    fit_score: number | null;
    status: string;
    capability_match: string[] | null;
    industry_segment: string | null;
    contacts: Array<{ id: string; email: string | null; unsubscribed: boolean }> | null;
  }>).map((c) => {
    const validContacts = (c.contacts ?? []).filter((ct) => ct.email && !ct.unsubscribed);
    return {
      id: c.id,
      name: c.name,
      domain: c.domain,
      fit_score: c.fit_score,
      status: c.status,
      capability_match: c.capability_match,
      industry_segment: c.industry_segment,
      contact_count: validContacts.length,
      already_in_campaign: existingCompanyIds.has(c.id),
    };
  });

  // Bucket counts across all capabilities (for the tab badges)
  const { data: bucketCountRows } = await supabase
    .from('companies')
    .select('capability_match, status')
    .not('status', 'in', '(disqualified,closed_lost,closed_won)');
  const bucketCounts: Record<string, number> = {
    electrical: 0,
    refurb: 0,
    packaging: 0,
    mechanical: 0,
  };
  for (const r of (bucketCountRows ?? []) as Array<{ capability_match: string[] | null }>) {
    for (const cap of r.capability_match ?? []) {
      if (cap in bucketCounts) bucketCounts[cap]++;
    }
  }

  return NextResponse.json({
    companies,
    capability_bucket: bucket,
    campaign_capability: campaignBucket,
    bucket_counts: bucketCounts,
  });
}

/**
 * POST — add the given companies to the campaign by queuing draft_email
 * jobs for each emailable, non-unsubscribed contact of each company.
 */
export async function POST(request: NextRequest, ctx: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const json = await request.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ error: 'invalid_body', issues: parsed.error.flatten() }, { status: 400 });

  const adminDb = createServiceClient();

  // Pull campaign for template_id
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, template_id, status')
    .eq('id', ctx.params.id)
    .single();
  if (!campaign) return NextResponse.json({ error: 'campaign_not_found' }, { status: 404 });
  const c = campaign as { id: string; template_id: string | null; status: string };
  if (!c.template_id) return NextResponse.json({ error: 'campaign_has_no_template' }, { status: 400 });

  // Pull contacts for all selected companies in one go
  const { data: contactsData } = await adminDb
    .from('contacts')
    .select('id, company_id, email, unsubscribed')
    .in('company_id', parsed.data.company_ids);

  type ContactRow = { id: string; company_id: string; email: string | null; unsubscribed: boolean };
  const rawContacts = (contactsData ?? []) as ContactRow[];
  const contacts = rawContacts.filter((ct) => ct.email && !ct.unsubscribed);
  const skipped = rawContacts.length - contacts.length;

  const startedAt = Date.now();
  let drafted_inline = 0;
  let draft_failed = 0;
  let queued_for_later = 0;
  const errors: string[] = [];

  // Process in parallel batches until we run out of time budget. Anything
  // left over is enqueued for the run-enrichment cron.
  const todo = [...contacts];
  while (todo.length > 0 && Date.now() - startedAt < DEADLINE_MS - 15_000) {
    const batch = todo.splice(0, PARALLEL);
    const results = await Promise.allSettled(
      batch.map((ct) =>
        draftEmail({
          contactId: ct.id,
          templateId: c.template_id!,
          persist: true,
          campaignId: c.id,
        }),
      ),
    );
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled') {
        drafted_inline++;
      } else {
        draft_failed++;
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        errors.push(`${batch[i].id}: ${msg}`);
      }
    }
  }

  // Anything left went over the time budget — enqueue for the cron.
  for (const ct of todo) {
    try {
      await enqueue({
        targetType: 'contact',
        targetId: ct.id,
        jobType: 'draft_email',
        priority: 5,
        metadata: { template_id: c.template_id!, campaign_id: c.id },
      });
      queued_for_later++;
    } catch {
      draft_failed++;
    }
  }

  // Bump the campaign's target counter + flip to live if it was draft
  const totalAdded = drafted_inline + queued_for_later;
  const updates: Record<string, unknown> = {};
  if (c.status === 'draft' && totalAdded > 0) {
    updates.status = 'live';
    updates.starts_at = new Date().toISOString();
  }
  if (Object.keys(updates).length > 0) {
    await adminDb.from('campaigns').update(updates as never).eq('id', c.id);
  }
  if (totalAdded > 0) {
    const { data: cur } = await adminDb
      .from('campaigns')
      .select('total_targets')
      .eq('id', c.id)
      .single();
    const next = ((cur as { total_targets: number | null } | null)?.total_targets ?? 0) + totalAdded;
    await adminDb.from('campaigns').update({ total_targets: next } as never).eq('id', c.id);
  }

  return NextResponse.json({
    ok: true,
    companies_added: parsed.data.company_ids.length,
    contacts_total: rawContacts.length,
    drafted_inline,
    queued_for_later,
    skipped,
    draft_failed,
    errors: errors.slice(0, 5),
  });
}
