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
  const bodyMd = applyTags(input.body, input);

  const footer = renderFooter(input.sendId ?? null);
  const body_text = `${bodyMd}\n\n${footer.text}`;
  const body_html = `${mdToHtml(bodyMd)}\n${footer.html}`;

  return { subject, body_text, body_html };
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
