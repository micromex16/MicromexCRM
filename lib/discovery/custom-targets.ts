import { createServiceClient } from '@/lib/supabase/server';
import type { DiscoveryTarget } from '@/lib/discovery/targets';
import type { CapabilityBucket } from '@/lib/types/domain';

interface CustomTargetRow {
  id: string;
  slug: string;
  capability: CapabilityBucket;
  industry_segment: string;
  description: string;
  import_origins: string[];
  revenue_band: string;
  search_hints: string[];
  product_signals: string[];
  is_active: boolean;
}

export async function loadCustomTargets(): Promise<DiscoveryTarget[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('custom_discovery_targets')
    .select('id, slug, capability, industry_segment, description, import_origins, revenue_band, search_hints, product_signals, is_active')
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn(`loadCustomTargets failed: ${error.message}`);
    return [];
  }
  return (data ?? []).map(rowToTarget);
}

function rowToTarget(r: CustomTargetRow): DiscoveryTarget {
  return {
    id: `custom_${r.slug}`,
    capability: r.capability,
    industry_segment: r.industry_segment,
    description: r.description,
    import_origins: r.import_origins,
    revenue_band: r.revenue_band,
    search_hints: r.search_hints,
    product_signals: r.product_signals,
  };
}

export interface CustomTargetInput {
  slug: string;
  capability: CapabilityBucket;
  industry_segment: string;
  description: string;
  import_origins: string[];
  revenue_band: string;
  search_hints: string[];
  product_signals: string[];
}

export async function createCustomTarget(input: CustomTargetInput, userId: string | null) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('custom_discovery_targets')
    .insert({
      ...input,
      slug: normalizeSlug(input.slug),
      created_by: userId,
      is_active: true,
    } as never)
    .select('id, slug')
    .single();
  if (error) throw new Error(error.message);
  return data as { id: string; slug: string };
}

export async function deactivateCustomTarget(id: string) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('custom_discovery_targets')
    .update({ is_active: false } as never)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

function normalizeSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
}
