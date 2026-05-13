import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createCustomTarget, loadCustomTargets } from '@/lib/discovery/custom-targets';
import { DISCOVERY_TARGETS } from '@/lib/discovery/targets';

export const runtime = 'nodejs';

const Body = z.object({
  slug: z.string().min(2).max(50),
  capability: z.enum(['electrical', 'refurb', 'packaging', 'mechanical']),
  industry_segment: z.string().min(2).max(120),
  description: z.string().max(800).default(''),
  import_origins: z.array(z.string()).max(10).default(['China']),
  revenue_band: z.string().max(40).default('$5M-$200M'),
  search_hints: z.array(z.string()).max(10).default([]),
  product_signals: z.array(z.string()).max(10).default([]),
});

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const custom = await loadCustomTargets();
  return NextResponse.json({
    built_in: DISCOVERY_TARGETS,
    custom,
  });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const json = await request.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const r = await createCustomTarget(parsed.data, user.id);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
