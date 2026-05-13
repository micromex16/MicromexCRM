import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { runLookalike } from '@/lib/discovery/lookalike';

export const runtime = 'nodejs';
export const maxDuration = 300;

const Body = z.object({
  company_id: z.string().uuid(),
  max_candidates: z.number().int().min(1).max(20).default(8),
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

  try {
    const result = await runLookalike(parsed.data.company_id, {
      maxCandidates: parsed.data.max_candidates,
      createdBy: user.id,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
