/**
 * Normalize a company name to a dedupe key.
 * Strips common suffixes (Inc, LLC, Ltd, Corp, Co), punctuation, lowercases.
 */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[,.()]/g, ' ')
    .replace(/\b(inc|incorporated|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|holdings|group|the)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract a domain from a URL or text. Returns null if none found.
 */
export function extractDomain(text: string | null | undefined): string | null {
  if (!text) return null;
  // Try URL parse
  try {
    const u = new URL(text.startsWith('http') ? text : `https://${text}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    // Maybe a bare domain inside text
    const m = text.match(/\b([a-z0-9-]+\.)+[a-z]{2,}\b/i);
    if (m) return m[0].toLowerCase();
    return null;
  }
}

/**
 * Guess the dominant capability bucket from an HTS code (chapter level).
 */
export function capabilityFromHts(hts: string | null): string | null {
  if (!hts) return null;
  const chapter = hts.slice(0, 4);
  if (['8544', '8504', '8536', '8537'].includes(chapter)) return 'electrical';
  if (['7326', '8302'].includes(chapter)) return 'mechanical';
  if (['8516'].includes(chapter)) return 'refurb';
  if (['9503', '4911', '3919'].includes(chapter)) return 'packaging';
  return null;
}
