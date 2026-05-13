import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const Body = z.object({
  name: z.string().min(1).max(120).optional(),
  capability_bucket: z.enum(['electrical', 'refurb', 'packaging', 'mechanical']).optional(),
  variant_label: z.string().min(1).max(8).optional(),
  subject: z.string().min(1).max(200).optional(),
  body_md: z.string().min(1).max(5000).optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, ctx: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const json = await request.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  const { error } = await supabase
    .from('email_templates')
    .update(parsed.data as never)
    .eq('id', ctx.params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, ctx: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('email_templates')
    .update({ is_active: false } as never)
    .eq('id', ctx.params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
