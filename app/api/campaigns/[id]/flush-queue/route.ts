import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { sendOne } from '@/lib/outreach/send';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Send budget per call: Resend send is ~2-5s each, parallel up to 6.
const DEADLINE_MS = 50_000;
const PARALLEL = 6;

export async function POST(_request: NextRequest, ctx: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const adminDb = createServiceClient();
  const { data: queued } = await adminDb
    .from('sends')
    .select('id')
    .eq('campaign_id', ctx.params.id)
    .eq('status', 'queued')
    .order('scheduled_for', { ascending: true })
    .limit(200);

  const ids = (queued ?? []).map((r) => (r as { id: string }).id);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, total: 0, sent: 0, failed: 0, skipped_suppressed: 0, remaining: 0 });
  }

  const startedAt = Date.now();
  const todo = [...ids];
  let sent = 0;
  let failed = 0;
  let skipped_suppressed = 0;

  while (todo.length > 0 && Date.now() - startedAt < DEADLINE_MS - 8_000) {
    const batch = todo.splice(0, PARALLEL);
    const results = await Promise.allSettled(batch.map((id) => sendOne(id)));
    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value.status === 'sent') sent++;
        else if (r.value.status === 'skipped_suppressed') skipped_suppressed++;
        else failed++;
      } else {
        failed++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    total: ids.length,
    sent,
    failed,
    skipped_suppressed,
    remaining: todo.length,
  });
}
