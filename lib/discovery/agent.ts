import { anthropic, CLAUDE_MODELS, extractJson, textFrom } from '@/lib/anthropic';
import { createServiceClient } from '@/lib/supabase/server';
import { enqueue } from '@/lib/jobs';
import { extractDomain, normalizeCompanyName } from '@/lib/ingest/normalize';
import type { DiscoveryTarget } from '@/lib/discovery/targets';
import type { CapabilityBucket } from '@/lib/types/domain';

export interface Candidate {
  name: string;
  domain: string | null;
  website: string | null;
  country: string;
  us_presence_note?: string;
  industry_segment: string;
  revenue_band_estimate: string;
  import_origin_likely: string;
  import_evidence: string;
  why_fit: string;
  confidence: number;
}

export interface DiscoveryResult {
  target_id: string;
  candidates_returned: number;
  companies_created: number;
  companies_skipped_dedupe: number;
  jobs_enqueued: number;
  duration_ms: number;
  errors: string[];
  run_id?: string;
}

export interface DiscoveryOptions {
  maxCandidates?: number;
  trigger?: 'manual' | 'cron';
  createdBy?: string | null;
}

const SYSTEM_PROMPT = `You are a lead-generation agent for Micromex, a US-Mexico contract
manufacturer (USMCA, Tucson HQ, Imuris Sonora factory, est. 1988). Your job
is volume + breadth: surface as many plausible US-facing brands as possible
in the target category. Downstream workers (research, scoring) will verify
import origins, revenue, and decision-makers — that is NOT your job.

Cast a wide net (within the location filter):
  - REQUIRED: the brand must have a US headquarters OR substantial US
    offices / operations / warehousing. Foreign ownership is fine — an
    Italian-owned brand with a Boston office qualifies; a Chinese brand
    that only sells via Amazon FBA with no US presence does NOT.
    "Substantial US presence" = real address, real US employees, not
    just a virtual office or PO box.
  - Within that location filter, include any brand in the category.
    Well-known names + smaller DTC names + B2B brands all welcome.
  - Brands you've heard of from training data ARE fair game; web search is
    a sanity check, not a hard requirement.
  - Don't try to verify revenue or import origins yourself. Just include a
    rough guess. The downstream research worker does the deep verification.
  - Skip ONLY: Fortune 500 giants (way too big to swap suppliers), pure
    distributors with no product line, clearly defunct brands, and brands
    with NO US presence at all (foreign-only operations).
  - Confidence < 0.5 is fine — downstream scoring will filter.

Use web search efficiently:
  - 1-3 searches per request is plenty. Prefer LIST queries that return
    many brands at once: "best <category> brands 2024 USA", "top DTC <category>
    startups", "<category> companies on Amazon".
  - You don't need to verify every candidate with its own search. Pull names
    from listicles, "best of" articles, Amazon best-sellers, Crunchbase
    industry pages.

OUTPUT CONTRACT — non-negotiable:
  - Your FINAL message MUST be a single JSON object and NOTHING ELSE.
  - Aim for 12-20 candidates per request. Empty is failure, not caution.
  - Plan internally; do NOT narrate your search plan in the final message.
  - Budget tokens favoring the JSON output. Don't keep searching forever.`;

function buildUserPrompt(target: DiscoveryTarget, max: number): string {
  return `Category: ${target.industry_segment}
Capability fit (for Micromex): ${target.capability}
Approximate revenue band of interest: ${target.revenue_band}
Product signals: ${target.product_signals.join(', ')}
Useful search starting points: ${target.search_hints.join(' / ')}

Description: ${target.description}

Produce a list of up to ${max} brands in this category that have a US
headquarters or substantial US offices/operations. Foreign ownership is
OK; foreign-only operations are NOT (e.g. Amazon-only foreign sellers
with no US presence don't qualify).

Pull from "best of" lists, Amazon best-sellers (US brands only), DTC
startup roundups, industry directories, US-based trade associations —
whatever surfaces a lot of names quickly. Include both well-known brands
and smaller DTC names.

Do NOT try to verify each company's import origin or exact revenue — guess
based on category norms (e.g. "premium small appliances" → likely from
China/Italy → just put "China" as likely origin). The research worker
downstream will do the real verification.

Output strict JSON only (no prose before or after, no markdown fence):
{
  "candidates": [
    {
      "name": "<brand name>",
      "domain": "<primary domain, no protocol, no www, your best guess if uncertain>",
      "website": "<full https URL or null>",
      "country": "US",
      "us_presence_note": "<short note: where their US HQ/offices are. e.g. \"HQ Boston, MA\" or \"US offices in Austin\". Required.>",
      "industry_segment": "${target.industry_segment}",
      "revenue_band_estimate": "<rough guess, e.g. $10M-$50M>",
      "import_origin_likely": "<best guess: China / Vietnam / Taiwan / Italy / Mexico>",
      "import_evidence": "<\"likely based on category norms\" if you don't have direct evidence>",
      "why_fit": "<one short sentence: what Micromex capability fits>",
      "confidence": <0.0-1.0>
    }
  ]
}`;
}

