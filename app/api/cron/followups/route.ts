import { NextResponse, type NextRequest } from 'next/server';
import { assertCron } from '@/lib/cron';
import { queueFollowups } from '@/lib/outreach/followup';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = assertCron(request);
  if (auth) return auth;

  try {
    const result = await queueFollowups();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
