import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const Body = z.object({ body: z.string().min(1).max(2000) });

export async function POST(request: NextRequest, ctx: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const json = await request.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  const { error } = await supabase.from('activities').insert({
    company_id: ctx.params.id,
    type: 'note',
    body: parsed.data.body,
    actor: user.email ?? 'user',
  } as never);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase
    .from('companies')
    .update({ last_activity_at: new Date().toISOString() } as never)
    .eq('id', ctx.params.id);

  return NextResponse.json({ ok: true });
}
