import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { enqueue } from '@/lib/jobs';
import type { CapabilityBucket } from '@/lib/types/domain';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SegmentFilter = z.object({
  capability_match: z.array(z.string()).optional(),
  status: z.array(z.string()).optional(),
  fit_score_min: z.number().int().min(0).max(100).optional(),
  fit_score_max: z.number().int().min(0).max(100).optional(),
  has_email: z.boolean().optional(),
  industry_segment: z.array(z.string()).optional(),
  limit: z.number().int().positive().max(500).default(100),
});

export async function POST(request: NextRequest, ctx: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const campaignId = ctx.params.id;
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('id, capability_bucket, template_id, segment_filter, status, send_mode')
    .eq('id', campaignId)
    .single();
  if (error || !campaign)
    return NextResponse.json({ error: 'campaign_not_found' }, { status: 404 });

  type C = {
    id: string;
    capability_bucket: CapabilityBucket;
    template_id: string | null;
    segment_filter: unknown;
    status: string;
    send_mode: 'auto' | 'manual_review';
  };
  const c = campaign as C;

  if (!c.template_id) return NextResponse.json({ error: 'no_template' }, { status: 400 });
  if (c.status === 'live')
    return NextResponse.json({ error: 'already_live' }, { status: 400 });

  const filter = SegmentFilter.safeParse(c.segment_filter ?? {});
  if (!filter.success)
    return NextResponse.json(
      { error: 'invalid_segment_filter', issues: filter.error.flatten() },
      { status: 400 },
    );
  const f = filter.data;

  let query = supabase
    .from('contacts')
    .select('id, email, company_id, companies!inner(id, name, fit_score, status, capability_match, industry_segment)')
    .neq('unsubscribed', true);

  if (f.has_email) query = query.not('email', 'is', null);

  const { data: contactsRaw, error: cErr } = await query.limit(f.limit);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  type ContactRow = {
    id: string;
    email: string | null;
    company_id: string;
    companies: {
      id: string;
      name: string;
      fit_score: number | null;
      status: string;
      capability_match: string[] | null;
      industry_segment: string | null;
    };
  };

  const filtered = (contactsRaw as unknown as ContactRow[]).filter((c) => {
    const co = c.companies;
    if (f.fit_score_min !== undefined && (co.fit_score ?? 0) < f.fit_score_min) return false;
    if (f.fit_score_max !== undefined && (co.fit_score ?? 0) > f.fit_score_max) return false;
    if (f.status && f.status.length && !f.status.includes(co.status)) return false;
    if (
      f.capability_match &&
      f.capability_match.length &&
      !(co.capability_match ?? []).some((cap) => f.capability_match!.includes(cap))
    )
      return false;
    if (
      f.industry_segment &&
      f.industry_segment.length &&
      !f.industry_segment.includes(co.industry_segment ?? '')
    )
      return false;
    return true;
  });

  // Enqueue a draft_email job for each contact.
  let queued = 0;
  for (const ct of filtered) {
    try {
      await enqueue({
        targetType: 'contact',
        targetId: ct.id,
        jobType: 'draft_email',
        priority: 5,
        metadata: { template_id: c.template_id, campaign_id: c.id },
      });
      queued++;
    } catch {
      /* ignore individual failures */
    }
  }

  await supabase
    .from('campaigns')
    .update({ status: 'live', total_targets: queued, starts_at: new Date().toISOString() } as never)
    .eq('id', campaignId);

  return NextResponse.json({ ok: true, queued, total_filtered: filtered.length });
}
