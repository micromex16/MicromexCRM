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

const SYSTEM_PROMPT = `You are a sourcing analyst for Micromex, a US-Mexico contract manufacturer
(USMCA, Tucson HQ, Imuris Sonora factory, est. 1988). Your job is to identify
US brands that would benefit from moving Asian sub-assembly work to Micromex.

The ideal customer:
  - US company, $5M-$500M revenue
  - Imports finished goods or sub-components from China / Vietnam / Taiwan
  - Pays Section 301 tariffs and/or eats long ocean lead times
  - Has a buying committee (VP Ops, Director of Supply Chain, etc.)

You will be given a target profile. Find specific US companies matching it.
Use web search to verify each candidate. Be conservative — fewer high-quality
candidates is better than many speculative ones. Reject candidates without a
clear US presence, without import-from-Asia evidence, or that are too large
(Fortune 500) or too small (under $5M).

OUTPUT CONTRACT — non-negotiable:
  - Your FINAL message MUST be a single JSON object matching the schema below,
    and NOTHING ELSE — no prose before or after.
  - Even if your searches are inconclusive, output { "candidates": [] }.
  - Do not narrate plans like "let me search again" in the final message.
    Plan internally, search, then output JSON.
  - Budget your tokens: prefer ending early with the JSON over continued
    reasoning. An empty result with the JSON shape is success; a truncated
    answer without JSON is failure.`;

function buildUserPrompt(target: DiscoveryTarget, max: number): string {
  return `Target profile:
  Industry: ${target.industry_segment}
  Capability fit: ${target.capability}
  Revenue band: ${target.revenue_band}
  Likely import origins: ${target.import_origins.join(', ')}
  Product signals to look for: ${target.product_signals.join(', ')}
  Specific examples of what to search: ${target.search_hints.join(' / ')}

Description: ${target.description}

Search the web for ${max} US companies matching this profile. For each, verify:
  - They have a real US-facing product line (look at their website)
  - They import from China / Vietnam / Taiwan (look for "made in", supplier disclosures, sustainability reports, FOB origin in shipping docs, Amazon listings, press releases)
  - Revenue band roughly fits ${target.revenue_band}

Output strict JSON only (no prose before or after):
{
  "candidates": [
    {
      "name": "<exact legal/brand name>",
      "domain": "<their primary domain, no protocol, no www>",
      "website": "<full https URL>",
      "country": "US",
      "industry_segment": "${target.industry_segment}",
      "revenue_band_estimate": "<e.g. $10M-$50M>",
      "import_origin_likely": "<China|Vietnam|Taiwan|...>",
      "import_evidence": "<one sentence citing source: 'Amazon listing shows Shenzhen importer', 'LinkedIn lists factory in Dongguan', etc>",
      "why_fit": "<one sentence: what Micromex capability fits and why now>",
      "confidence": <0.0-1.0, your honest confidence>
    }
  ]
}

If you cannot find good candidates, return an empty array. Do not fabricate.`;
}

export async function runDiscovery(
  target: DiscoveryTarget,
  options: DiscoveryOptions = {},
): Promise<DiscoveryResult> {
  const max = options.maxCandidates ?? 10;
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
    await supabase.from('activities').insert({
      company_id: companyId,
      type: 'research_update',
      actor: 'discovery_agent',
      body: `Discovered via target "${target.id}". ${c.why_fit}`,
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
