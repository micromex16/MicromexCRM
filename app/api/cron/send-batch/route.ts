import { NextResponse, type NextRequest } from 'next/server';
import { assertCron } from '@/lib/cron';
import { createServiceClient } from '@/lib/supabase/server';
import { withinDailyCap } from '@/lib/outreach/cap';
import { sendOne } from '@/lib/outreach/send';

export const runtime = 'nodejs';
export const maxDuration = 300;

const BATCH_SIZE = 10;

export async function GET(request: NextRequest) {
  const auth = assertCron(request);
  if (auth) return auth;

  const cap = await withinDailyCap();
  if (!cap.ok) {
    return NextResponse.json({ skipped: 'daily_cap', sent_today: cap.sent, cap: cap.cap });
  }

  const remaining = cap.cap - cap.sent;
  const limit = Math.min(BATCH_SIZE, remaining);

  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const { data: queued, error } = await supabase
    .from('sends')
    .select('id')
    .eq('status', 'queued')
    .lte('scheduled_for', now)
    .order('scheduled_for', { ascending: true })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (queued ?? []) as { id: string }[];
  let sent = 0;
  let skipped_suppressed = 0;
  let failed = 0;

  for (const row of rows) {
    const outcome = await sendOne(row.id);
    if (outcome.status === 'sent') sent++;
    else if (outcome.status === 'skipped_suppressed') skipped_suppressed++;
    else failed++;
  }

  return NextResponse.json({
    processed: rows.length,
    sent,
    skipped_suppressed,
    failed,
    sent_today_after: cap.sent + sent,
    cap: cap.cap,
  });
}
