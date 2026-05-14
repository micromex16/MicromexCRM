import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyUnsubscribeToken } from '@/lib/outreach/render';
import { suppress } from '@/lib/outreach/suppression';

export const runtime = 'nodejs';

// GET is intentionally non-destructive (just shows a confirmation page) —
// email security scanners auto-follow every link in incoming emails to
// check for malicious URLs, which used to instantly auto-unsubscribe
// every recipient at companies running Mimecast / Proofpoint / etc.
// Only POST (form submit) actually unsubscribes — scanners don't submit
// forms. This is the same pattern Mailchimp / SendGrid use.

const wrapHtml = (title: string, body: string, status: number) =>
  new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>
  body{font-family:-apple-system,Inter,Arial,sans-serif;max-width:520px;margin:64px auto;padding:24px;color:#0A284C}
  h1{font-size:22px;margin:0 0 16px 0}
  p{color:#5b6b80;line-height:1.55;margin:0 0 12px 0}
  form{margin-top:24px}
  button{display:inline-block;padding:10px 18px;border-radius:6px;border:none;cursor:pointer;font-size:14px;font-weight:600;font-family:inherit}
  .btn-primary{background:#1F5BA8;color:white}
  .btn-primary:hover{background:#174887}
  .btn-secondary{background:transparent;color:#5b6b80;margin-left:8px}
  .footer{margin-top:32px;font-size:11px;color:#94a3b8}
  .ok-banner{background:#ecfdf5;border:1px solid #bbf7d0;color:#065f46;padding:12px 14px;border-radius:6px;margin-bottom:16px;font-size:14px}
</style>
</head><body>${body}<div class="footer">Micromex · Est. 1988 · USMCA contract manufacturer · giovanni@micromex.com</div></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );

const HTML_BAD = `<h1>Unsubscribe link is invalid or expired.</h1>
<p>If you'd like to be removed from Micromex outreach, reply directly to any previous email and we'll take care of it.</p>`;

function htmlConfirm(token: string, email: string) {
  return `<h1>Unsubscribe from Micromex outreach?</h1>
<p>We'll stop sending to <strong>${escapeHtml(email)}</strong>. You can always reply to any previous email to be reinstated.</p>
<form method="POST" action="/u/${encodeURIComponent(token)}">
  <button type="submit" class="btn-primary">Yes, unsubscribe me</button>
  <button type="button" class="btn-secondary" onclick="window.close();history.back();">Cancel</button>
</form>`;
}

function htmlDone(email: string) {
  return `<div class="ok-banner">You've been unsubscribed.</div>
<h1>Done — you won't hear from us again.</h1>
<p>We've removed <strong>${escapeHtml(email)}</strong> from our outreach. If this was a mistake, reply to any previous email and we'll restore you.</p>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function lookupSend(token: string) {
  if (!token || token === 'none') return null;
  const sendId = verifyUnsubscribeToken(token);
  if (!sendId) return null;
  const supabase = createServiceClient();
  const { data: send } = await supabase
    .from('sends')
    .select('id, contact_id, contacts(email)')
    .eq('id', sendId)
    .maybeSingle();
  if (!send) return null;
  const s = send as { id: string; contact_id: string; contacts: { email: string | null } | null };
  return { sendId: s.id, email: s.contacts?.email ?? null };
}

/** Non-destructive: just shows a confirm form. Safe for scanner pre-fetch. */
export async function GET(_request: NextRequest, ctx: { params: { token: string } }) {
  const found = await lookupSend(ctx.params.token);
  if (!found) return wrapHtml('Invalid link', HTML_BAD, 400);
  return wrapHtml(
    'Unsubscribe',
    htmlConfirm(ctx.params.token, found.email ?? 'this address'),
    200,
  );
}

/** Actually unsubscribes — only fires on form submit, not scanner pre-fetch. */
export async function POST(_request: NextRequest, ctx: { params: { token: string } }) {
  const found = await lookupSend(ctx.params.token);
  if (!found) return wrapHtml('Invalid link', HTML_BAD, 400);

  const supabase = createServiceClient();
  if (found.email) {
    await suppress({ email: found.email, reason: 'user_unsubscribe' });
  }
  await supabase
    .from('sends')
    .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() } as never)
    .eq('id', found.sendId);

  return wrapHtml('Unsubscribed', htmlDone(found.email ?? 'this address'), 200);
}
