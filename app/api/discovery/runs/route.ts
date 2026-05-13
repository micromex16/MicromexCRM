import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
  const targetId = url.searchParams.get('target_id');

  let query = supabase
    .from('discovery_runs')
    .select('id, target_id, trigger, candidates_returned, companies_created, companies_skipped_dedupe, jobs_enqueued, duration_ms, errors, created_at, created_by, profiles(email, full_name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (targetId) query = query.eq('target_id', targetId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ runs: data ?? [] });
}
