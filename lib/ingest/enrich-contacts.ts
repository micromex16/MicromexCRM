import { createServiceClient } from '@/lib/supabase/server';
import { searchApolloByDomain } from '@/lib/ingest/apollo';
import { searchHunterByDomain } from '@/lib/ingest/hunter';

/**
 * Look up contacts for a company. Tries Apollo first, falls back to Hunter.
 * Upserts into `contacts`, sets `is_primary` on the best match (highest role_match_score).
 * Returns the count of contacts inserted/updated.
 */
export async function enrichContacts(companyId: string): Promise<{ count: number; source: string | null }> {
  const supabase = createServiceClient();
  const { data: company, error } = await supabase
    .from('companies')
    .select('id, name, domain')
    .eq('id', companyId)
    .single();
  if (error || !company) throw new Error(`enrichContacts: company ${companyId} not found`);

  const domain = (company as { domain: string | null }).domain;
  if (!domain) {
    return { count: 0, source: null };
  }

  let people: Awaited<ReturnType<typeof searchApolloByDomain>> = [];
  let usedSource: string | null = null;

  if (process.env.APOLLO_API_KEY) {
    try {
      people = await searchApolloByDomain(domain);
      usedSource = 'apollo';
    } catch (e) {
      console.warn(`Apollo failed for ${domain}:`, e instanceof Error ? e.message : String(e));
    }
  }

  if (people.length === 0 && process.env.HUNTER_API_KEY) {
    try {
      people = await searchHunterByDomain(domain);
      usedSource = 'hunter';
    } catch (e) {
      console.warn(`Hunter failed for ${domain}:`, e instanceof Error ? e.message : String(e));
    }
  }

  if (people.length === 0) {
    return { count: 0, source: usedSource };
  }

  // Sort by role match score; the top one is primary.
  people.sort((a, b) => b.role_match_score - a.role_match_score);
  const top = people[0];

  let count = 0;
  for (const p of people) {
    if (!p.email && !p.first_name) continue;
    const { error: insErr } = await supabase
      .from('contacts')
      .upsert(
        {
          company_id: companyId,
          first_name: p.first_name,
          last_name: p.last_name,
          title: p.title,
          email: p.email,
          email_verified: p.email_verified,
          phone: p.phone,
          linkedin_url: p.linkedin_url,
          seniority: p.seniority as never,
          role_match_score: p.role_match_score,
          is_primary: p === top,
          source: p.source,
        } as never,
        { onConflict: 'company_id,email', ignoreDuplicates: false },
      );
    if (!insErr) count++;
  }

  return { count, source: usedSource };
}
