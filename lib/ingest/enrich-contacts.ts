import { createServiceClient } from '@/lib/supabase/server';
import { searchApolloByDomain } from '@/lib/ingest/apollo';
import { searchHunterByDomain } from '@/lib/ingest/hunter';

export type EnrichContactsReason =
  | 'ok'
  | 'no_domain'
  | 'no_keys'
  | 'no_results'
  | 'company_not_found';

export interface EnrichContactsResult {
  count: number;
  source: string | null;
  reason: EnrichContactsReason;
  hint?: string;
  errors?: string[];
  /** Diagnostic info — populated so we can debug "0 contacts" mysteries. */
  debug?: {
    domain: string | null;
    keys: { apollo: boolean; hunter: boolean };
    candidates_from_provider: number;
    skipped_no_email_or_name: number;
    skipped_dedupe: number;
    insert_attempts: number;
    inserts_ok: number;
    inserts_failed: number;
    first_insert_error?: string;
  };
}

/**
 * Look up contacts for a company. Tries Apollo first, falls back to Hunter.
 * Upserts into `contacts`, sets `is_primary` on the best match.
 *
 * Always returns a structured reason so the UI can explain WHY contacts
 * may not have been added (no keys, no domain, no results).
 */
export async function enrichContacts(companyId: string): Promise<EnrichContactsResult> {
  const supabase = createServiceClient();
  const { data: company, error } = await supabase
    .from('companies')
    .select('id, name, domain')
    .eq('id', companyId)
    .single();
  if (error || !company) {
    return {
      count: 0,
      source: null,
      reason: 'company_not_found',
      hint: `Company ${companyId} not found.`,
    };
  }

  const domain = (company as { domain: string | null }).domain;
  if (!domain) {
    return {
      count: 0,
      source: null,
      reason: 'no_domain',
      hint:
        'No domain on file for this company — Apollo/Hunter both look up by domain. ' +
        'Edit the lead and add a domain, then re-run enrichment.',
    };
  }

  const hasApollo = Boolean(process.env.APOLLO_API_KEY);
  const hasHunter = Boolean(process.env.HUNTER_API_KEY);
  if (!hasApollo && !hasHunter) {
    return {
      count: 0,
      source: null,
      reason: 'no_keys',
      hint:
        'Neither APOLLO_API_KEY nor HUNTER_API_KEY is set in Vercel. ' +
        'Get one from https://apollo.io (recommended) or https://hunter.io and add it under ' +
        'Vercel → Project → Settings → Environment Variables, then redeploy.',
    };
  }

  let people: Awaited<ReturnType<typeof searchApolloByDomain>> = [];
  let usedSource: string | null = null;
  const errors: string[] = [];

  if (hasApollo) {
    try {
      people = await searchApolloByDomain(domain);
      usedSource = 'apollo';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`Apollo: ${msg}`);
      console.warn(`Apollo failed for ${domain}:`, msg);
    }
  }

  if (people.length === 0 && hasHunter) {
    try {
      people = await searchHunterByDomain(domain);
      usedSource = 'hunter';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`Hunter: ${msg}`);
      console.warn(`Hunter failed for ${domain}:`, msg);
    }
  }

  const debug = {
    domain,
    keys: { apollo: hasApollo, hunter: hasHunter },
    candidates_from_provider: people.length,
    skipped_no_email_or_name: 0,
    skipped_dedupe: 0,
    insert_attempts: 0,
    inserts_ok: 0,
    inserts_failed: 0,
    first_insert_error: undefined as string | undefined,
  };

  if (people.length === 0) {
    return {
      count: 0,
      source: usedSource,
      reason: 'no_results',
      hint: `Tried ${[hasApollo && 'Apollo', hasHunter && 'Hunter'].filter(Boolean).join(' + ')} on ${domain} — provider returned 0 emails.`,
      errors: errors.length ? errors : undefined,
      debug,
    };
  }

  // Sort by role match score; the top one is primary.
  people.sort((a, b) => b.role_match_score - a.role_match_score);
  const top = people[0];

  // Pre-fetch existing contacts for this company so we can dedupe by lowercase
  // email locally — the unique index is on (company_id, lower(email)), which
  // can't be used as an upsert onConflict target directly.
  const { data: existingRows } = await supabase
    .from('contacts')
    .select('id, email')
    .eq('company_id', companyId);
  const existingEmails = new Set(
    ((existingRows ?? []) as { email: string | null }[])
      .map((r) => r.email?.toLowerCase())
      .filter((x): x is string => Boolean(x)),
  );

  let count = 0;
  for (const p of people) {
    if (!p.email && !p.first_name) {
      debug.skipped_no_email_or_name++;
      continue;
    }
    const lower = p.email?.toLowerCase();
    if (lower && existingEmails.has(lower)) {
      debug.skipped_dedupe++;
      continue;
    }
    debug.insert_attempts++;
    const payload = {
      company_id: companyId,
      first_name: p.first_name,
      last_name: p.last_name,
      title: p.title,
      email: p.email,
      email_verified: p.email_verified,
      phone: p.phone,
      linkedin_url: p.linkedin_url,
      seniority: p.seniority,
      role_match_score: p.role_match_score,
      is_primary: p === top,
      source: p.source,
    };
    const { error: insErr } = await supabase.from('contacts').insert(payload as never);
    if (insErr) {
      debug.inserts_failed++;
      if (!debug.first_insert_error) debug.first_insert_error = insErr.message;
      errors.push(`insert ${p.email ?? p.first_name}: ${insErr.message}`);
      console.warn(`contact insert failed:`, insErr.message, 'payload:', JSON.stringify(payload));
    } else {
      debug.inserts_ok++;
      count++;
      if (lower) existingEmails.add(lower);
    }
  }

  return {
    count,
    source: usedSource,
    reason: count === 0 ? 'no_results' : 'ok',
    hint:
      count === 0
        ? errors.length
          ? `${debug.inserts_failed} insert(s) failed. First error: ${debug.first_insert_error}`
          : `${people.length} candidates returned but ${debug.skipped_dedupe} were duplicates already in DB.`
        : undefined,
    errors: errors.length ? errors : undefined,
    debug,
  };
}
