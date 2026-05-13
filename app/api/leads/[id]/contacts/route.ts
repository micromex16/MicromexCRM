import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(_request: Request, ctx: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, title, email')
    .eq('company_id', ctx.params.id)
    .neq('unsubscribed', true)
    .order('is_primary', { ascending: false })
    .order('role_match_score', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ contacts: data ?? [] });
}
