import { NextResponse, type NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/server';
import { enqueue } from '@/lib/jobs';
import { suppress } from '@/lib/outreach/suppression';

export const runtime = 'nodejs';

interface ResendWebhookEvent {
  type: string;
  created_at?: string;
  data: {
    email_id?: string;
    message_id?: string;
    to?: string | string[];
    from?: string;
    subject?: string;
    text?: string;
    html?: string;
    reply_text?: string;
    reply_html?: string;
    bounce?: { type?: string; message?: string };
    'X-Entity-Ref-ID'?: string;
    [k: string]: unknown;
  };
}

function verifySignature(body: string, signature: string | null): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // In dev with no secret configured, accept (logged).
    console.warn('RESEND_WEBHOOK_SECRET not set — webhook signature unchecked');
    return true;
  }
  if (!signature) return false;

  // Resend uses Svix-style signatures: `v1,<base64>` (possibly multiple, space-separated).
  // We verify HMAC-SHA256 over the raw body with the secret.
  const expected = createHmac('sha256', secret).update(body).digest('base64');
  const parts = signature.split(' ');
  for (const part of parts) {
    const [, sig] = part.split(',');
    if (sig && sig.length === expected.length) {
      try {
        if (timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return true;
      } catch {
        /* length mismatch */
      }
    }
  }
  return false;
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const signature =
    request.headers.get('svix-signature') ?? request.headers.get('resend-signature');

  if (!verifySignature(raw, signature)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(raw) as ResendWebhookEvent;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const messageId = event.data.email_id ?? event.data.message_id;
  const refId = event.data['X-Entity-Ref-ID'] as string | undefined;

  // Find the matching send row.
  type SendRow = { id: string; company_id: string; contact_id: string };
  let send: SendRow | null = null;
  if (refId) {
    const { data } = await supabase
      .from('sends')
      .select('id, company_id, contact_id')
      .eq('id', refId)
      .maybeSingle();
    send = (data as SendRow | null) ?? null;
  }
  if (!send && messageId) {
    const { data } = await supabase
      .from('sends')
      .select('id, company_id, contact_id')
      .eq('resend_message_id', messageId)
      .maybeSingle();
    send = (data as SendRow | null) ?? null;
  }

  if (!send) {
    // Webhook for a send we don't know about — record and ignore.
    return NextResponse.json({ ok: true, note: 'no_matching_send' });
  }

  const nowIso = new Date().toISOString();

  switch (event.type) {
    case 'email.sent':
    case 'email.delivered': {
      // No-op: send.ts already set sent_at.
      break;
    }
    case 'email.opened': {
      await supabase
        .from('sends')
        .update({ opened_at: nowIso, status: 'opened' } as never)
        .eq('id', send.id);
      break;
    }
    case 'email.clicked': {
      await supabase
        .from('sends')
        .update({ clicked_at: nowIso } as never)
        .eq('id', send.id);
      break;
    }
    case 'email.bounced': {
      const bounceMsg = event.data.bounce?.message ?? 'bounced';
      await supabase
        .from('sends')
        .update({ bounced_at: nowIso, status: 'bounced', error: bounceMsg } as never)
        .eq('id', send.id);
      // Hard bounces → suppress
      if (event.data.bounce?.type?.toLowerCase().includes('permanent')) {
        const { data: c } = await supabase
          .from('contacts')
          .select('email')
          .eq('id', send.contact_id)
          .single();
        const email = (c as { email: string | null } | null)?.email;
        if (email) await suppress({ email, reason: 'hard_bounce' });
      }
      break;
    }
    case 'email.complained': {
      const { data: c } = await supabase
        .from('contacts')
        .select('email')
        .eq('id', send.contact_id)
        .single();
      const email = (c as { email: string | null } | null)?.email;
      if (email) await suppress({ email, reason: 'spam_complaint' });
      await supabase
        .from('sends')
        .update({ status: 'unsubscribed', unsubscribed_at: nowIso } as never)
        .eq('id', send.id);
      break;
    }
    case 'email.replied': {
      const replyBody = (event.data.reply_text ?? event.data.text ?? '') as string;
      await supabase
        .from('sends')
        .update({
          replied_at: nowIso,
          status: 'replied',
          reply_body: replyBody,
        } as never)
        .eq('id', send.id);

      await supabase
        .from('companies')
        .update({ status: 'replied', last_activity_at: nowIso } as never)
        .eq('id', send.company_id);

      await supabase
        .from('activities')
        .insert({
          company_id: send.company_id,
          contact_id: send.contact_id,
          type: 'email_replied',
          actor: 'contact',
          body: replyBody.slice(0, 500),
          metadata_json: { send_id: send.id } as never,
        } as never);

      try {
        await enqueue({
          targetType: 'company',
          targetId: send.id,
          jobType: 'classify_reply',
          priority: 9,
        });
      } catch {
        /* ignore */
      }
      break;
    }
    default:
      // Unknown event types: log and ignore.
      console.log(`Unhandled Resend event: ${event.type}`);
  }

  return NextResponse.json({ ok: true });
}
