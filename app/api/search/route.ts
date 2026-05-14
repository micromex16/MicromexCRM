import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { LeadStatus } from '@/lib/types/domain';

export const runtime = 'nodejs';

const MAX_PER_BUCKET = 6;

interface CompanyHit {
  type: 'company';
  id: string;
  name: string;
  domain: string | null;
  fit_score: number | null;
  status: LeadStatus;
}

interface ContactHit {
  type: 'contact';
  id: string;
  full_name: string | null;
  email: string | null;
  title: string | null;
  company_id: string;
  company_name: string | null;
}

export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) {
    return NextResponse.json({ q, companies: [], contacts: [] });
  }
  const pattern = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;

  // Companies: match name OR domain
  const { data: companiesData } = await supabase
    .from('companies')
    .select('id, name, domain, fit_score, status')
    .or(`name.ilike.${pattern},domain.ilike.${pattern}`)
    .order('fit_score', { ascending: false, nullsFirst: false })
    .limit(MAX_PER_BUCKET);

  // Contacts: match full_name OR email
  const { data: contactsData } = await supabase
    .from('contacts')
    .select('id, full_name, email, title, company_id, companies(name)')
    .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
    .limit(MAX_PER_BUCKET);

  const companies = (companiesData ?? []) as CompanyHit[];
  const contacts = ((contactsData ?? []) as Array<{
    id: string;
    full_name: string | null;
    email: string | null;
    title: string | null;
    company_id: string;
    companies: { name: string } | null;
  }>).map(
    (c): ContactHit => ({
      type: 'contact',
      id: c.id,
      full_name: c.full_name,
      email: c.email,
      title: c.title,
      company_id: c.company_id,
      company_name: c.companies?.name ?? null,
    }),
  );

  return NextResponse.json({ q, companies, contacts });
}
