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
  /**
   * Optional: refine an existing draft instead of starting fresh.
   * When set with currentSubject + currentBody, Claude edits the existing
   * draft per the tweak instruction instead of regenerating from template.
   */
  tweakInstruction?: string;
  currentSubject?: string;
  currentBody?: string;
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

  // Choose draft vs refine mode based on whether the caller passed a current
  // draft to edit.
  const isRefine = Boolean(
    args.tweakInstruction && args.currentBody && args.currentSubject,
  );
  const promptTemplate = isRefine ? REFINE_PROMPT : DRAFT_PROMPT;
  const tweakBlock = args.tweakInstruction
    ? `==============================================================================
ADDITIONAL INSTRUCTIONS FROM ${senderName.toUpperCase()} FOR THIS DRAFT
(these override anything above):

${args.tweakInstruction}`
    : '';

  const userPrompt = promptTemplate
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
    .replace('{{company_pitch}}', companyPitch)
    .replace('{{tweak_block}}', tweakBlock)
    .replace('{{current_subject}}', args.currentSubject ?? '')
    .replace('{{current_body}}', args.currentBody ?? '')
    .replace('{{tweak_instruction}}', args.tweakInstruction ?? '');

  const client = anthropic();
  const msg = await client.messages.create({
    model: CLAUDE_MODELS.research,
    max_tokens: 1200,
    temperature: 0.5,
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

You are writing as {{sender_name}} — the OWNER/PRESIDENT of Micromex. This is
not a templated outbound from a sales rep. It's a personal note from the
owner of a manufacturing company to a peer who he thinks might be a good
fit. Voice should be HIS — first-person, conversational, low-key, NOT
salesy.

Recipient: {{contact.first_name}} {{contact.last_name}}, {{contact.title}}
at {{company.name}}.

==============================================================================
ABOUT MICROMEX (weave at least one naturally — founding year + a cert are
the strongest credibility signals; the "owner reaching out" angle is the
second strongest):
  - Founded {{company_founded_year}}
  - Certifications: {{company_certifications}}
  - Facilities: {{company_facilities}}
  - {{company_pitch}}
  - {{sender_name}} is the owner — somewhere in the email, signal that
    you can move quickly on quotes / capacity / scheduling because you're
    the decision-maker, not a junior rep routing internally.

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

Template (for ANGLE reference only):
{{template.body_md}}

==============================================================================
TONE — this is the most important section. The email must feel HUMAN, not
templated:

  - First person ("I", "I've", "I run", "I'm reaching out") — not "we".
    {{sender_name}} is writing this himself.
  - Frame the outreach as a FIT OPPORTUNITY, not a sales pitch. Something
    like "I came across {{company.name}} and what you're doing in <their
    product area> looks like a good fit for what we do." Not "We can help
    you save money on tariffs."
  - Tariffs are a downside they may or may not feel — DO NOT lead with
    tariff numbers or scare tactics. Reference tariffs / Section 301 only
    if the template explicitly leads with that angle. Otherwise mention
    USMCA / lead-time / capacity as the positive frame.
  - Mention {{sender_name}} is the owner. One short line is enough:
    "I'm the owner here — happy to put a quote together quickly if it
    looks like a fit." Or similar in his voice.
  - Conversational, like one founder emailing another. Slightly informal.
    Contractions OK ("we're", "I've", "doesn't"). Avoid corporate-speak
    ("synergies", "leverage", "value-add"). Avoid "circling back",
    "touching base", "I hope this finds you well".
  - It should read like {{sender_name}} thought about this lead for 2-3
    minutes and dashed off a quick note, not like a marketing sequence.

==============================================================================
RULES (concrete):
  - PERSONALIZATION IS REQUIRED. The email must reference {{company.name}}'s
    ACTUAL product category — not the template's example products. If you
    don't know what they make from the lead context, fall back to "your
    product line" or "your team" — don't invent products.
  - One specific Micromex proof point appropriate to the capability bucket:
      electrical -> harness / cord-set / wound magnetics track record
      refurb     -> "Terra Kaffe" reference customer (premium home espresso)
      packaging  -> hand-pack / retail-ready / kitting volume
      mechanical -> same-day truck to Phoenix / labor advantage
  - Subject: max 7 words. Conversational. Lowercase if it feels natural.
    Examples in good voice:
      "fit on <their product> sub-assembly?"
      "quick note from one owner to another"
      "<company name> + USMCA — worth a quick chat?"
  - Opening line: NEVER "I hope this finds you well." Start with the fit
    observation: "I came across {{company.name}}…" / "Saw {{company.name}}'s
    work on <product>…" / "Quick note — your team's making <product> and
    I think we'd be a strong fit on the manufacturing side."
  - CTA: 20-minute call next week. Two concrete time slots relative to
    today. Keep it light: "Tuesday afternoon or Thursday morning?" not
    "Please schedule a 30-minute discovery session."
  - DO NOT add any sign-off, name, or signature at the end. The body must
    end with the CTA. A signature block is appended downstream.
  - 90-130 words. Brevity matters more than completeness.

{{tweak_block}}

Output strict JSON only: { "subject": "...", "body_md": "..." }`;

const REFINE_PROMPT = `Today's date: {{today_date}}.

You are {{sender_name}}, owner of Micromex. You already have a draft email
to {{contact.first_name}} {{contact.last_name}} at {{company.name}}. Apply
the requested change and return the revised email.

==============================================================================
CONTEXT ABOUT THE LEAD (do not lose specifics from the current draft —
this is here so you can keep personalizations correct if you rewrite):
{{lead_context}}

==============================================================================
CURRENT DRAFT
Subject: {{current_subject}}

{{current_body}}

==============================================================================
THE CHANGE TO APPLY:
{{tweak_instruction}}

==============================================================================
RULES (still apply):
  - First-person owner voice. Conversational, not salesy.
  - DO NOT add a sign-off or signature at the end — a block is appended
    downstream.
  - 90-130 words unless the tweak asks otherwise.
  - No emojis, no "I hope this finds you well", no "circling back".
  - Preserve the personalization (company name, product references) from
    the current draft unless the tweak explicitly says to change them.

Output strict JSON only: { "subject": "...", "body_md": "..." }`;
