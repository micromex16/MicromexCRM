import { NextResponse, type NextRequest } from 'next/server';
import { assertCron } from '@/lib/cron';
import { runDiscovery, type DiscoveryResult } from '@/lib/discovery/agent';
import { todaysTarget } from '@/lib/discovery/targets';
import { allActiveTargets } from '@/lib/discovery/all-targets';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Stop launching new targets once we're this close to Vercel's 300s ceiling
// (~250s leaves buffer for the last run's response + DB writes).
const DEADLINE_MS = 250_000;

export async function GET(request: NextRequest) {
  const auth = assertCron(request);
  if (auth) return auth;

  const startedAt = Date.now();
  const todays = todaysTarget();
  const all = await allActiveTargets();

  // Run today's rotation target FIRST so it always gets done, even if we
  // time out before finishing the rest of the targets.
  const ordered = [
    all.find((t) => t.id === todays.id),
    ...all.filter((t) => t.id !== todays.id),
  ].filter(Boolean) as typeof all;

  const results: Array<DiscoveryResult & { skipped?: string }> = [];
  for (const target of ordered) {
    if (Date.now() - startedAt > DEADLINE_MS) {
      results.push({
        target_id: target.id,
        candidates_returned: 0,
        companies_created: 0,
        companies_skipped_dedupe: 0,
        jobs_enqueued: 0,
        duration_ms: 0,
        errors: [],
        skipped: 'time_budget',
      });
      continue;
    }
    try {
      const r = await runDiscovery(target, { maxCandidates: 12, trigger: 'cron' });
      results.push(r);
    } catch (e) {
      results.push({
        target_id: target.id,
        candidates_returned: 0,
        companies_created: 0,
        companies_skipped_dedupe: 0,
        jobs_enqueued: 0,
        duration_ms: 0,
        errors: [e instanceof Error ? e.message : String(e)],
      });
    }
  }

  const totals = results.reduce(
    (acc, r) => {
      acc.companies_created += r.companies_created;
      acc.candidates_returned += r.candidates_returned;
      acc.jobs_enqueued += r.jobs_enqueued;
      acc.targets_run += r.skipped ? 0 : 1;
      acc.targets_skipped += r.skipped ? 1 : 0;
      return acc;
    },
    { companies_created: 0, candidates_returned: 0, jobs_enqueued: 0, targets_run: 0, targets_skipped: 0 },
  );

  return NextResponse.json({
    ok: true,
    totals,
    duration_ms: Date.now() - startedAt,
    results,
  });
}