export async function runDiscovery(
  target: DiscoveryTarget,
  options: DiscoveryOptions = {},
): Promise<DiscoveryResult> {
  const max = options.maxCandidates ?? 15;
  const trigger = options.trigger ?? 'manual';
  const createdBy = options.createdBy ?? null;
  const startedAt = Date.now();
  const client = anthropic();

  const msg = await client.messages.create({
    model: CLAUDE_MODELS.research, // sonnet-4-6
    max_tokens: 8000,
    temperature: 0.2,
    system: SYSTEM_PROMPT,
    tools: [
      {
        type: 'web_search_20250305' as never,
        name: 'web_search',
        max_uses: 6,
      } as never,
    ],
    messages: [{ role: 'user', content: buildUserPrompt(target, max) }],
  });

  const text = textFrom(msg);
  let parsed: { candidates: Candidate[] };
  try {
    parsed = extractJson(text);
  } catch {
    // Claude finished without producing valid JSON — usually it ran out of
    // budget mid-reasoning. Record the run with zero candidates and log
    // Claude's reasoning so we can see what happened on /discovery.
    parsed = { candidates: [] };
    const supabaseSvc = createServiceClient();
    await supabaseSvc.from('discovery_runs').insert({
      target_id: target.id,
      trigger,
      candidates_returned: 0,
      companies_created: 0,
      companies_skipped_dedupe: 0,
      jobs_enqueued: 0,
      duration_ms: Date.now() - startedAt,
      errors: [
        {
          kind: 'no_json_returned',
          stop_reason: msg.stop_reason ?? 'unknown',
          reasoning_excerpt: text.slice(0, 600),
        },
      ] as never,
      error_message: 'Claude finished without producing JSON (likely budget exhausted during search/reasoning).',
      created_by: createdBy,
    } as never);

    return {
      target_id: target.id,
      candidates_returned: 0,
      companies_created: 0,
      companies_skipped_dedupe: 0,
      jobs_enqueued: 0,
      duration_ms: Date.now() - startedAt,
      errors: ['Claude finished without JSON — saw: ' + text.slice(0, 160)],
    };
  }

  const supabase = createServiceClient();
  const result: DiscoveryResult = {
    target_id: target.id,
    candidates_returned: parsed.candidates.length,
    companies_created: 0,
    companies_skipped_dedupe: 0,
    jobs_enqueued: 0,
    duration_ms: 0,
    errors: [],
  };

  for (const c of parsed.candidates) {
    if (!c.name || (!c.domain && !c.website)) {
      result.errors.push(`skip: missing name/domain (${JSON.stringify(c).slice(0, 80)})`);
      continue;
    }
    const domain = normalizeDomain(c.domain ?? extractDomain(c.website));

    // Dedupe: prefer domain match, fall back to normalized name.
    let existingId: string | null = null;
    if (domain) {
      const { data } = await supabase
        .from('companies')
        .select('id')
        .eq('domain', domain)
        .maybeSingle();
      existingId = (data as { id: string } | null)?.id ?? null;
    }
    if (!existingId) {
      const { data } = await supabase
        .from('companies')
        .select('id')
        .ilike('name', c.name)
        .maybeSingle();
      existingId = (data as { id: string } | null)?.id ?? null;
    }

    if (existingId) {
      result.companies_skipped_dedupe++;
      continue;
    }

    const { data: inserted, error } = await supabase
      .from('companies')
      .insert({
        name: c.name,
        domain,
        website: c.website,
        country: c.country || 'US',
        industry_segment: c.industry_segment ?? target.industry_segment,
        revenue_band: c.revenue_band_estimate ?? null,
        capability_match: [target.capability] as CapabilityBucket[] as never,
        status: 'new',
        source: 'manual',
        source_ref: `discovery:${target.id}`,
        research_intelligence_json: null,
        last_activity_at: new Date().toISOString(),
      } as never)
      .select('id')
      .single();

    if (error || !inserted) {
      result.errors.push(`insert ${c.name}: ${error?.message ?? 'unknown'}`);
      continue;
    }

    const companyId = (inserted as { id: string }).id;
    result.companies_created++;

    // Initial discovery activity entry so we can audit what Claude said.
    const presenceLine = c.us_presence_note ? ` US presence: ${c.us_presence_note}.` : '';
    await supabase.from('activities').insert({
      company_id: companyId,
      type: 'research_update',
      actor: 'discovery_agent',
      body: `Discovered via target "${target.id}".${presenceLine} ${c.why_fit}`,
      metadata_json: {
        target_id: target.id,
        candidate: c,
      } as never,
    } as never);

    // Enqueue the full enrichment pipeline.
    try {
      await enqueue({ targetType: 'company', targetId: companyId, jobType: 'research', priority: 7 });
      await enqueue({ targetType: 'company', targetId: companyId, jobType: 'email_lookup', priority: 6 });
      await enqueue({ targetType: 'company', targetId: companyId, jobType: 'score', priority: 4 });
      result.jobs_enqueued += 3;
    } catch (e) {
      result.errors.push(`enqueue ${c.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  result.duration_ms = Date.now() - startedAt;

  // Record this run for the /discovery history view.
  const { data: runRow } = await supabase
    .from('discovery_runs')
    .insert({
      target_id: target.id,
      trigger,
      candidates_returned: result.candidates_returned,
      companies_created: result.companies_created,
      companies_skipped_dedupe: result.companies_skipped_dedupe,
      jobs_enqueued: result.jobs_enqueued,
      duration_ms: result.duration_ms,
      errors: result.errors as never,
      created_by: createdBy,
    } as never)
    .select('id')
    .maybeSingle();

  if (runRow) result.run_id = (runRow as { id: string }).id;

  return result;
}

function normalizeDomain(d: string | null | undefined): string | null {
  if (!d) return null;
  return d
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .toLowerCase()
    .trim() || null;
}
