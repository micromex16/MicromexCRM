import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * One-shot debug endpoint: hits Hunter directly from this server runtime
 * and returns the raw response. Used to verify the HUNTER_API_KEY env var
 * is correctly stored on Vercel (no trailing whitespace, no truncation)
 * and that Hunter responds to Vercel's outbound IPs the same way it
 * responds to our laptop.
 *
 *   GET /api/debug/hunter?domain=sugatsune.com
 */
export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const domain = url.searchParams.get('domain') ?? 'sugatsune.com';

  const rawKey = process.env.HUNTER_API_KEY ?? '';
  const key = rawKey.trim();
  const keyMeta = {
    present: Boolean(rawKey),
    length: rawKey.length,
    trimmed_length: key.length,
    had_whitespace: rawKey !== key,
    starts_with: rawKey.slice(0, 4),
    ends_with: rawKey.slice(-4),
  };

  if (!key) {
    return NextResponse.json({ ok: false, error: 'HUNTER_API_KEY not set on this deployment', keyMeta });
  }

  const target = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=10&api_key=${encodeURIComponent(key)}`;
  const targetSafe = target.replace(key, '***');

  try {
    const res = await fetch(target);
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 500);
    }
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      target: targetSafe,
      keyMeta,
      body,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      target: targetSafe,
      keyMeta,
    });
  }
}
