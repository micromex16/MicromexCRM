import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { runDiscovery } from '@/lib/discovery/agent';
import { DISCOVERY_TARGETS, targetById } from '@/lib/discovery/targets';

export const runtime = 'nodejs';
export const maxDuration = 300;

const Body = z.object({
  target_id: z.string().min(1),
  max_candidates: z.number().int().min(1).max(25).default(10),
});

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

  const target = targetById(parsed.data.target_id);
  if (!target) {
    return NextResponse.json(
      { error: 'unknown_target', valid: DISCOVERY_TARGETS.map((t) => t.id) },
      { status: 400 },
    );
  }

  try {
    const result = await runDiscovery(target, {
      maxCandidates: parsed.data.max_candidates,
      trigger: 'manual',
      createdBy: user.id,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    targets: DISCOVERY_TARGETS.map((t) => ({
      id: t.id,
      capability: t.capability,
      industry_segment: t.industry_segment,
      revenue_band: t.revenue_band,
      description: t.description,
    })),
  });
}
