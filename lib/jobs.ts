import { createServiceClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/types/database';

export type JobType =
  | 'research'
  | 'email_lookup'
  | 'score'
  | 'draft_email'
  | 'classify_reply';

export type JobTarget = 'company' | 'contact';

export interface EnqueueArgs {
  targetType: JobTarget;
  targetId: string;
  jobType: JobType;
  priority?: number;
  scheduledFor?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Enqueue an enrichment job. Service-role only (bypasses RLS).
 */
export async function enqueue(args: EnqueueArgs) {
  const supabase = createServiceClient();
  const { error } = await supabase.from('enrichment_jobs').insert({
    target_type: args.targetType,
    target_id: args.targetId,
    job_type: args.jobType,
    priority: args.priority ?? 5,
    scheduled_for: (args.scheduledFor ?? new Date()).toISOString(),
    metadata_json: args.metadata ?? null,
  } as never);
  if (error) throw new Error(`enqueue ${args.jobType}: ${error.message}`);
}

/**
 * Pull up to `limit` pending jobs that are due, mark them running, return them.
 * Uses a single UPDATE ... RETURNING under the hood via RPC if available, or
 * a select+update if not. For MVP we use select+update which is racy but fine
 * for a single cron worker.
 */
export async function dequeue(limit: number) {
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  // Pick pending jobs that are due.
  const { data: candidates, error: selErr } = await supabase
    .from('enrichment_jobs')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', now)
    .order('priority', { ascending: false })
    .order('scheduled_for', { ascending: true })
    .limit(limit);

  if (selErr) throw new Error(`dequeue select: ${selErr.message}`);
  if (!candidates || candidates.length === 0) return [];

  const ids = candidates.map((j: { id: string }) => j.id);
  const { error: updErr } = await supabase
    .from('enrichment_jobs')
    .update({ status: 'running', started_at: now, attempts: 1 } as never)
    .in('id', ids);

  if (updErr) throw new Error(`dequeue update: ${updErr.message}`);
  return candidates;
}

export async function markDone(id: string, result: Record<string, unknown>) {
  const supabase = createServiceClient();
  await supabase
    .from('enrichment_jobs')
    .update({
      status: 'done',
      finished_at: new Date().toISOString(),
      result_json: result,
    } as never)
    .eq('id', id);
}

export async function markFailed(id: string, error: string, attempts: number) {
  const supabase = createServiceClient();
  await supabase
    .from('enrichment_jobs')
    .update({
      status: attempts >= 3 ? 'failed' : 'pending',
      finished_at: new Date().toISOString(),
      error,
      attempts,
    } as never)
    .eq('id', id);
}
