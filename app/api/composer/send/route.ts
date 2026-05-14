import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { sendOne } from '@/lib/outreach/send';

export const runtime = 'nodejs';
export const maxDuration = 60;

const Body = z.object({
  contact_id: z.string().uuid(),
  template_id: z.string().uuid().optional(),
  subject: z.string().min(1).max(200),
  body_md: z.string().min(1).max(5000),
});

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const json = await request.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  // Need the company_id for the send row.
  const { data: contact, error: ce } = await supabase
    .from('contacts')
    .select('id, company_id, email, unsubscribed')
    .eq('id', parsed.data.contact_id)
    .single();
  if (ce || !contact)
    return NextResponse.json({ error: 'contact_not_found' }, { status: 404 });

  const c = contact as { id: string; company_id: string; email: string | null; unsubscribed: boolean };
  if (c.unsubscribed) return NextResponse.json({ error: 'contact_unsubscribed' }, { status: 400 });
  if (!c.email) return NextResponse.json({ error: 'contact_no_email' }, { status: 400 });

  // 1. Insert the send row as queued.
  const { data: ins, error: insErr } = await supabase
    .from('sends')
    .insert({
      contact_id: c.id,
      company_id: c.company_id,
      template_id: parsed.data.template_id ?? null,
      subject_rendered: parsed.data.subject,
      body_rendered: parsed.data.body_md,
      status: 'queued',
      scheduled_for: new Date().toISOString(),
    } as never)
    .select('id')
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const sendId = (ins as { id: string }).id;

  // 2. Send it synchronously now — don't wait for the daily cron.
  try {
    const outcome = await sendOne(sendId);
    return NextResponse.json({
      ok: outcome.status === 'sent',
      send_id: sendId,
      status: outcome.status,
      resend_message_id: outcome.resend_message_id,
      error: outcome.error,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        send_id: sendId,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
