import { NextResponse, type NextRequest } from 'next/server';
import { assertCron } from '@/lib/cron';
import { createServiceClient } from '@/lib/supabase/server';
import { enqueue } from '@/lib/jobs';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = assertCron(request);
  if (auth) return auth;

  const supabase = createServiceClient();

  // Re-score companies with research but stale fit_score (>7d).
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('companies')
    .select('id, updated_at, fit_score, research_summary')
    .not('research_summary', 'is', null)
    .lt('updated_at', cutoff)
    .limit(100);

  let enqueued = 0;
  for (const c of (data ?? []) as { id: string }[]) {
    try {
      await enqueue({ targetType: 'company', targetId: c.id, jobType: 'score', priority: 3 });
      enqueued++;
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json({ enqueued });
}
