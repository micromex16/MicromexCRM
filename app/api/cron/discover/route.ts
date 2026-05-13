import { NextResponse, type NextRequest } from 'next/server';
import { assertCron } from '@/lib/cron';
import { runDiscovery } from '@/lib/discovery/agent';
import { todaysTarget } from '@/lib/discovery/targets';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = assertCron(request);
  if (auth) return auth;

  const target = todaysTarget();
  try {
    const result = await runDiscovery(target, { maxCandidates: 10 });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        target_id: target.id,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
