import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { STATUS_LABELS, type LeadStatus } from '@/lib/types/domain';

export const runtime = 'nodejs';

const VALID_STATUSES = Object.keys(STATUS_LABELS) as LeadStatus[];

const Body = z.object({
  status: z.enum(VALID_STATUSES as [LeadStatus, ...LeadStatus[]]).optional(),
  deal_value_usd: z.number().nullable().optional(),
  quote_sent_at: z.string().datetime().nullable().optional(),
  pipeline_notes: z.string().max(2000).nullable().optional(),
});

export async function POST(request: NextRequest, ctx: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const json = await request.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const id = ctx.params.id;

  // Pull current state to detect transitions worth logging.
  const { data: before } = await supabase
    .from('companies')
    .select('status, deal_value_usd, quote_sent_at')
    .eq('id', id)
    .single();
  const beforeRow = before as {
    status: LeadStatus | null;
    deal_value_usd: number | null;
    quote_sent_at: string | null;
  } | null;

  // Build the update payload — only set keys that were provided
  const update: Record<string, unknown> = {
    last_activity_at: new Date().toISOString(),
  };
  if (parsed.data.status !== undefined) update.status = parsed.data.status;
  if (parsed.data.deal_value_usd !== undefined) update.deal_value_usd = parsed.data.deal_value_usd;
  if (parsed.data.quote_sent_at !== undefined) update.quote_sent_at = parsed.data.quote_sent_at;
  if (parsed.data.pipeline_notes !== undefined) update.pipeline_notes = parsed.data.pipeline_notes;

  // Auto-stamp quote_sent_at when the stage moves to 'quoted' for the first time
  if (
    parsed.data.status === 'quoted' &&
    beforeRow?.status !== 'quoted' &&
    !beforeRow?.quote_sent_at &&
    parsed.data.quote_sent_at === undefined
  ) {
    update.quote_sent_at = new Date().toISOString();
  }

  const { error } = await supabase.from('companies').update(update as never).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log a status_change activity if the stage actually changed
  if (parsed.data.status && beforeRow && beforeRow.status !== parsed.data.status) {
    const beforeLabel = beforeRow.status ? STATUS_LABELS[beforeRow.status] : '(none)';
    const afterLabel = STATUS_LABELS[parsed.data.status];
    await supabase.from('activities').insert({
      company_id: id,
      type: 'status_change',
      actor: user.email ?? 'user',
      body: `${beforeLabel} → ${afterLabel}`,
      metadata_json: { from: beforeRow.status, to: parsed.data.status } as never,
    } as never);
  }

  // Log a note for deal-value changes
  if (
    parsed.data.deal_value_usd !== undefined &&
    parsed.data.deal_value_usd !== beforeRow?.deal_value_usd
  ) {
    const fromVal = beforeRow?.deal_value_usd ? `$${beforeRow.deal_value_usd}` : '(none)';
    const toVal = parsed.data.deal_value_usd ? `$${parsed.data.deal_value_usd}` : '(cleared)';
    await supabase.from('activities').insert({
      company_id: id,
      type: 'note',
      actor: user.email ?? 'user',
      body: `Deal value updated: ${fromVal} → ${toVal}`,
    } as never);
  }

  return NextResponse.json({ ok: true });
}
