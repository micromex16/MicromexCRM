import { anthropic, CLAUDE_MODELS, extractJson, textFrom } from '@/lib/anthropic';
import { createServiceClient } from '@/lib/supabase/server';
import { buildShipmentSummary } from '@/lib/enrichment/shipments-summary';
import type { CapabilityBucket, ResearchIntelligence } from '@/lib/types/domain';

export async function runResearch(companyId: string) {
  const supabase = createServiceClient();
  const { data: company, error } = await supabase
    .from('companies')
    .select('id, name, domain, website, industry_segment, status')
    .eq('id', companyId)
    .single();
  if (error || !company) throw new Error(`runResearch: company ${companyId} not found`);

  const c = company as {
    id: string;
    name: string;
    domain: string | null;
    website: string | null;
    industry_segment: string | null;
    status: string;
  };

  const summary = await buildShipmentSummary(companyId);

  const userPrompt = RESEARCH_PROMPT
    .replace('{{company.name}}', c.name)
    .replace('{{company.website}}', c.website ?? c.domain ?? '(unknown)')
    .replace('{{company.industry_segment}}', c.industry_segment ?? '(unknown)')
    .replace('{{shipments_summary}}', summary.markdown);

  const client = anthropic();
  const msg = await client.messages.create({
    model: CLAUDE_MODELS.research,
    max_tokens: 1500,
    temperature: 0.3,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = textFrom(msg);
  // Expect two sections. Find the JSON block; everything before it is research_summary.
  const jsonStart = findJsonStart(text);
  const summaryMd = jsonStart > 0
    ? text.slice(0, jsonStart).replace(/^PART 1[^\n]*\n+/i, '').replace(/PART 2.*$/is, '').trim()
    : text.trim();

  let intelligence: ResearchIntelligence;
  try {
    intelligence = extractJson<ResearchIntelligence>(text);
  } catch (e) {
    throw new Error(`research JSON parse failed: ${e instanceof Error ? e.message : e}`);
  }

  // Derive capability_match (primary + secondaries, deduped).
  const caps: CapabilityBucket[] = Array.from(
    new Set([
      intelligence.primary_capability_match,
      ...(intelligence.secondary_capability_matches ?? []),
    ]),
  ).filter(Boolean);

  await supabase
    .from('companies')
    .update({
      research_summary: summaryMd,
      research_intelligence_json: intelligence as never,
      capability_match: caps as never,
      tariff_exposure_score: clamp(intelligence.tariff_exposure_pct_estimate, 0, 100),
      status: c.status === 'new' ? 'researching' : c.status,
    } as never)
    .eq('id', companyId);

  await supabase.from('activities').insert({
    company_id: companyId,
    type: 'research_update',
    actor: 'system',
    body: `Research brief generated (${caps.join(', ') || 'no capability match'}).`,
    metadata_json: { intelligence } as never,
  } as never);

  return { summaryMd, intelligence };
}

function findJsonStart(text: string): number {
  // Walk back from the last '}' to find the matching opening '{'.
  const last = text.lastIndexOf('}');
  if (last === -1) return -1;
  let depth = 0;
  for (let i = last; i >= 0; i--) {
    const c = text[i];
    if (c === '}') depth++;
    else if (c === '{') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function clamp(n: number, lo: number, hi: number) {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

const RESEARCH_PROMPT = `You are a manufacturing sourcing analyst working for Micromex, a US-Mexico
contract manufacturer founded 1988 (Tucson HQ, Imuris Sonora factory). Micromex
offers four service lines:
  1. Electrical assemblies (wire harnesses, cord sets, transformers, control panels)
  2. Refurbishment / reman (premium consumer hardware, e.g. Terra Kaffe espresso)
  3. Custom contract packaging (toys, temporary tattoos, kits, novelty CPG)
  4. Mechanical assembly & sub-assemblies (elevator parts, door sheaves, hardware)

Target company: {{company.name}}
Website: {{company.website}}
Industry: {{company.industry_segment}}
Known shipments (last 12 months):
{{shipments_summary}}

Your job: produce a research brief that helps a Micromex BD rep open a
conversation. Output in two parts:

PART 1 — research_summary (markdown, 3 short paragraphs):
  - What this company does and the product line that matters to us
  - Their current sourcing reality (based on shipment evidence)
  - Why now: the specific tariff / supply-chain / quality angle to open with

PART 2 — research_intelligence_json (strict JSON, no prose):
{
  "primary_capability_match": "electrical" | "refurb" | "packaging" | "mechanical",
  "secondary_capability_matches": [...],
  "estimated_annual_spend_usd": { "low": <int>, "high": <int> },
  "current_vendor_guess": "<string>",
  "tariff_exposure_pct_estimate": <int 0-100>,
  "decision_cycle_weeks": { "low": <int>, "high": <int> },
  "switching_triggers": ["<short trigger>", ...],
  "buying_committee_titles": ["<title>", ...],
  "opening_hook": "<one sentence the BD rep would actually say>",
  "risk_flags": ["<concern>", ...]
}

Be concrete, cite shipment evidence in the summary. If data is thin, say so —
do not fabricate.`;
