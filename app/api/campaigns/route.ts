import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const Body = z.object({
  name: z.string().min(1).max(120),
  capability_bucket: z.enum(['electrical', 'refurb', 'packaging', 'mechanical']),
  template_id: z.string().uuid(),
  send_mode: z.enum(['auto', 'manual_review']).default('manual_review'),
  daily_send_cap: z.number().int().positive().max(500).default(50),
  segment_filter: z.record(z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = Body.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.flatten() },
      { status: 400 },
    );

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      name: parsed.data.name,
      capability_bucket: parsed.data.capability_bucket,
      template_id: parsed.data.template_id,
      send_mode: parsed.data.send_mode,
      daily_send_cap: parsed.data.daily_send_cap,
      segment_filter: parsed.data.segment_filter ?? {},
      status: 'draft',
      created_by: user.id,
    } as never)
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { id } = data as { id: string };
  return NextResponse.json({ ok: true, id });
}
