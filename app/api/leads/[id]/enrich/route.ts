import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runResearch } from '@/lib/enrichment/research';
import { runScore } from '@/lib/enrichment/score';
import { enrichContacts } from '@/lib/ingest/enrich-contacts';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Manual enrichment trigger from the lead-detail action rail.
 * Runs the three steps SYNCHRONOUSLY (research → contacts → score) so the
 * user sees results in ~30-90s instead of waiting for the daily cron tick.
 */
export async function POST(_request: NextRequest, ctx: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const id = ctx.params.id;
  const results: Record<string, unknown> = {};
  const errors: string[] = [];

  // 1. Research (needs to happen first — score depends on it)
  try {
    const r = await runResearch(id);
    results.research = {
      capability: r.intelligence?.primary_capability_match,
      tariff_exposure_pct: r.intelligence?.tariff_exposure_pct_estimate,
    };
  } catch (e) {
    errors.push(`research: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2. Contact lookup (best-effort; needs APOLLO/HUNTER key to do anything real)
  try {
    const r = await enrichContacts(id);
    results.contacts = {
      added: r.count,
      source: r.source,
      reason: r.reason,
      hint: r.hint,
    };
    if (r.reason !== 'ok' && r.count === 0) {
      errors.push(`contacts: ${r.hint ?? r.reason}`);
    }
  } catch (e) {
    errors.push(`email_lookup: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 3. Score (only runs if research succeeded)
  if (results.research) {
    try {
      const r = await runScore(id);
      results.score = { fit_score: r.fit_score, rationale: r.rationale };
    } catch (e) {
      errors.push(`score: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    errors.push('score: skipped (research failed)');
  }

  const succeeded = Object.keys(results).length;
  return NextResponse.json({
    ok: succeeded > 0,
    succeeded,
    failed: errors.length,
    results,
    errors,
  });
}
