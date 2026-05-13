// Seed templates: 4 capability buckets × 2 variants (cold_intro / tariff_angle).
// Imported by scripts/seed.ts.

import type { CapabilityBucket } from '@/lib/types/domain';

export interface SeedTemplate {
  name: string;
  capability_bucket: CapabilityBucket;
  variant_label: string;
  subject: string;
  body_md: string;
}

export const SEED_TEMPLATES: SeedTemplate[] = [
  // ===== ELECTRICAL =====
  {
    name: 'electrical_cold_intro',
    capability_bucket: 'electrical',
    variant_label: 'A',
    subject: '{{company.name}} + harnesses out of Mexico?',
    body_md: `Hi {{contact.first_name}} —

Noticed {{company.name}} pulls {{shipments.top_hts_description}} from
{{shipments.top_origin_country}}. We make the same class of assemblies
out of Imuris, Sonora — USMCA, no Section 301 hit, same-day truck to
Phoenix.

Micromex has been doing harness and cord-set work since 1988. We've
helped a few brands your size cut landed cost 12-18% on this category.

Worth a 20-minute call next Tuesday or Thursday afternoon to compare a
real BOM?

Giovanni`,
  },
  {
    name: 'electrical_tariff_angle',
    capability_bucket: 'electrical',
    variant_label: 'B',
    subject: 'tariff math for {{company.name}}',
    body_md: `Hi {{contact.first_name}} —

Quick number: if {{company.name}} is pulling harnesses or wound magnetics
from {{shipments.top_origin_country}}, you're likely eating 15-30%
landed-cost premium between Section 301 + ocean freight + extra inventory
for the long lead time.

USMCA out of our Imuris, Sonora plant: 0% duty, 3-day rail/truck to
your dock, no MOQ pain. Same harness shop running since 1988.

Worth 20 minutes next Tuesday or Thursday to put real numbers on it?

Giovanni`,
  },

  // ===== REFURB =====
  {
    name: 'refurb_cold_intro',
    capability_bucket: 'refurb',
    variant_label: 'A',
    subject: 'refurb pipeline for {{company.name}}',
    body_md: `Hi {{contact.first_name}} —

We handle the full refurb pipeline for Terra Kaffe — inbound diag,
component-level repair, repack, drop-ship. ~38 years of repair-line
experience, Tucson + Sonora.

For brands at {{company.name}}'s price point, refurb-as-a-service usually
recovers 40-60% of unit cost vs. scrap.

Open to a 20-minute call next week to walk through how it works?

Giovanni`,
  },
  {
    name: 'refurb_tariff_angle',
    capability_bucket: 'refurb',
    variant_label: 'B',
    subject: 'recovery math, {{company.name}} returns',
    body_md: `Hi {{contact.first_name}} —

Most premium-hardware brands lose 100% of unit cost when a returned
unit gets scrapped or sold off as B-stock. With a real refurb line:
diagnostic, board-level repair, repackage, drop-ship — you recover
40-60%.

That's what we do for Terra Kaffe out of Tucson + Imuris. ~38 years
running consumer-electronics repair lines.

20 minutes Tuesday or Thursday to see if the unit economics work for
{{company.name}}?

Giovanni`,
  },

  // ===== PACKAGING =====
  {
    name: 'packaging_cold_intro',
    capability_bucket: 'packaging',
    variant_label: 'A',
    subject: 'contract packaging for {{company.name}}',
    body_md: `Hi {{contact.first_name}} —

We run kitting and retail packaging out of Imuris — toys, temp tattoos,
novelty CPG, multi-component kits. USMCA, no tariff exposure on the
packaging step.

If {{company.name}} is doing volume on {{shipments.top_hts_description}}
or anything that needs hand-pack, kitting, or retail-ready conversion,
we'd be a fast fit.

20 minutes next Wednesday or Friday?

Giovanni`,
  },
  {
    name: 'packaging_tariff_angle',
    capability_bucket: 'packaging',
    variant_label: 'B',
    subject: 'packaging step + USMCA for {{company.name}}',
    body_md: `Hi {{contact.first_name}} —

If you're importing bulk product from {{shipments.top_origin_country}}
and doing the kitting / retail packaging stateside (or worse, paying
duty on already-packed units), there's a cleaner play: bulk-in to Imuris,
hand-pack to retail-ready, ship USMCA into the US.

Net: tariff savings on the conversion step + a cheaper hand-pack labor
line. We do this for novelty CPG and toy brands today.

20 minutes Wednesday or Friday to talk volume?

Giovanni`,
  },

  // ===== MECHANICAL =====
  {
    name: 'mechanical_cold_intro',
    capability_bucket: 'mechanical',
    variant_label: 'A',
    subject: 'mechanical sub-assembly for {{company.name}}',
    body_md: `Hi {{contact.first_name}} —

We do high-volume mechanical assembly out of Sonora — elevator parts,
door sheaves, hardware kits, anything labor-heavy. ~38 years building
this kind of work for US OEMs.

Saw {{company.name}} imports {{shipments.top_hts_description}} — that's
right in our wheelhouse and we'd save you the China lead time and the
tariff.

Worth a quick call Tuesday or Thursday next week?

Giovanni`,
  },
  {
    name: 'mechanical_tariff_angle',
    capability_bucket: 'mechanical',
    variant_label: 'B',
    subject: 'cycle time math for {{company.name}}',
    body_md: `Hi {{contact.first_name}} —

For labor-heavy mechanical assemblies coming out of
{{shipments.top_origin_country}}, the painful math is usually 50-90 day
ocean lead time + tariff stack + inventory carry. Same-day truck from
Imuris to Phoenix changes that whole equation.

We've been doing this kind of work — elevator parts, door sheaves,
hardware kits — for 38 years. USMCA-qualifying.

20 minutes Tuesday or Thursday next week to put real numbers on
{{company.name}}'s situation?

Giovanni`,
  },
];
