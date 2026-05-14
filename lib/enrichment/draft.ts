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
      .select('id, name, domain, website, industry_segment, research_summary, research_intelligence_json')
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
    industry_segment: string | null;
    research_summary: string | null;
    research_intelligence_json: {
      opening_hook?: string;
      current_vendor_guess?: string;
      switching_triggers?: string[];
      primary_capability_match?: string;
      buying_committee_titles?: string[];
    } | null;
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

  // Build a rich, lead-specific context block. The single biggest cause
  // of generic emails is that we only passed `opening_hook` before — Claude
  // had no idea what the company actually sold.
  const intel = co.research_intelligence_json ?? {};
  const switchingTriggers = intel.switching_triggers?.length
    ? intel.switching_triggers.map((t) => `   • ${t}`).join('\n')
    : '   • (none on file — infer from research summary)';

  const leadContext =
    `WHAT ${co.name.toUpperCase()} ACTUALLY DOES (this is the most important
section — every line of the email must speak to THIS company specifically,
not the template's example products):

Industry: ${co.industry_segment ?? '(unknown)'}
Domain: ${co.domain ?? '(unknown)'}
Top shipment signals (real customs data, if any):
  - Top HTS chapters: ${summary.top_hts.map((h) => h.code).join(', ') || '(none)'}
  - Top origin countries: ${summary.top_origin_countries.map((c) => c.country).join(', ') || '(none)'}
  - Sample product descriptions:
${summary.sample_products.length ? summary.sample_products.map((p) => '    - ' + p).join('\n') : '    - (none on file)'}

Research brief (Claude-generated earlier):
${co.research_summary ?? '(no research summary yet)'}

Strategic intel:
  - Primary capability fit: ${intel.primary_capability_match ?? '(unknown)'}
  - Current vendor guess: ${intel.current_vendor_guess ?? '(unknown)'}
  - Opening hook: ${intel.opening_hook ?? '(use a shipment fact)'}
  - Switching triggers:
${switchingTriggers}
  - Buying committee: ${intel.buying_committee_titles?.join(', ') ?? '(unknown)'}`;

  const userPrompt = DRAFT_PROMPT
    .replace('{{contact.first_name}}', ct.first_name ?? 'there')
    .replace('{{contact.last_name}}', ct.last_name ?? '')
    .replace('{{contact.title}}', ct.title ?? '')
    .replace('{{company.name}}', co.name)
    .replace('{{template.body_md}}', tp.body_md)
    .replace('{{lead_context}}', leadContext)
    .replace('{{today_date}}', todayStr)
    .replace('{{sender_name}}', senderName)
    .replace('{{company_founded_year}}', foundedYear)
    .replace('{{company_certifications}}', certifications)
    .replace('{{company_facilities}}', facilities)
    .replace('{{company_pitch}}', companyPitch);

  const client = anthropic();
  const msg = await client.messages.create({
    model: CLAUDE_MODELS.research,
    max_tokens: 1000,
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

==============================================================================
ABOUT MICROMEX (use these as credibility — at least one MUST appear in the
body, ideally founding year + a certification):
  - Founded {{company_founded_year}}
  - Certifications: {{company_certifications}}
  - Facilities: {{company_facilities}}
  - {{company_pitch}}

==============================================================================
{{lead_context}}

==============================================================================
TEMPLATE — THIS IS THE ANGLE, NOT THE CONTENT.

The template defines HOW the email is framed (capability-led vs tariff-math-
led vs refurb-recovery-led etc.). DO preserve its angle, structure, tone,
and CTA style.

BUT — and this is critical — the template uses GENERIC EXAMPLE PRODUCTS
("elevator parts, door sheaves, hardware kits" / "toys, temp tattoos") as
placeholders. THESE ARE NOT THE CONTENT OF YOUR EMAIL. Replace those
example products with what {{company.name}} ACTUALLY MAKES, based on the
lead context above. If the template says "hardware kits" but this company
makes weighted blankets, your email must talk about weighted blankets, not
hardware. If the template says "toys" but this lead does premium pet
accessories, talk about pet accessories.

Template:
{{template.body_md}}

==============================================================================
RULES:
  - PERSONALIZATION IS THE #1 PRIORITY. The email must read like it was
    written for {{company.name}} specifically. Every product noun should be
    THEIR product line, not the template's. If you can't tell what they
    make from the lead context, say "your team" or "your product line" —
    don't invent products.
  - Body should specifically reference: their actual product category, and
    at least one signal from their shipment data / research brief (current
    vendor guess, switching trigger, or industry-specific pain point).
  - Subject: max 6 words, in the style of the template's subject. Replace
    the template's example product noun with their actual product noun.
  - Opening line: match the template's opening STYLE (capability-led vs
    tariff-math-led vs recovery-math-led), but the words/products must be
    about THIS company.
  - Include AT LEAST ONE company credibility signal from "ABOUT MICROMEX" —
    weave it naturally ("ISO 9001-certified shop running since 1988…"),
    not as a bulleted list.
  - Include ONE specific Micromex proof point appropriate to the capability:
      electrical -> harness/cord-set track record
      refurb     -> "Terra Kaffe" reference customer (premium home espresso)
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
