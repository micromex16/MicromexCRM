import { createServiceClient } from '@/lib/supabase/server';
import { renderTemplate } from '@/lib/outreach/render';
import { buildShipmentSummary } from '@/lib/enrichment/shipments-summary';
import type { CapabilityBucket } from '@/lib/types/domain';

export interface FollowupRunResult {
  candidates_found: number;
  followups_queued: number;
  skipped_unsubscribed: number;
  skipped_no_template: number;
  errors: string[];
}

/**
 * Find sends that hit the follow-up criteria and queue follow-up sends.
 *
 * Criteria for a parent send to get a follow-up:
 *   - sent_at older than FOLLOWUP_DELAY_DAYS (default 2) — the first
 *     email has had time to land + be read
 *   - status in (sent, opened, clicked) — actually delivered
 *   - replied_at IS NULL — they haven't engaged
 *   - bounced_at IS NULL — wasn't rejected
 *   - status NOT IN (unsubscribed, bounced, failed) — not a dead address
 *   - is_followup = false — only follow up on first-touches
 *   - followup_sent_at IS NULL — no follow-up already queued
 *   - contact.unsubscribed = false — we don't keep emailing opt-outs
 *   - parent send has a template_id whose capability_bucket has a
 *     matching follow-up template ({capability}_followup)
 */
export async function queueFollowups(limit = 50): Promise<FollowupRunResult> {
  const supabase = createServiceClient();
  const delayDaysRaw = process.env.FOLLOWUP_DELAY_DAYS;
  const delayDays = delayDaysRaw ? Math.max(1, parseInt(delayDaysRaw, 10) || 2) : 2;
  const cutoff = new Date(Date.now() - delayDays * 86400_000);

  const { data: candidatesRaw, error } = await supabase
    .from('sends')
    .select(
      `id, contact_id, company_id, campaign_id, template_id, subject_rendered,
       sent_at,
       contacts!inner(id, first_name, last_name, title, email, unsubscribed, company_id),
       companies!inner(id, name, domain),
       email_templates(id, capability_bucket)`,
    )
    .lt('sent_at', cutoff.toISOString())
    .is('replied_at', null)
    .is('bounced_at', null)
    .is('followup_sent_at', null)
    .eq('is_followup', false)
    .in('status', ['sent', 'opened', 'clicked'])
    .limit(limit);
  if (error) {
    throw new Error(`followups: select candidates: ${error.message}`);
  }

  type Candidate = {
    id: string;
    contact_id: string;
    company_id: string;
    campaign_id: string | null;
    template_id: string | null;
    subject_rendered: string;
    sent_at: string;
    contacts: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      title: string | null;
      email: string | null;
      unsubscribed: boolean;
      company_id: string;
    };
    companies: { id: string; name: string; domain: string | null };
    email_templates: { id: string; capability_bucket: CapabilityBucket } | null;
  };
  const candidates = (candidatesRaw ?? []) as unknown as Candidate[];

  // Pre-load all follow-up templates indexed by capability
  const { data: fuTemplates } = await supabase
    .from('email_templates')
    .select('id, capability_bucket, subject, body_md')
    .eq('variant_label', 'FU')
    .eq('is_active', true);
  type FUTemplate = {
    id: string;
    capability_bucket: CapabilityBucket;
    subject: string;
    body_md: string;
  };
  const templateByCapability = new Map<CapabilityBucket, FUTemplate>();
  for (const t of (fuTemplates ?? []) as FUTemplate[]) {
    templateByCapability.set(t.capability_bucket, t);
  }

  const result: FollowupRunResult = {
    candidates_found: candidates.length,
    followups_queued: 0,
    skipped_unsubscribed: 0,
    skipped_no_template: 0,
    errors: [],
  };

  for (const parent of candidates) {
    // Skip unsubscribed contacts
    if (parent.contacts.unsubscribed) {
      result.skipped_unsubscribed++;
      // mark followup_sent_at so we don't re-evaluate next run
      await supabase
        .from('sends')
        .update({ followup_sent_at: new Date().toISOString() } as never)
        .eq('id', parent.id);
      continue;
    }

    const cap = parent.email_templates?.capability_bucket;
    if (!cap) {
      result.skipped_no_template++;
      continue;
    }
    const fu = templateByCapability.get(cap);
    if (!fu) {
      result.skipped_no_template++;
      result.errors.push(`No follow-up template for capability ${cap}`);
      continue;
    }

    // Build shipment summary for merge-tag substitution (e.g. top_origin_country)
    let topHts: string | null = null;
    let topCountry: string | null = null;
    try {
      const summary = await buildShipmentSummary(parent.company_id);
      topHts = summary.top_hts[0]?.code ?? null;
      topCountry = summary.top_origin_countries[0]?.country ?? null;
    } catch {
      /* ignore */
    }

    // Render the follow-up body (signature + footer will be added at send time)
    let rendered;
    try {
      rendered = renderTemplate({
        subject: fu.subject,
        body: fu.body_md,
        contact: {
          id: parent.contacts.id,
          first_name: parent.contacts.first_name,
          last_name: parent.contacts.last_name,
          title: parent.contacts.title,
          email: parent.contacts.email,
        },
        company: {
          id: parent.companies.id,
          name: parent.companies.name,
          domain: parent.companies.domain,
        },
        shipments_summary: { top_hts_description: topHts, top_origin_country: topCountry },
      });
    } catch (e) {
      result.errors.push(`render ${parent.id}: ${e instanceof Error ? e.message : e}`);
      continue;
    }

    // Insert the follow-up as a new send row, linked back to the parent.
    const { data: ins, error: insErr } = await supabase
      .from('sends')
      .insert({
        contact_id: parent.contact_id,
        company_id: parent.company_id,
        campaign_id: parent.campaign_id,
        template_id: fu.id,
        variant_label: 'FU',
        parent_send_id: parent.id,
        is_followup: true,
        subject_rendered: rendered.subject,
        body_rendered: rendered.body_text,
        status: 'queued',
        scheduled_for: new Date().toISOString(),
      } as never)
      .select('id')
      .single();
    if (insErr || !ins) {
      result.errors.push(`insert ${parent.id}: ${insErr?.message ?? 'unknown'}`);
      continue;
    }

    // Mark the parent so we don't queue a second follow-up
    await supabase
      .from('sends')
      .update({ followup_sent_at: new Date().toISOString() } as never)
      .eq('id', parent.id);

    // Log activity on the lead
    await supabase.from('activities').insert({
      company_id: parent.company_id,
      contact_id: parent.contact_id,
      type: 'system',
      actor: 'followup_agent',
      body: `Follow-up queued (no response to "${parent.subject_rendered}" after 2 days).`,
      metadata_json: { parent_send_id: parent.id, followup_send_id: (ins as { id: string }).id } as never,
    } as never);

    result.followups_queued++;
  }

  return result;
}
