import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { draftEmail } from '@/lib/enrichment/draft';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Each draft is ~10-20s. Parallel 3 fits comfortably in 60s for ~3 batches.
const DEADLINE_MS = 50_000;
const PARALLEL = 3;

interface JobRow {
  id: string;
  target_id: string;
  metadata_json: { template_id?: string; campaign_id?: string } | null;
  attempts: number;
}

/**
 * Drain pending draft_email jobs for THIS campaign — parallel batches until
 * we hit the time budget. Whatever's left stays pending (next click drains
 * more). Returns counts so the UI can show progress.
 */
export async function POST(_request: NextRequest, ctx: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const adminDb = createServiceClient();

  // Pull pending draft_email jobs whose metadata_json.campaign_id matches.
  const { data: jobs } = await adminDb
    .from('enrichment_jobs')
    .select('id, target_id, metadata_json, attempts')
    .eq('job_type', 'draft_email')
    .eq('status', 'pending')
    .filter('metadata_json->>campaign_id', 'eq', ctx.params.id)
    .order('priority', { ascending: false })
    .order('scheduled_for', { ascending: true })
    .limit(200);

  const list = (jobs ?? []) as JobRow[];
  if (list.length === 0) {
    return NextResponse.json({ ok: true, total: 0, drafted: 0, failed: 0, remaining: 0 });
  }

  const startedAt = Date.now();
  const todo = [...list];
  let drafted = 0;
  let failed = 0;
  const errors: string[] = [];

  while (todo.length > 0 && Date.now() - startedAt < DEADLINE_MS - 15_000) {
    const batch = todo.splice(0, PARALLEL);

    // Mark this batch as running to prevent the cron from picking them up
    const nowIso = new Date().toISOString();
    await adminDb
      .from('enrichment_jobs')
      .update({ status: 'running', started_at: nowIso, attempts: 1 } as never)
      .in('id', batch.map((j) => j.id));

    const results = await Promise.allSettled(
      batch.map((j) => {
        const templateId = j.metadata_json?.template_id;
        if (!templateId) {
          return Promise.reject(new Error('job missing metadata.template_id'));
        }
        return draftEmail({
          contactId: j.target_id,
          templateId,
          persist: true,
          campaignId: ctx.params.id,
        });
      }),
    );

    for (let i = 0; i < results.length; i++) {
      const job = batch[i];
      const r = results[i];
      if (r.status === 'fulfilled') {
        await adminDb
          .from('enrichment_jobs')
          .update({
            status: 'done',
            finished_at: new Date().toISOString(),
            result_json: { send_id: r.value.send_id } as never,
          } as never)
          .eq('id', job.id);
        drafted++;
      } else {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        await adminDb
          .from('enrichment_jobs')
          .update({
            status: job.attempts >= 3 ? 'failed' : 'pending',
            finished_at: new Date().toISOString(),
            error: msg,
            attempts: job.attempts + 1,
          } as never)
          .eq('id', job.id);
        failed++;
        errors.push(`${job.target_id}: ${msg}`);
      }
    }
  }

  // Count remaining pending jobs for this campaign so the UI can prompt to
  // run again if there's more to drain.
  const { count: remaining } = await adminDb
    .from('enrichment_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('job_type', 'draft_email')
    .eq('status', 'pending')
    .filter('metadata_json->>campaign_id', 'eq', ctx.params.id);

  return NextResponse.json({
    ok: true,
    total: list.length,
    drafted,
    failed,
    remaining: remaining ?? 0,
    errors: errors.slice(0, 5),
  });
}

/** GET — return the pending count so the campaign detail page can render a banner. */
export async function GET(_request: NextRequest, ctx: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { count } = await supabase
    .from('enrichment_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('job_type', 'draft_email')
    .eq('status', 'pending')
    .filter('metadata_json->>campaign_id', 'eq', ctx.params.id);

  return NextResponse.json({ pending: count ?? 0 });
}
