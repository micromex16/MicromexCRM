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

  // ===== New specific sectors =====
  {
    id: 'automotive_aftermarket_electronics',
    capability: 'electrical',
    industry_segment: 'Automotive aftermarket electronics',
    description:
      'US automotive aftermarket brands selling dashcams, head units, ECU tuners, lighting, trailer wiring, off-road accessories, EV retrofit kits.',
    import_origins: ['China', 'Taiwan'],
    revenue_band: '$5M-$200M',
    search_hints: [
      'US automotive aftermarket brand',
      'truck accessory brand DTC',
      'overlanding accessory brand',
      'dashcam brand US',
      'aftermarket auto electronics startup',
    ],
    product_signals: ['dashcam', 'head unit', 'wiring harness', 'overlanding', 'trailer wiring', 'aftermarket lighting'],
  },
  {
    id: 'audio_equipment',
    capability: 'electrical',
    industry_segment: 'Audio equipment & pro audio',
    description:
      'US audio brands — speakers, headphones, amplifiers, microphones, audio interfaces, studio gear. DTC + B2B.',
    import_origins: ['China', 'Vietnam', 'Taiwan'],
    revenue_band: '$5M-$200M',
    search_hints: [
      'US audio equipment brand',
      'DTC speaker company',
      'pro audio gear startup',
      'US headphone brand',
      'studio microphone manufacturer USA',
    ],
    product_signals: ['speaker', 'headphone', 'microphone', 'amplifier', 'audio interface', 'pro audio'],
  },
  {
    id: 'smart_home_security',
    capability: 'electrical',
    industry_segment: 'Smart home & security',
    description:
      'US smart home brands — security cameras, video doorbells, sensors, hubs, smart lighting, smart locks.',
    import_origins: ['China', 'Vietnam'],
    revenue_band: '$5M-$300M',
    search_hints: [
      'US smart home brand',
      'US security camera startup',
      'smart lock manufacturer USA',
      'video doorbell brand DTC',
    ],
    product_signals: ['security camera', 'video doorbell', 'smart sensor', 'smart hub', 'smart lock'],
  },
  {
    id: 'power_tools',
    capability: 'electrical',
    industry_segment: 'Power tools & cordless equipment',
    description:
      'US power-tool brands — cordless drills, saws, grinders, sanders, outdoor power equipment. Mid-market between DIY and pro.',
    import_origins: ['China', 'Vietnam'],
    revenue_band: '$10M-$300M',
    search_hints: [
      'US power tool brand',
      'cordless tool startup USA',
      'specialty power tool manufacturer',
      'outdoor power equipment brand DTC',
    ],
    product_signals: ['cordless drill', 'circular saw', 'angle grinder', 'leaf blower', 'string trimmer'],
  },
  {
    id: 'pet_products',
    capability: 'packaging',
    industry_segment: 'Pet products & accessories',
    description:
      'US pet brands — toys, beds, accessories, training gear, subscription boxes. Heavy kitting + retail packaging volume.',
    import_origins: ['China', 'Vietnam'],
    revenue_band: '$5M-$200M',
    search_hints: [
      'US pet brand DTC',
      'pet subscription box',
      'dog toy brand',
      'cat product startup USA',
      'pet accessories brand',
    ],
    product_signals: ['pet toy', 'pet bed', 'pet accessory', 'training collar', 'subscription kit'],
  },
  {
    id: 'fitness_equipment',
    capability: 'refurb',
    industry_segment: 'Home fitness equipment',
    description:
      'US home-fitness brands — treadmills, bikes, ellipticals, rowers, strength systems. High return rate makes refurb-as-a-service attractive.',
    import_origins: ['China', 'Taiwan'],
    revenue_band: '$10M-$500M',
    search_hints: [
      'US home fitness equipment brand',
      'connected fitness startup',
      'home treadmill brand',
      'rowing machine brand USA',
      'strength training equipment DTC',
    ],
    product_signals: ['treadmill', 'exercise bike', 'rowing machine', 'connected fitness', 'home gym'],
  },
  {
    id: 'outdoor_camping_gear',
    capability: 'packaging',
    industry_segment: 'Outdoor & camping gear',
    description:
      'US outdoor brands — tents, coolers, camp stoves, sleeping bags, headlamps, hydration. Heavy retail packaging + kitting volume.',
    import_origins: ['China', 'Vietnam', 'Taiwan'],
    revenue_band: '$5M-$300M',
    search_hints: [
      'US outdoor gear brand DTC',
      'specialty camping equipment manufacturer',
      'US tent brand',
      'cooler brand DTC',
      'overlanding gear brand',
    ],
    product_signals: ['tent', 'cooler', 'camp stove', 'sleeping bag', 'headlamp', 'water bottle'],
  },
  {
    id: 'bicycle_parts',
    capability: 'mechanical',
    industry_segment: 'Bicycle parts & accessories',
    description:
      'US bicycle parts and accessory brands — components, racks, lights, locks, helmets, kits. Mechanical sub-assemblies + packaging.',
    import_origins: ['China', 'Taiwan'],
    revenue_band: '$5M-$200M',
    search_hints: [
      'US bicycle component brand',
      'cycling accessory startup',
      'bike rack manufacturer USA',
      'bike light brand DTC',
      'cycling parts US brand',
    ],
    product_signals: ['bike component', 'bike rack', 'bike light', 'bike lock', 'cycling helmet'],
  },

  // ===== Broad-sweep targets (no narrow industry — high-volume catch-all) =====
  {
    id: 'broad_electrical',
    capability: 'electrical',
    industry_segment: 'US electrical sub-assembly importers (broad)',
    description:
      'ANY US brand importing electrical / electronic sub-assemblies, wire harnesses, cord sets, magnetics, control panels, PCBAs from Asia. Cast the widest possible net.',
    import_origins: ['China', 'Vietnam', 'Taiwan'],
    revenue_band: '$5M-$300M',
    search_hints: [
      'US brands importing electronics from China',
      'US electronics startup direct-to-consumer',
      'best US made electronics brands',
      'US OEM importing wire harnesses',
      'top US electrical product startups',
    ],
    product_signals: ['wire harness', 'cord set', 'transformer', 'power supply', 'control panel', 'PCBA', 'cable assembly'],
  },
  {
    id: 'broad_refurb',
    capability: 'refurb',
    industry_segment: 'US premium hardware brands w/ returns (broad)',
    description:
      'ANY US premium consumer-hardware brand with non-trivial return volume — espresso, coffee, kitchen, fitness, audio, beauty tech, gaming, smart-home. Refurb-as-a-service candidates.',
    import_origins: ['China', 'Vietnam', 'Italy', 'Mexico'],
    revenue_band: '$5M-$300M',
    search_hints: [
      'premium US consumer electronics brand',
      'DTC kitchen appliance brand US',
      'connected hardware startup',
      'home appliance brand $200+ price point',
      'premium small appliance US brand',
    ],
    product_signals: ['premium appliance', 'connected device', 'kitchen gadget', 'beauty device', 'high-end consumer hardware'],
  },
  {
    id: 'broad_packaging',
    capability: 'packaging',
    industry_segment: 'US CPG + retail packaging clients (broad)',
    description:
      'ANY US brand importing bulk product from Asia and needing kitting / hand-pack / retail-ready conversion. Toys, novelty CPG, beauty, pet, outdoor, gift kits, subscription boxes, multi-component sets.',
    import_origins: ['China', 'Vietnam'],
    revenue_band: '$5M-$200M',
    search_hints: [
      'US CPG brand importing from China',
      'subscription box company US',
      'novelty CPG brand DTC',
      'kit assembler US',
      'retail-ready packaging client',
    ],
    product_signals: ['retail kit', 'multi-pack', 'subscription box', 'hand-pack', 'novelty CPG', 'gift set'],
  },
  {
    id: 'broad_mechanical',
    capability: 'mechanical',
    industry_segment: 'US mechanical sub-assembly importers (broad)',
    description:
      'ANY US brand importing labor-heavy mechanical sub-assemblies from Asia — hardware kits, hinges, sheaves, brackets, casters, fasteners, machined parts, fixtures. Cross-industry.',
    import_origins: ['China', 'Taiwan'],
    revenue_band: '$10M-$300M',
    search_hints: [
      'US OEM importing hardware kits from China',
      'US brand importing sheet metal assemblies',
      'mechanical sub-assembly buyer US',
      'US manufacturer outsourcing hardware to Asia',
      'specialty mechanical hardware US brand',
    ],
    product_signals: ['hardware kit', 'sheet metal', 'machined parts', 'bracket', 'hinge', 'caster', 'fixture'],
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
