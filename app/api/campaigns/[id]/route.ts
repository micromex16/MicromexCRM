import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const Body = z.object({
  name: z.string().min(1).max(120).optional(),
  status: z.enum(['draft', 'live', 'paused', 'complete']).optional(),
  send_mode: z.enum(['auto', 'manual_review']).optional(),
  daily_send_cap: z.number().int().positive().max(500).optional(),
  template_id: z.string().uuid().optional(),
});

export async function PATCH(request: NextRequest, ctx: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const json = await request.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ error: 'invalid_body', issues: parsed.error.flatten() }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.status !== undefined) update.status = parsed.data.status;
  if (parsed.data.send_mode !== undefined) update.send_mode = parsed.data.send_mode;
  if (parsed.data.daily_send_cap !== undefined) update.daily_send_cap = parsed.data.daily_send_cap;
  if (parsed.data.template_id !== undefined) update.template_id = parsed.data.template_id;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no_fields_to_update' }, { status: 400 });
  }

  const { error } = await supabase.from('campaigns').update(update as never).eq('id', ctx.params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, ctx: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Hard delete the campaign row. The sends table has
  //   campaign_id uuid references campaigns(id) on delete set null
  // so historical sends are preserved with campaign_id=null — analytics
  // and lead-level email history stay intact.
  const { error } = await supabase.from('campaigns').delete().eq('id', ctx.params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
