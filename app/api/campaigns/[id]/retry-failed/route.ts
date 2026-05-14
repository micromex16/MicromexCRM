import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { sendOne } from '@/lib/outreach/send';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DEADLINE_MS = 50_000;
const PARALLEL = 6;

/**
 * Bulk retry every failed send in this campaign — resets status + clears
 * error, then sends in parallel batches. For the Resend-free-tier-100/day
 * use case, run this the next day to drain failures from the prior day.
 */
export async function POST(_request: NextRequest, ctx: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const adminDb = createServiceClient();

  // Pull failed sends for this campaign
  const { data: failed } = await adminDb
    .from('sends')
    .select('id')
    .eq('campaign_id', ctx.params.id)
    .eq('status', 'failed')
    .order('updated_at', { ascending: true })
    .limit(200);

  const ids = ((failed ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, total: 0, sent: 0, failed: 0, skipped_suppressed: 0, remaining: 0 });
  }

  // Reset all to queued so sendOne will process them
  await adminDb
    .from('sends')
    .update({ status: 'queued', error: null, scheduled_for: new Date().toISOString() } as never)
    .in('id', ids);

  const startedAt = Date.now();
  const todo = [...ids];
  let sent = 0;
  let failedAgain = 0;
  let skipped_suppressed = 0;

  while (todo.length > 0 && Date.now() - startedAt < DEADLINE_MS - 8_000) {
    const batch = todo.splice(0, PARALLEL);
    const results = await Promise.allSettled(batch.map((id) => sendOne(id)));
    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value.status === 'sent') sent++;
        else if (r.value.status === 'skipped_suppressed') skipped_suppressed++;
        else failedAgain++;
      } else {
        failedAgain++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    total: ids.length,
    sent,
    failed: failedAgain,
    skipped_suppressed,
    remaining: todo.length,
  });
}
