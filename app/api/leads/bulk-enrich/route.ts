import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runResearch } from '@/lib/enrichment/research';
import { runScore } from '@/lib/enrichment/score';
import { enrichContacts } from '@/lib/ingest/enrich-contacts';

export const runtime = 'nodejs';
// Hobby tier caps at 60s. Each lead ~20-25s, so process 2 per call.
export const maxDuration = 60;

const BATCH_SIZE = 2;

interface LeadRow {
  id: string;
  name: string;
}

interface Per {
  id: string;
  name: string;
  research_ok: boolean;
  contacts_added?: number;
  fit_score?: number;
  errors?: string[];
}

export async function POST(_request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Pull leads needing enrichment: no research yet OR fit_score still 0.
  const { data: pending, error: pErr } = await supabase
    .from('companies')
    .select('id, name')
    .in('status', ['new', 'researching'])
    .is('research_summary', null)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE + 20); // overshoot so we can compute remaining

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const rows = (pending ?? []) as LeadRow[];
  if (rows.length === 0) {
    return NextResponse.json({ processed: 0, remaining: 0, results: [] });
  }

  const batch = rows.slice(0, BATCH_SIZE);
  const remaining = Math.max(0, rows.length - batch.length);

  const results: Per[] = await Promise.all(
    batch.map(async (lead) => {
      const r: Per = { id: lead.id, name: lead.name, research_ok: false, errors: [] };

      // research + contacts in parallel
      const [researchRes, contactsRes] = await Promise.allSettled([
        runResearch(lead.id),
        enrichContacts(lead.id),
      ]);

      if (researchRes.status === 'fulfilled') {
        r.research_ok = true;
      } else {
        r.errors!.push(
          `research: ${researchRes.reason instanceof Error ? researchRes.reason.message : String(researchRes.reason)}`,
        );
      }

      if (contactsRes.status === 'fulfilled') {
        r.contacts_added = contactsRes.value.count;
      } else {
        r.errors!.push(
          `contacts: ${contactsRes.reason instanceof Error ? contactsRes.reason.message : String(contactsRes.reason)}`,
        );
      }

      // score requires research
      if (r.research_ok) {
        try {
          const s = await runScore(lead.id);
          r.fit_score = s.fit_score;
        } catch (e) {
          r.errors!.push(`score: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (r.errors!.length === 0) delete r.errors;
      return r;
    }),
  );

  return NextResponse.json({ processed: batch.length, remaining, results });
}

export async function GET() {
  // Lightweight count — what does the bulk button show as "N pending"?
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { count } = await supabase
    .from('companies')
    .select('id', { count: 'exact', head: true })
    .in('status', ['new', 'researching'])
    .is('research_summary', null);

  return NextResponse.json({ pending: count ?? 0, batch_size: BATCH_SIZE });
}
