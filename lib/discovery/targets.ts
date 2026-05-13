// Discovery targets — narrow ICP profiles Claude searches against.
// Each target represents a specific industry × capability × import-origin slice
// of Micromex's ideal customer profile.

import type { CapabilityBucket } from '@/lib/types/domain';

export interface DiscoveryTarget {
  id: string;
  capability: CapabilityBucket;
  industry_segment: string;
  description: string;
  /** Origin countries that signal tariff exposure. */
  import_origins: string[];
  /** Revenue band hint for Claude to filter on. */
  revenue_band: string;
  /** Concrete search hints (Claude has discretion but these anchor it). */
  search_hints: string[];
  /** Specific product / HTS-chapter signals Claude should look for. */
  product_signals: string[];
}

export const DISCOVERY_TARGETS: DiscoveryTarget[] = [
  {
    id: 'ev_charging',
    capability: 'electrical',
    industry_segment: 'EV charging & power electronics',
    description:
      'US brands selling Level 2 chargers, portable EV chargers, inverters, power supplies for the home/SMB market.',
    import_origins: ['China', 'Vietnam', 'Taiwan'],
    revenue_band: '$5M-$200M',
    search_hints: [
      'Level 2 home EV charger US brand',
      'portable EV charger startup',
      'US Level 2 charging hardware company',
      'EV charging equipment direct-to-consumer',
    ],
    product_signals: ['EV charger', 'wallbox', 'Level 2', 'inverter', 'power supply', 'magnetics'],
  },
  {
    id: 'premium_appliances',
    capability: 'refurb',
    industry_segment: 'Premium small appliances',
    description:
      'Premium home appliances $500-$3000 unit price (espresso, coffee, blenders, kitchen tools). Sold DTC or Amazon. Return rate makes refurb math attractive.',
    import_origins: ['China', 'Italy', 'Vietnam', 'Mexico'],
    revenue_band: '$5M-$100M',
    search_hints: [
      'premium home espresso machine US brand',
      'DTC kitchen appliance startup',
      'specialty coffee equipment brand',
      'premium blender startup',
    ],
    product_signals: ['espresso machine', 'grinder', 'high-end blender', 'kitchen appliance'],
  },
  {
    id: 'led_lighting',
    capability: 'electrical',
    industry_segment: 'LED & specialty lighting',
    description:
      'US LED, architectural, and specialty lighting brands selling fixtures + drivers + controls.',
    import_origins: ['China', 'Taiwan'],
    revenue_band: '$5M-$150M',
    search_hints: [
      'US LED lighting manufacturer',
      'commercial LED fixtures startup',
      'specialty architectural lighting brand',
      'horticulture grow light company',
    ],
    product_signals: ['LED fixture', 'driver', 'troffer', 'grow light', 'specialty lighting'],
  },
  {
    id: 'industrial_controls',
    capability: 'electrical',
    industry_segment: 'Industrial controls & panels',
    description:
      'US industrial OEMs that build control panels, motor controls, or pump/HVAC controls. Often import sub-assemblies from China.',
    import_origins: ['China', 'Taiwan'],
    revenue_band: '$10M-$200M',
    search_hints: [
      'industrial control panel manufacturer US',
      'motor control US OEM',
      'pump controller brand',
      'HVAC controls company',
    ],
    product_signals: ['control panel', 'PLC', 'motor starter', 'VFD', 'wire harness'],
  },
  {
    id: 'toys_novelty',
    capability: 'packaging',
    industry_segment: 'Toys & novelty CPG',
    description:
      'Toy, gift, novelty, temporary-tattoo, and party-supply brands. High SKU count, lots of kitting and retail packaging.',
    import_origins: ['China'],
    revenue_band: '$5M-$100M',
    search_hints: [
      'US novelty CPG brand China import',
      'temporary tattoo brand US',
      'specialty toy company DTC',
      'gift kit subscription box brand',
    ],
    product_signals: ['toy', 'temporary tattoo', 'novelty gift', 'multi-component kit'],
  },
  {
    id: 'door_hardware',
    capability: 'mechanical',
    industry_segment: 'Door & access hardware',
    description:
      'US door hardware brands — locks, hinges, sheaves, closers, panic hardware, automatic door operators.',
    import_origins: ['China', 'Taiwan'],
    revenue_band: '$10M-$200M',
    search_hints: [
      'US commercial door hardware manufacturer',
      'commercial lockset brand',
      'door operator US company',
      'access hardware OEM',
    ],
    product_signals: ['hinge', 'sheave', 'closer', 'lockset', 'door operator', 'panic hardware'],
  },
  {
    id: 'elevator_hardware',
    capability: 'mechanical',
    industry_segment: 'Elevator & lift hardware',
    description:
      'US suppliers of elevator components — door operators, sheaves, control board hardware, cab interiors.',
    import_origins: ['China', 'Taiwan'],
    revenue_band: '$10M-$150M',
    search_hints: [
      'elevator door operator manufacturer US',
      'elevator sheave supplier',
      'lift component manufacturer USA',
    ],
    product_signals: ['elevator', 'sheave', 'door operator', 'lift component'],
  },
  {
    id: 'medical_sub',
    capability: 'electrical',
    industry_segment: 'Medical device sub-assembly',
    description:
      'Non-implantable medical device brands. Sub-assembly volume (cables, harnesses, control boxes) often imported from Asia.',
    import_origins: ['China', 'Taiwan', 'Mexico'],
    revenue_band: '$10M-$300M',
    search_hints: [
      'US medical device startup',
      'point of care diagnostics brand',
      'home medical device DTC',
      'rehab medical equipment manufacturer',
    ],
    product_signals: ['cable assembly', 'sub-assembly', 'patient interface', 'medical control'],
  },
];

/**
 * Pick today's target via round-robin keyed off the day-of-year.
 * Keeps coverage even if cron mis-fires; predictable rotation.
 */
export function todaysTarget(now = new Date()): DiscoveryTarget {
  const day = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  return DISCOVERY_TARGETS[day % DISCOVERY_TARGETS.length];
}

export function targetById(id: string): DiscoveryTarget | undefined {
  return DISCOVERY_TARGETS.find((t) => t.id === id);
}
