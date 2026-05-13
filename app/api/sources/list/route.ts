import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Group by source + day for the last 30 days.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('shipments')
    .select('source, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const buckets = new Map<string, { source: string; day: string; count: number }>();
  for (const row of (data ?? []) as { source: string; created_at: string }[]) {
    const day = row.created_at.slice(0, 10);
    const key = `${row.source}:${day}`;
    const b = buckets.get(key);
    if (b) b.count++;
    else buckets.set(key, { source: row.source, day, count: 1 });
  }

  const runs = Array.from(buckets.values()).sort((a, b) => b.day.localeCompare(a.day));
  return NextResponse.json({ runs });
}
