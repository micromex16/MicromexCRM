import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { sendOne } from '@/lib/outreach/send';

export const runtime = 'nodejs';
export const maxDuration = 60;

const Body = z
  .object({
    contact_ids: z.array(z.string().uuid()).min(1).max(50).optional(),
    contact_id: z.string().uuid().optional(),
    template_id: z.string().uuid().optional(),
    subject: z.string().min(1).max(200),
    body_md: z.string().min(1).max(5000),
  })
  .refine((d) => d.contact_ids || d.contact_id, {
    message: 'contact_ids or contact_id required',
  });

interface PerResult {
  contact_id: string;
  email: string | null;
  status: 'sent' | 'skipped_suppressed' | 'failed' | 'no_email' | 'unsubscribed';
  send_id?: string;
  resend_message_id?: string;
  error?: string;
}

export async function POST(request: NextRequest) {
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

  const ids = parsed.data.contact_ids ?? (parsed.data.contact_id ? [parsed.data.contact_id] : []);
  const adminDb = createServiceClient();

  // Pull all contacts at once
  const { data: contactsData, error: ce } = await supabase
    .from('contacts')
    .select('id, company_id, email, unsubscribed, first_name')
    .in('id', ids);
  if (ce) return NextResponse.json({ error: ce.message }, { status: 500 });

  type ContactRow = {
    id: string;
    company_id: string;
    email: string | null;
    unsubscribed: boolean;
    first_name: string | null;
  };
  const contacts = (contactsData ?? []) as ContactRow[];

  const results: PerResult[] = [];

  for (const c of contacts) {
    const r: PerResult = { contact_id: c.id, email: c.email, status: 'failed' };

    if (!c.email) {
      r.status = 'no_email';
      r.error = 'contact has no email';
      results.push(r);
      continue;
    }
    if (c.unsubscribed) {
      r.status = 'unsubscribed';
      r.error = 'contact unsubscribed';
      results.push(r);
      continue;
    }

    // Build per-contact body: substitute {{contact.first_name}} placeholder
    // so the same template works for multiple recipients.
    const personalizedBody = personalize(parsed.data.body_md, c.first_name);
    const personalizedSubject = personalize(parsed.data.subject, c.first_name);

    const { data: ins, error: insErr } = await adminDb
      .from('sends')
      .insert({
        contact_id: c.id,
        company_id: c.company_id,
        template_id: parsed.data.template_id ?? null,
        subject_rendered: personalizedSubject,
        body_rendered: personalizedBody,
        status: 'queued',
        scheduled_for: new Date().toISOString(),
      } as never)
      .select('id')
      .single();
    if (insErr) {
      r.error = `insert: ${insErr.message}`;
      results.push(r);
      continue;
    }
    const sendId = (ins as { id: string }).id;
    r.send_id = sendId;

    try {
      const outcome = await sendOne(sendId);
      r.status = outcome.status === 'sent' ? 'sent' : outcome.status === 'skipped_suppressed' ? 'skipped_suppressed' : 'failed';
      r.resend_message_id = outcome.resend_message_id;
      r.error = outcome.error;
    } catch (e) {
      r.error = e instanceof Error ? e.message : String(e);
    }

    results.push(r);
  }

  const sent = results.filter((r) => r.status === 'sent').length;
  const failed = results.filter((r) => r.status === 'failed' || r.status === 'no_email').length;
  const skipped_suppressed = results.filter(
    (r) => r.status === 'skipped_suppressed' || r.status === 'unsubscribed',
  ).length;

  return NextResponse.json({
    ok: sent > 0,
    total: results.length,
    sent,
    failed,
    skipped_suppressed,
    results,
    errors: results.filter((r) => r.error).map((r) => `${r.email}: ${r.error}`),
  });
}

function personalize(text: string, firstName: string | null): string {
  const name = firstName ?? 'there';
  return text.replace(/\{\{\s*contact\.first_name\s*\}\}/gi, name);
}
