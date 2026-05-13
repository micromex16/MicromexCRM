import { createServiceClient } from '@/lib/supabase/server';
import { resend, defaultFrom } from '@/lib/resend';
import { env } from '@/lib/env';

export async function buildAndSendDigest(): Promise<{ ok: boolean; recipient: string | null; html_bytes: number }> {
  const e = env();
  const recipient = e.DIGEST_RECIPIENT ?? null;
  if (!recipient) return { ok: false, recipient, html_bytes: 0 };
  if (!e.RESEND_API_KEY) return { ok: false, recipient, html_bytes: 0 };

  const html = await composeDigestHtml();
  const r = await resend().emails.send({
    from: defaultFrom(),
    to: recipient,
    subject: `Micromex Lead Engine — daily digest ${new Date().toISOString().slice(0, 10)}`,
    html,
  });
  return { ok: !r.error, recipient, html_bytes: html.length };
}

export async function composeDigestHtml(): Promise<string> {
  const supabase = createServiceClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [replies, hotLeads, sendsStats] = await Promise.all([
    supabase
      .from('sends')
      .select('id, subject_rendered, replied_at, reply_classification, reply_body, contacts(first_name,last_name,email), companies(name)')
      .gte('replied_at', since)
      .order('replied_at', { ascending: false })
      .limit(20),
    supabase.from('v_hot_leads').select('*').limit(10),
    supabase
      .from('sends')
      .select('status')
      .gte('created_at', since),
  ]);

  const replyRows = (replies.data ?? []) as Array<{
    id: string;
    subject_rendered: string;
    replied_at: string;
    reply_classification: string | null;
    reply_body: string | null;
    contacts: { first_name: string | null; last_name: string | null; email: string | null };
    companies: { name: string };
  }>;
  const hotRows = (hotLeads.data ?? []) as Array<{
    id: string;
    name: string;
    domain: string | null;
    industry_segment: string | null;
    fit_score: number | null;
    tariff_exposure_score: number | null;
  }>;
  const stats = countByStatus((sendsStats.data ?? []) as { status: string }[]);

  const parts: string[] = [];
  parts.push(`<!doctype html><html><body style="font-family:-apple-system,Inter,Arial,sans-serif;color:#0A284C;max-width:680px;margin:0 auto;padding:24px">`);
  parts.push(`<h1 style="font-size:20px;margin:0 0 4px 0">Micromex Lead Engine — daily digest</h1>`);
  parts.push(`<div style="color:#789FD3;font-size:12px;margin-bottom:24px">${new Date().toUTCString()}</div>`);

  // Stats
  parts.push(`<table style="width:100%;border-collapse:collapse;margin-bottom:24px">
    <tr>
      ${statCell('Sent (24h)', stats.sent + stats.queued)}
      ${statCell('Replied', replyRows.length, '#F2A93B')}
      ${statCell('Bounced', stats.bounced)}
      ${statCell('Failed', stats.failed)}
    </tr>
  </table>`);

  // Replies
  parts.push(`<h2 style="font-size:14px;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:1px;color:#103768">Replies (last 24h)</h2>`);
  if (replyRows.length === 0) {
    parts.push(`<p style="color:#999">No replies overnight.</p>`);
  } else {
    parts.push(`<table style="width:100%;border-collapse:collapse;margin-bottom:24px">`);
    for (const r of replyRows) {
      const cls = (r.reply_classification ?? 'unknown').toUpperCase();
      const clsColor = classColor(r.reply_classification);
      parts.push(`<tr style="border-bottom:1px solid #eee">
        <td style="padding:8px 0;vertical-align:top">
          <strong>${escapeHtml(r.companies?.name ?? 'Unknown')}</strong><br/>
          <span style="font-size:12px;color:#666">${escapeHtml(r.contacts?.first_name ?? '')} ${escapeHtml(r.contacts?.last_name ?? '')} · ${escapeHtml(r.contacts?.email ?? '')}</span><br/>
          <span style="font-size:12px;color:#888">${escapeHtml(r.subject_rendered)}</span>
        </td>
        <td style="padding:8px 0;vertical-align:top;text-align:right;width:120px">
          <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;background:${clsColor};color:white;font-weight:600">${cls}</span>
        </td>
      </tr>`);
    }
    parts.push(`</table>`);
  }

  // Hot leads
  parts.push(`<h2 style="font-size:14px;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:1px;color:#103768">Top 10 hot leads</h2>`);
  if (hotRows.length === 0) {
    parts.push(`<p style="color:#999">No qualified leads yet — run an ingest job.</p>`);
  } else {
    parts.push(`<table style="width:100%;border-collapse:collapse">`);
    for (const h of hotRows) {
      parts.push(`<tr style="border-bottom:1px solid #eee">
        <td style="padding:8px 0">
          <strong>${escapeHtml(h.name)}</strong>
          <span style="color:#888;font-size:12px">${escapeHtml(h.domain ?? '')}</span>
        </td>
        <td style="padding:8px 0;text-align:right;width:120px">
          <span style="display:inline-block;padding:2px 8px;border-radius:4px;background:#1F5BA8;color:white;font-size:12px;font-weight:600">${h.fit_score ?? 0}</span>
        </td>
      </tr>`);
    }
    parts.push(`</table>`);
  }

  parts.push(`<p style="margin-top:32px;color:#999;font-size:11px">Micromex · Est. 1988 · USMCA contract manufacturer</p>`);
  parts.push(`</body></html>`);
  return parts.join('\n');
}

function statCell(label: string, n: number, accent = '#1F5BA8') {
  return `<td style="padding:12px;background:#EEF4FB;border-radius:6px;text-align:center">
    <div style="font-size:22px;font-weight:700;color:${accent}">${n}</div>
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#789FD3">${label}</div>
  </td>`;
}

function countByStatus(rows: { status: string }[]) {
  const acc = { sent: 0, queued: 0, bounced: 0, failed: 0, replied: 0, opened: 0, other: 0 };
  for (const r of rows) {
    if (r.status in acc) (acc as Record<string, number>)[r.status]++;
    else acc.other++;
  }
  return acc;
}

function classColor(cls: string | null | undefined): string {
  switch (cls) {
    case 'interested':
      return '#10b981';
    case 'not_now':
      return '#f59e0b';
    case 'not_a_fit':
      return '#6b7280';
    case 'unsubscribe':
      return '#ef4444';
    case 'auto_oof':
      return '#94a3b8';
    default:
      return '#475569';
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
