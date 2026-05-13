import { NextResponse, type NextRequest } from 'next/server';
import { assertCron } from '@/lib/cron';
import { createServiceClient } from '@/lib/supabase/server';
import { enqueue } from '@/lib/jobs';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = assertCron(request);
  if (auth) return auth;

  const supabase = createServiceClient();
  let researchEnqueued = 0;
  let emailLookupEnqueued = 0;

  // Companies with status='new' and no research yet.
  const { data: needResearch } = await supabase
    .from('companies')
    .select('id')
    .eq('status', 'new')
    .is('research_summary', null)
    .limit(50);

  for (const c of (needResearch ?? []) as { id: string }[]) {
    try {
      await enqueue({ targetType: 'company', targetId: c.id, jobType: 'research', priority: 7 });
      researchEnqueued++;
    } catch {
      /* ignore individual failures */
    }
  }

  // Companies that are qualified but have no contacts yet, re-enqueue email_lookup.
  const { data: needContacts } = await supabase
    .from('companies')
    .select('id, contacts!inner(id)')
    .in('status', ['qualified', 'researching'])
    .limit(50);

  for (const c of (needContacts ?? []) as { id: string; contacts: unknown[] }[]) {
    if ((c.contacts ?? []).length === 0) {
      try {
        await enqueue({
          targetType: 'company',
          targetId: c.id,
          jobType: 'email_lookup',
          priority: 6,
        });
        emailLookupEnqueued++;
      } catch {
        /* ignore */
      }
    }
  }

  return NextResponse.json({ researchEnqueued, emailLookupEnqueued });
}
