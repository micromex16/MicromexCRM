import { NextResponse, type NextRequest } from 'next/server';
import { assertCron } from '@/lib/cron';
import { dequeue, markDone, markFailed } from '@/lib/jobs';
import { dispatch, type JobRow } from '@/lib/enrichment/router';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = assertCron(request);
  if (auth) return auth;

  const e = env();
  let jobs: JobRow[] = [];
  try {
    jobs = (await dequeue(e.ENRICHMENT_BATCH_SIZE)) as unknown as JobRow[];
  } catch (err) {
    return NextResponse.json(
      { error: 'dequeue_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  let succeeded = 0;
  let failed = 0;
  const errors: { id: string; type: string; error: string }[] = [];

  for (const job of jobs) {
    try {
      const result = await dispatch(job);
      await markDone(job.id, result);
      succeeded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await markFailed(job.id, msg, job.attempts);
      errors.push({ id: job.id, type: job.job_type, error: msg });
      failed++;
    }
  }

  return NextResponse.json({ processed: jobs.length, succeeded, failed, errors });
}
