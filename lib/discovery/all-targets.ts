import { DISCOVERY_TARGETS, type DiscoveryTarget } from '@/lib/discovery/targets';
import { loadCustomTargets } from '@/lib/discovery/custom-targets';

/**
 * Built-in + active custom targets, deduped by id. Custom takes precedence
 * if an id collision ever happens (it shouldn't).
 */
export async function allActiveTargets(): Promise<DiscoveryTarget[]> {
  const custom = await loadCustomTargets();
  const seen = new Set(custom.map((c) => c.id));
  const builtIn = DISCOVERY_TARGETS.filter((t) => !seen.has(t.id));
  return [...custom, ...builtIn];
}

export async function targetByIdAcrossAll(id: string): Promise<DiscoveryTarget | undefined> {
  if (id.startsWith('custom_')) {
    const custom = await loadCustomTargets();
    return custom.find((t) => t.id === id);
  }
  return DISCOVERY_TARGETS.find((t) => t.id === id);
}
