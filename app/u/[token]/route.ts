import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyUnsubscribeToken } from '@/lib/outreach/render';
import { suppress } from '@/lib/outreach/suppression';

export const runtime = 'nodejs';

const HTML_OK = (msg: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Unsubscribed</title>
<style>body{font-family:-apple-system,Inter,Arial,sans-serif;max-width:520px;margin:64px auto;padding:24px;color:#0A284C}
h1{font-size:22px;margin:0 0 12px 0} p{color:#666;line-height:1.5} a{color:#1F5BA8}</style></head>
<body><h1>${msg}</h1><p>You won't receive any more outreach from Micromex. If this was a mistake, reply to any previous email and we'll restore you.</p>
<p style="margin-top:32px;font-size:11px;color:#999">Micromex · Est. 1988 · USMCA contract manufacturer</p></body></html>`;

const HTML_BAD = `<!doctype html><html><head><meta charset="utf-8"><title>Invalid link</title>
<style>body{font-family:-apple-system,Inter,Arial,sans-serif;max-width:520px;margin:64px auto;padding:24px;color:#0A284C}
h1{font-size:22px;margin:0 0 12px 0} p{color:#666}</style></head>
<body><h1>Unsubscribe link is invalid or expired.</h1>
<p>Please reply directly to any previous email to be removed.</p></body></html>`;

export async function GET(_request: NextRequest, ctx: { params: { token: string } }) {
  const token = ctx.params.token;
  if (!token || token === 'none') {
    return new NextResponse(HTML_BAD, { status: 400, headers: { 'content-type': 'text/html' } });
  }
  const sendId = verifyUnsubscribeToken(token);
  if (!sendId) {
    return new NextResponse(HTML_BAD, { status: 400, headers: { 'content-type': 'text/html' } });
  }

  const supabase = createServiceClient();
  const { data: send } = await supabase
    .from('sends')
    .select('id, contact_id, contacts(email)')
    .eq('id', sendId)
    .maybeSingle();

  if (!send) {
    return new NextResponse(HTML_BAD, { status: 404, headers: { 'content-type': 'text/html' } });
  }
  const s = send as { id: string; contact_id: string; contacts: { email: string | null } };
  const email = s.contacts?.email;

  if (email) {
    await suppress({ email, reason: 'user_unsubscribe' });
  }
  await supabase
    .from('sends')
    .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() } as never)
    .eq('id', sendId);

  return new NextResponse(HTML_OK("You're unsubscribed."), {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });
}
