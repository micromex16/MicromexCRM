import { NextResponse, type NextRequest } from 'next/server';
import { assertCron } from '@/lib/cron';
import { buildAndSendDigest } from '@/lib/outreach/digest';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = assertCron(request);
  if (auth) return auth;
  const result = await buildAndSendDigest();
  return NextResponse.json(result);
}
