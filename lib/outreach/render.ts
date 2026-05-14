import { createHmac } from 'node:crypto';
import { publicEnv } from '@/lib/env';

export interface RenderInput {
  subject: string;
  body: string;
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    title: string | null;
    email: string | null;
  };
  company: {
    id: string;
    name: string;
    domain: string | null;
  };
  shipments_summary?: {
    top_hts_description: string | null;
    top_origin_country: string | null;
  } | null;
  /** send_id, when known, is used to generate a per-send unsubscribe token. */
  sendId?: string | null;
}

export interface RenderedEmail {
  subject: string;
  body_text: string;
  body_html: string;
}

const FALLBACKS: Record<string, string> = {
  'contact.first_name': 'there',
  'contact.last_name': '',
  'contact.title': '',
  'company.name': 'your team',
  'company.domain': '',
  'shipments.top_hts_description': 'imported components',
  'shipments.top_origin_country': 'China',
};

export function renderTemplate(input: RenderInput): RenderedEmail {
  const subject = applyTags(input.subject, input);
  let bodyMd = applyTags(input.body, input);

  // Strip any trailing first-name sign-off Claude habitually adds
  // ("Giovanni" / "— Giovanni" / "Best, Giovanni") — we append a proper
  // signature block below instead.
  bodyMd = stripTrailingSignoff(bodyMd);

  const signature = renderSignature();
  const footer = renderFooter(input.sendId ?? null);
  const body_text = `${bodyMd}\n\n${signature.text}\n\n${footer.text}`;
  const body_html = `${mdToHtml(bodyMd)}\n${signature.html}\n${footer.html}`;

  return { subject, body_text, body_html };
}

function stripTrailingSignoff(body: string): string {
  // Conservative: only strip if the LAST non-empty line is a short closing
  // (e.g. just "Giovanni" or "— Giovanni" or "Best, Giovanni") — leaves
  // longer trailing paragraphs alone.
  const lines = body.split('\n');
  let i = lines.length - 1;
  while (i >= 0 && lines[i].trim() === '') i--;
  if (i < 0) return body;
  const last = lines[i].trim();
  const SIGNOFF_RE =
    /^(?:[—-]\s*)?(?:Thanks(?:[,!.])?|Best(?:[,!.])?|Cheers(?:[,!.])?|Best regards(?:[,!.])?|Regards(?:[,!.])?|Sincerely(?:[,!.])?)?\s*[—-]?\s*Giovanni(?:\s+(?:Garcin|Hernandez))?(?:,?\s+Micromex)?\.?$/i;
  if (SIGNOFF_RE.test(last)) {
    // also drop any blank line directly above
    let cut = i;
    while (cut > 0 && lines[cut - 1].trim() === '') cut--;
    return lines.slice(0, cut).join('\n').replace(/\s+$/, '');
  }
  return body;
}

function applyTags(template: string, input: RenderInput): string {
  return template.replace(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi, (_, raw: string) => {
    const path = raw.trim();
    const val = lookup(path, input);
    if (val === null || val === undefined || val === '') {
      return FALLBACKS[path] ?? '';
    }
    return val;
  });
}

function lookup(path: string, input: RenderInput): string | null {
  switch (path) {
    case 'contact.first_name':
      return input.contact.first_name;
    case 'contact.last_name':
      return input.contact.last_name;
    case 'contact.title':
      return input.contact.title;
    case 'company.name':
      return input.company.name;
    case 'company.domain':
      return input.company.domain;
    case 'shipments.top_hts_description':
      return input.shipments_summary?.top_hts_description ?? null;
    case 'shipments.top_origin_country':
      return input.shipments_summary?.top_origin_country ?? null;
    default:
      return null;
  }
}

function mdToHtml(md: string): string {
  // Minimal: convert blank lines to <br/><br/>, escape HTML.
  const esc = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<p>${esc.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;
}

const POSTAL_ADDRESS =
  'Micromex · 1234 N Stone Ave, Tucson AZ 85705, USA · Imuris, Sonora, MX · Est. 1988';

function renderSignature(): { text: string; html: string } {
  const name = process.env.RESEND_FROM_NAME ?? 'Giovanni Garcin';
  const title = process.env.SIGNATURE_TITLE ?? 'President';
  const company = process.env.SIGNATURE_COMPANY ?? 'Micromex';
  const linkedin = process.env.SIGNATURE_LINKEDIN ?? 'https://www.linkedin.com/in/giovannigarcin/';
  const website = process.env.SIGNATURE_WEBSITE ?? 'https://micromex.com';
  const websiteLabel = website.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const text = `${name}\n${title}\n${company}\n${linkedin}\n${websiteLabel}`;

  // Inline LinkedIn "in" badge (SVG-as-data-URL fallback) for clients that
  // strip remote images. Most modern clients accept the hosted PNG too;
  // we use a tiny PNG-style hosted icon and provide alt text.
  const html = `<table cellpadding="0" cellspacing="0" border="0" style="font-family:-apple-system,Segoe UI,Inter,Arial,sans-serif">
  <tr><td style="padding-top:16px">
    <div style="font-size:14px;font-weight:600;color:#0A284C">${escape(name)}</div>
    <div style="font-size:13px;color:#5b6b80;margin-top:1px">${escape(title)}, ${escape(company)}</div>
    <div style="font-size:13px;margin-top:8px;line-height:1.5">
      <a href="${escape(linkedin)}" style="color:#0A66C2;text-decoration:none;display:inline-block;vertical-align:middle" target="_blank" rel="noopener">
        <span style="display:inline-block;background:#0A66C2;color:#ffffff;font-weight:700;font-size:11px;padding:2px 5px;border-radius:3px;vertical-align:middle;font-family:Arial,sans-serif;letter-spacing:0.5px">in</span>
        <span style="vertical-align:middle;margin-left:6px">LinkedIn</span>
      </a>
      <span style="color:#cbd5e1;margin:0 8px">·</span>
      <a href="${escape(website)}" style="color:#1F5BA8;text-decoration:none" target="_blank" rel="noopener">${escape(websiteLabel)}</a>
    </div>
  </td></tr>
</table>`;

  return { text, html };
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderFooter(sendId: string | null): { text: string; html: string } {
  const appUrl = publicEnv.appUrl;
  const token = sendId ? unsubscribeToken(sendId) : null;
  const unsubUrl = token ? `${appUrl}/u/${token}` : `${appUrl}/u/none`;

  const text = `--\n${POSTAL_ADDRESS}\nUnsubscribe: ${unsubUrl}`;
  const html = `<hr style="border:none;border-top:1px solid #ddd;margin:24px 0 8px 0"/>
<p style="font-size:11px;color:#666;font-family:Arial,sans-serif;line-height:1.5">
  ${POSTAL_ADDRESS}<br/>
  <a href="${unsubUrl}" style="color:#666">Unsubscribe</a>
</p>`;

  return { text, html };
}

export function unsubscribeToken(sendId: string): string {
  const secret = process.env.RESEND_WEBHOOK_SECRET ?? 'dev-secret';
  const mac = createHmac('sha256', secret).update(sendId).digest('hex').slice(0, 16);
  return `${sendId}.${mac}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const [sendId, mac] = token.split('.');
  if (!sendId || !mac) return null;
  const expected = unsubscribeToken(sendId);
  return expected === token ? sendId : null;
}
