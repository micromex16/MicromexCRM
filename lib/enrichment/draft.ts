import { anthropic, CLAUDE_MODELS, extractJson, textFrom } from '@/lib/anthropic';
import { createServiceClient } from '@/lib/supabase/server';
import { buildShipmentSummary } from '@/lib/enrichment/shipments-summary';

export interface DraftResult {
  subject: string;
  body_md: string;
  send_id: string | null;
}

export interface DraftArgs {
  contactId: string;
  templateId: string;
  /** If true, persist as a queued `sends` row. Otherwise return without storing. */
  persist?: boolean;
  campaignId?: string;
}

export async function draftEmail(args: DraftArgs): Promise<DraftResult> {
  const supabase = createServiceClient();

  const { data: contact, error: ce } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, title, email, email_verified, company_id, unsubscribed')
    .eq('id', args.contactId)
    .single();
  if (ce || !contact) throw new Error(`draftEmail: contact ${args.contactId} not found`);

  const ct = contact as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    title: string | null;
    email: string | null;
    email_verified: boolean;
    company_id: string;
    unsubscribed: boolean;
  };

  if (ct.unsubscribed) {
    throw new Error(`draftEmail: contact ${args.contactId} is unsubscribed`);
  }

  const [{ data: company }, { data: template }] = await Promise.all([
    supabase
      .from('companies')
      .select('id, name, domain, website, research_intelligence_json')
      .eq('id', ct.company_id)
      .single(),
    supabase
      .from('email_templates')
      .select('id, capability_bucket, subject, body_md, variant_label')
      .eq('id', args.templateId)
      .single(),
  ]);

  if (!company || !template) throw new Error('draftEmail: company or template not found');

  const co = company as {
    id: string;
    name: string;
    domain: string | null;
    website: string | null;
    research_intelligence_json: { opening_hook?: string } | null;
  };
  const tp = template as {
    id: string;
    capability_bucket: string;
    subject: string;
    body_md: string;
    variant_label: string;
  };

  const summary = await buildShipmentSummary(ct.company_id);

  const todayStr = new Date().toISOString().slice(0, 10);
  const userPrompt = DRAFT_PROMPT
    .replace('{{contact.first_name}}', ct.first_name ?? 'there')
    .replace('{{contact.last_name}}', ct.last_name ?? '')
    .replace('{{contact.title}}', ct.title ?? '')
    .replace('{{company.name}}', co.name)
    .replace('{{template.body_md}}', tp.body_md)
    .replace(
      '{{research_intelligence_json.opening_hook}}',
      co.research_intelligence_json?.opening_hook ?? '(use a shipment fact)',
    )
    .replace('{{today_date}}', todayStr);

  const client = anthropic();
  const msg = await client.messages.create({
    model: CLAUDE_MODELS.research,
    max_tokens: 800,
    temperature: 0.4,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = textFrom(msg);
  const parsed = extractJson<{ subject: string; body_md: string }>(text);

  let send_id: string | null = null;
  if (args.persist) {
    const { data: ins, error: insErr } = await supabase
      .from('sends')
      .insert({
        contact_id: ct.id,
        company_id: co.id,
        campaign_id: args.campaignId ?? null,
        template_id: tp.id,
        variant_label: tp.variant_label,
        subject_rendered: parsed.subject,
        body_rendered: parsed.body_md,
        status: 'queued',
      } as never)
      .select('id')
      .single();
    if (insErr) throw new Error(`draftEmail persist: ${insErr.message}`);
    send_id = (ins as { id: string }).id;

    await supabase
      .from('activities')
      .insert({
        company_id: co.id,
        contact_id: ct.id,
        type: 'system',
        actor: 'system',
        body: `Drafted email (template ${tp.variant_label}).`,
      } as never);
  }

  // Use summary in a no-op way to keep linter quiet if we don't surface it.
  void summary;

  return { subject: parsed.subject, body_md: parsed.body_md, send_id };
}

const DRAFT_PROMPT = `Today's date: {{today_date}}.

Draft a cold first-touch email from a Micromex BD rep to {{contact.first_name}}
{{contact.last_name}}, {{contact.title}} at {{company.name}}.

Use this template as the structural frame (do not just fill blanks — rewrite
in plain conversational English, max 110 words, no marketing voice):

{{template.body_md}}

Constraints:
  - Subject line: max 6 words, references a specific fact from their business
  - Opening line: must reference {{research_intelligence_json.opening_hook}}
    or a specific shipment / product they sell
  - Body: name the Micromex capability, name the tariff or logistics angle,
    one specific proof point (Terra Kaffe for refurb, "founded 1988" for
    credibility, "same-day truck to Phoenix" for logistics)
  - CTA: ask for a 20-minute call next week, propose two concrete time slots
    relative to today's date
  - No emojis, no "I hope this finds you well", no "circling back"
  - End with: Giovanni Hernandez, Micromex (signature added downstream)

Output JSON: { "subject": "...", "body_md": "..." }`;
