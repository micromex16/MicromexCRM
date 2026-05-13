import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(n: number | null | undefined, opts: { compact?: boolean } = {}) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: opts.compact ? 'compact' : 'standard',
    maximumFractionDigits: opts.compact ? 1 : 0,
  }).format(n);
}

export function formatNumber(n: number | null | undefined, opts: { compact?: boolean } = {}) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    notation: opts.compact ? 'compact' : 'standard',
    maximumFractionDigits: opts.compact ? 1 : 0,
  }).format(n);
}

export function formatPct(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${Math.round(n)}%`;
}

export function initials(name: string | null | undefined) {
  if (!name) return '··';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');
}

export function domainFromEmail(email: string | null | undefined) {
  if (!email) return null;
  const at = email.indexOf('@');
  return at === -1 ? null : email.slice(at + 1).toLowerCase();
}

export function assertDefined<T>(v: T | null | undefined, msg = 'value was nullish'): T {
  if (v === null || v === undefined) throw new Error(msg);
  return v;
}

export async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
