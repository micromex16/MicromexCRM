import { NextResponse, type NextRequest } from 'next/server';
import { assertCron } from '@/lib/cron';
import { createServiceClient } from '@/lib/supabase/server';
import { withinDailyCap } from '@/lib/outreach/cap';
import { sendOne } from '@/lib/outreach/send';

export const runtime = 'nodejs';
export const maxDuration = 300;

const BATCH_SIZE = 10;
// Max number of retryable failures to revive per cron tick. We cap this
// so a huge backlog of yesterday's rate-limited fails doesn't blow through
// today's quota in one shot — they drain over a few days if needed.
const REVIVE_BATCH = 50;
// Stop retrying sends that have been failing for longer than this (probably
// a permanent issue we don't recognize as such).
const MAX_RETRY_AGE_DAYS = 14;

/** Pattern-match transient/retryable failure modes. */
function isRetryableError(error: string | null): boolean {
  if (!error) return false;
  const lower = error.toLowerCase();
  return (
    lower.includes('rate') ||
    lower.includes('429') ||
    lower.includes('daily') ||
    lower.includes('quota') ||
    lower.includes('limit') ||
    lower.includes('timeout') ||
    lower.includes('temporarily') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('504') ||
    lower.includes('too many')
  );
}

export async function GET(request: NextRequest) {
  const auth = assertCron(request);
  if (auth) return auth;

  const cap = await withinDailyCap();
  if (!cap.ok) {
    return NextResponse.json({ skipped: 'daily_cap', sent_today: cap.sent, cap: cap.cap });
  }

  const supabase = createServiceClient();
  const startOfTodayUtc = new Date();
  startOfTodayUtc.setUTCHours(0, 0, 0, 0);
  const maxAgeCutoff = new Date(Date.now() - MAX_RETRY_AGE_DAYS * 86400_000);

  // Step 1: revive retryable failed sends from PRIOR UTC days.
  // updated_at < start of today (UTC) means they last attempted on a
  // previous day. We pull a batch, filter to retryable errors in JS, and
  // reset them to queued so step 2 picks them up.
  const { data: failedCandidates } = await supabase
    .from('sends')
    .select('id, error')
    .eq('status', 'failed')
    .lt('updated_at', startOfTodayUtc.toISOString())
    .gt('created_at', maxAgeCutoff.toISOString())
    .order('updated_at', { ascending: true })
    .limit(REVIVE_BATCH);

  const revivableIds = ((failedCandidates ?? []) as { id: string; error: string | null }[])
    .filter((r) => isRetryableError(r.error))
    .map((r) => r.id);

  if (revivableIds.length > 0) {
    await supabase
      .from('sends')
      .update({
        status: 'queued',
        error: null,
        scheduled_for: new Date().toISOString(),
      } as never)
      .in('id', revivableIds);
  }

  // Step 2: process the queue (now including the revived fails) up to the
  // daily cap. Today's freshly-queued sends still take priority via the
  // scheduled_for order — revived ones have a fresh scheduled_for=now, so
  // they sort by which arrived first in the queue.
  const remaining = cap.cap - cap.sent;
  const limit = Math.min(BATCH_SIZE, remaining);

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
    revived_from_failed: revivableIds.length,
    sent,
    skipped_suppressed,
    failed,
    sent_today_after: cap.sent + sent,
    cap: cap.cap,
  });
}
