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
  const senderName = process.env.RESEND_FROM_NAME ?? 'Giovanni Garcin';
  const foundedYear = process.env.COMPANY_FOUNDED_YEAR ?? '1988';
  const certifications =
    process.env.COMPANY_CERTIFICATIONS ?? 'ISO 9001:2015, IMMEX-registered';
  const facilities =
    process.env.COMPANY_FACILITIES ?? 'Tucson, AZ HQ + Imuris, Sonora production facility';
  const companyPitch =
    process.env.COMPANY_PITCH ??
    'USMCA-qualifying contract manufacturer — same-day truck to Phoenix, no Section 301 exposure';

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
    .replace('{{today_date}}', todayStr)
    .replace('{{sender_name}}', senderName)
    .replace('{{company_founded_year}}', foundedYear)
    .replace('{{company_certifications}}', certifications)
    .replace('{{company_facilities}}', facilities)
    .replace('{{company_pitch}}', companyPitch);

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

About Micromex (use these as credibility — at least one MUST appear in the
body, ideally the founding year + a certification):
  - Founded {{company_founded_year}}
  - Certifications: {{company_certifications}}
  - Facilities: {{company_facilities}}
  - {{company_pitch}}

THE TEMPLATE BELOW DEFINES THE ANGLE OF THIS EMAIL — you must preserve it.
The template's opening line, body focus, and proof point are the angle.
Rewrite for plain conversational English using this lead's specifics, but
do NOT substitute a different angle than the template uses.

Template (this is the angle — match it):
{{template.body_md}}

Lead context you may weave in (use only if it fits the template's angle —
do NOT graft on a different angle to use these facts):
  - Opening hook from research: {{research_intelligence_json.opening_hook}}

Rules:
  - Subject: max 6 words. Stay in the style of the template's subject.
    If the template subject is "{{company.name}} + harnesses out of Mexico?",
    your subject should be similar (capability-framed). If it's
    "tariff math for {{company.name}}", yours should be math-framed.
  - Opening line: MATCH the template's opening style. If the template opens
    with "We do X" (capability lead), open with "We" — do NOT pivot to
    "Noticed you import...". If the template opens with "Quick number" or
    "If you're importing" (tariff math), open with the number/math angle.
  - Body: stay within the template's angle. You may personalize with the
    lead's product line or origin country, but don't graft on a tariff
    angle if the template is capability-led, or vice versa.
  - Include AT LEAST ONE company credibility signal from the "About Micromex"
    block — the founding year + a certification are the strongest. Weave
    them naturally ("ISO 9001-certified shop running since 1988…", not a
    bulleted list of facts).
  - Add ONE specific proof point appropriate to the capability:
      electrical -> harness/cord-set track record
      refurb     -> "Terra Kaffe" reference customer
      packaging  -> hand-pack / retail-ready / kitting volume
      mechanical -> same-day truck to Phoenix / labor advantage
  - CTA: ask for a 20-minute call next week, propose two concrete time
    slots relative to today's date.
  - No emojis, no "I hope this finds you well", no "circling back".
  - DO NOT add any sign-off, name, or signature at the end. The body must
    end with the CTA (the meeting request). A signature block is appended
    downstream automatically — do not include one.
  - Max 110 words total in the body.

Output strict JSON only: { "subject": "...", "body_md": "..." }`;
