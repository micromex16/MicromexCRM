import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enqueue } from '@/lib/jobs';

export const runtime = 'nodejs';

export async function POST(_request: NextRequest, ctx: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const id = ctx.params.id;

  try {
    await enqueue({ targetType: 'company', targetId: id, jobType: 'research', priority: 9 });
    await enqueue({ targetType: 'company', targetId: id, jobType: 'email_lookup', priority: 8 });
    await enqueue({ targetType: 'company', targetId: id, jobType: 'score', priority: 6 });
    return NextResponse.json({ ok: true, enqueued: 3 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'enqueue failed' },
      { status: 500 },
    );
  }
}
