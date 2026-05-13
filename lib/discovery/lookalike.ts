import { createServiceClient } from '@/lib/supabase/server';
import { runDiscovery, type DiscoveryResult } from '@/lib/discovery/agent';
import type { DiscoveryTarget } from '@/lib/discovery/targets';
import type { CapabilityBucket, ResearchIntelligence } from '@/lib/types/domain';

/**
 * Run a lookalike search seeded from a high-fit company.
 * Builds an ephemeral DiscoveryTarget that asks Claude:
 * "find more US brands like <this winning company>".
 */
export async function runLookalike(
  sourceCompanyId: string,
  options: { maxCandidates?: number; createdBy?: string | null } = {},
): Promise<DiscoveryResult> {
  const supabase = createServiceClient();
  const { data: company, error } = await supabase
    .from('companies')
    .select(
      'id, name, domain, website, industry_segment, revenue_band, capability_match, research_summary, research_intelligence_json',
    )
    .eq('id', sourceCompanyId)
    .single();
  if (error || !company) throw new Error(`lookalike: company ${sourceCompanyId} not found`);

  const c = company as {
    id: string;
    name: string;
    domain: string | null;
    website: string | null;
    industry_segment: string | null;
    revenue_band: string | null;
    capability_match: string[] | null;
    research_summary: string | null;
    research_intelligence_json: ResearchIntelligence | null;
  };

  const capabilities = (c.capability_match ?? []) as CapabilityBucket[];
  const primaryCapability =
    c.research_intelligence_json?.primary_capability_match ??
    capabilities[0] ??
    'electrical';
  const industry = c.industry_segment ?? c.research_intelligence_json?.primary_capability_match ?? 'unknown';
  const revenue = c.revenue_band ?? '$5M-$200M';
  const products = c.research_intelligence_json?.switching_triggers ?? [];

  const target: DiscoveryTarget = {
    id: `lookalike_${c.id.slice(0, 8)}`,
    capability: primaryCapability,
    industry_segment: industry,
    description: `Companies similar to ${c.name}${c.domain ? ` (${c.domain})` : ''} — same industry, similar product line, US-based, importing from Asia.`,
    import_origins: ['China', 'Vietnam', 'Taiwan'],
    revenue_band: revenue,
    search_hints: [
      `companies like ${c.name}`,
      `US ${industry} brands`,
      `${industry} competitors of ${c.name}`,
      `${industry} startups direct-to-consumer`,
    ],
    product_signals: products.length > 0 ? products : [industry],
  };

  // Persist the seed source so /discovery can show "lookalike of <company>".
  const result = await runDiscovery(target, {
    maxCandidates: options.maxCandidates ?? 8,
    trigger: 'manual',
    createdBy: options.createdBy ?? null,
  });

  // Attach a note to the source company so we can trace what it spawned.
  await supabase.from('activities').insert({
    company_id: c.id,
    type: 'system',
    actor: 'lookalike_agent',
    body: `Lookalike run produced ${result.companies_created} new candidates (${result.candidates_returned} returned).`,
    metadata_json: {
      lookalike_target_id: target.id,
      run_id: result.run_id,
      ...result,
    } as never,
  } as never);

  return { ...result, target_id: target.id };
}
