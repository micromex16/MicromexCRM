import { Resend } from 'resend';
import { env } from '@/lib/env';

let _client: Resend | null = null;

export function resend(): Resend {
  if (_client) return _client;
  const e = env();
  if (!e.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is required to send email');
  }
  _client = new Resend(e.RESEND_API_KEY);
  return _client;
}

export function defaultFrom(): string {
  const e = env();
  const email = e.RESEND_FROM_EMAIL ?? 'noreply@micromex.com';
  const name = e.RESEND_FROM_NAME;
  return name ? `${name} <${email}>` : email;
}
