import { NextResponse, type NextRequest } from 'next/server';

/**
 * Verifies a cron request.
 * Vercel cron requests include `Authorization: Bearer <CRON_SECRET>` automatically
 * when the env var is set in the project. We also accept an `x-cron-secret` header
 * for local testing.
 */
export function assertCron(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'CRON_SECRET not configured' },
        { status: 500 },
      );
    }
    return null; // dev: allow
  }
  const auth = request.headers.get('authorization');
  const xcron = request.headers.get('x-cron-secret');
  const expected = `Bearer ${secret}`;
  if (auth === expected || xcron === secret) return null;
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}
