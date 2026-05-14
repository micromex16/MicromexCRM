import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { sendOne } from '@/lib/outreach/send';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Retry a failed send. Resets status to 'queued' + clears error/timestamps,
 * then runs sendOne() inline. Useful for the Resend free-tier 100/day cap
 * scenario — the same draft just gets re-sent on a fresh day.
 */
export async function POST(_request: NextRequest, ctx: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const adminDb = createServiceClient();

  // Reset the send so sendOne() will pick it up
  const { error: updErr } = await adminDb
    .from('sends')
    .update({
      status: 'queued',
      error: null,
      scheduled_for: new Date().toISOString(),
    } as never)
    .eq('id', ctx.params.id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  try {
    const outcome = await sendOne(ctx.params.id);
    return NextResponse.json({
      ok: outcome.status === 'sent',
      status: outcome.status,
      resend_message_id: outcome.resend_message_id,
      error: outcome.error,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
