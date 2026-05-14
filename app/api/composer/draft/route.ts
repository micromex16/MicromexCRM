import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { draftEmail } from '@/lib/enrichment/draft';

export const runtime = 'nodejs';
export const maxDuration = 60;

const Body = z.object({
  contact_id: z.string().uuid(),
  template_id: z.string().uuid(),
  /** Optional: ask Claude to refine the current draft per this instruction. */
  tweak_instruction: z.string().min(1).max(1000).optional(),
  current_subject: z.string().min(1).max(200).optional(),
  current_body: z.string().min(1).max(5000).optional(),
});

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const json = await request.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ error: 'invalid_body', issues: parsed.error.flatten() }, { status: 400 });

  try {
    const draft = await draftEmail({
      contactId: parsed.data.contact_id,
      templateId: parsed.data.template_id,
      persist: false,
      tweakInstruction: parsed.data.tweak_instruction,
      currentSubject: parsed.data.current_subject,
      currentBody: parsed.data.current_body,
    });
    return NextResponse.json(draft);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
