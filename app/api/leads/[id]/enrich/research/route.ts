import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runResearch } from '@/lib/enrichment/research';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(_request: NextRequest, ctx: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const r = await runResearch(ctx.params.id);
    return NextResponse.json({
      ok: true,
      capability: r.intelligence?.primary_capability_match,
      tariff_exposure_pct: r.intelligence?.tariff_exposure_pct_estimate,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
