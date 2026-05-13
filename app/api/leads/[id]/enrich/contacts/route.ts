import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enrichContacts } from '@/lib/ingest/enrich-contacts';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(_request: NextRequest, ctx: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const r = await enrichContacts(ctx.params.id);
    return NextResponse.json({
      ok: true,
      added: r.count,
      source: r.source,
      reason: r.reason,
      hint: r.hint,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
