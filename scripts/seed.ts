#!/usr/bin/env tsx
/* eslint-disable no-console */
// Seed initial data: 8 email templates + 1 sample (draft) campaign.
//
//   pnpm tsx scripts/seed.ts
//
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.

// Load .env.local before any module that reads env vars.
// Run with: `pnpm seed`  (which uses tsx --env-file=.env.local).

import { createServiceClient } from '@/lib/supabase/server';
import { SEED_TEMPLATES } from '@/lib/outreach/seed-templates';

async function main() {
  const supabase = createServiceClient();

  console.log(`Seeding ${SEED_TEMPLATES.length} email templates…`);
  let inserted = 0;
  let updated = 0;
  for (const t of SEED_TEMPLATES) {
    const { data: existing } = await supabase
      .from('email_templates')
      .select('id')
      .eq('name', t.name)
      .eq('variant_label', t.variant_label)
      .maybeSingle();
    if (existing) {
      await supabase
        .from('email_templates')
        .update({ subject: t.subject, body_md: t.body_md, capability_bucket: t.capability_bucket, is_active: true } as never)
        .eq('id', (existing as { id: string }).id);
      updated++;
    } else {
      await supabase.from('email_templates').insert({
        name: t.name,
        capability_bucket: t.capability_bucket,
        variant_label: t.variant_label,
        subject: t.subject,
        body_md: t.body_md,
        is_active: true,
      } as never);
      inserted++;
    }
  }
  console.log(`Templates: ${inserted} inserted, ${updated} updated.`);

  // Sample draft campaign — only created if none exist.
  const { data: campaignCount } = await supabase
    .from('campaigns')
    .select('id', { count: 'exact', head: true });
  if (!campaignCount) {
    const { data: tpl } = await supabase
      .from('email_templates')
      .select('id')
      .eq('name', 'electrical_cold_intro')
      .maybeSingle();
    if (tpl) {
      await supabase.from('campaigns').insert({
        name: 'Q2 2026 — Electrical / EV charging (sample)',
        capability_bucket: 'electrical',
        template_id: (tpl as { id: string }).id,
        status: 'draft',
        send_mode: 'manual_review',
        daily_send_cap: 25,
        segment_filter: {
          capability_match: ['electrical'],
          status: ['qualified'],
          fit_score_min: 60,
          has_email: true,
          limit: 200,
        },
      } as never);
      console.log('Sample draft campaign created.');
    }
  } else {
    console.log('Campaigns already exist — skipping sample.');
  }

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
