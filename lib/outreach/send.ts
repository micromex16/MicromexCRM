import { resend, defaultFrom } from '@/lib/resend';
import { createServiceClient } from '@/lib/supabase/server';
import { renderTemplate } from '@/lib/outreach/render';
import { isSuppressed } from '@/lib/outreach/suppression';
import { env } from '@/lib/env';
import { buildShipmentSummary } from '@/lib/enrichment/shipments-summary';

export interface SendOutcome {
  send_id: string;
  status: 'sent' | 'skipped_suppressed' | 'failed';
  resend_message_id?: string;
  error?: string;
}

/**
 * Send a single queued `sends` row through Resend.
 * Re-renders the body in case merge tags weren't fully resolved at draft time.
 */
export async function sendOne(sendId: string): Promise<SendOutcome> {
  const supabase = createServiceClient();
  const { data: row, error } = await supabase
    .from('sends')
    .select(
      'id, contact_id, company_id, subject_rendered, body_rendered, status, contacts!inner(id, first_name, last_name, title, email), companies!inner(id, name, domain)',
    )
    .eq('id', sendId)
    .single();
  if (error || !row) throw new Error(`sendOne: ${sendId} not found`);

  type Row = {
    id: string;
    contact_id: string;
    company_id: string;
    subject_rendered: string;
    body_rendered: string;
    status: string;
    contacts: { id: string; first_name: string | null; last_name: string | null; title: string | null; email: string | null };
    companies: { id: string; name: string; domain: string | null };
  };
  const r = row as unknown as Row;

  if (r.status !== 'queued') {
    return { send_id: sendId, status: 'failed', error: `status ${r.status} not queued` };
  }
  if (!r.contacts.email) {
    await supabase
      .from('sends')
      .update({ status: 'failed', error: 'no email' } as never)
      .eq('id', sendId);
    return { send_id: sendId, status: 'failed', error: 'no email' };
  }

  if (await isSuppressed(r.contacts.email)) {
    await supabase
      .from('sends')
      .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() } as never)
      .eq('id', sendId);
    return { send_id: sendId, status: 'skipped_suppressed' };
  }

  // Build top-line shipment context for re-rendering merge tags in the body.
  let topHts: string | null = null;
  let topCountry: string | null = null;
  try {
    const summary = await buildShipmentSummary(r.company_id);
    topHts = summary.top_hts[0]?.code ?? null;
    topCountry = summary.top_origin_countries[0]?.country ?? null;
  } catch {
    /* ignore */
  }

  const rendered = renderTemplate({
    subject: r.subject_rendered,
    body: r.body_rendered,
    contact: { ...r.contacts },
    company: { ...r.companies },
    shipments_summary: { top_hts_description: topHts, top_origin_country: topCountry },
    sendId: r.id,
  });

  const e = env();
  if (!e.RESEND_API_KEY) {
    await supabase
      .from('sends')
      .update({ status: 'failed', error: 'RESEND_API_KEY not set' } as never)
      .eq('id', sendId);
    return { send_id: sendId, status: 'failed', error: 'RESEND_API_KEY not set' };
  }

  try {
    const res = await resend().emails.send({
      from: defaultFrom(),
      to: r.contacts.email,
      replyTo: e.RESEND_REPLY_TO,
      subject: rendered.subject,
      text: rendered.body_text,
      html: rendered.body_html,
      headers: {
        'X-Entity-Ref-ID': sendId,
      },
    });

    if (res.error) {
      await supabase
        .from('sends')
        .update({ status: 'failed', error: res.error.message } as never)
        .eq('id', sendId);
      return { send_id: sendId, status: 'failed', error: res.error.message };
    }

    const messageId = res.data?.id ?? null;
    await supabase
      .from('sends')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        resend_message_id: messageId,
        subject_rendered: rendered.subject,
        body_rendered: rendered.body_text,
      } as never)
      .eq('id', sendId);

    await supabase
      .from('activities')
      .insert({
        company_id: r.company_id,
        contact_id: r.contact_id,
        type: 'email_sent',
        actor: 'system',
        body: `Sent: ${rendered.subject}`,
        metadata_json: { send_id: sendId, resend_message_id: messageId } as never,
      } as never);

    await supabase
      .from('companies')
      .update({ status: 'contacted', last_activity_at: new Date().toISOString() } as never)
      .eq('id', r.company_id)
      .eq('status', 'qualified');

    return {
      send_id: sendId,
      status: 'sent',
      resend_message_id: messageId ?? undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase
      .from('sends')
      .update({ status: 'failed', error: msg } as never)
      .eq('id', sendId);
    return { send_id: sendId, status: 'failed', error: msg };
  }
}
