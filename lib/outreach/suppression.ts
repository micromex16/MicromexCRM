import { createServiceClient } from '@/lib/supabase/server';
import { domainFromEmail } from '@/lib/utils';

export async function isSuppressed(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const lower = email.toLowerCase();
  const domain = domainFromEmail(lower);
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('suppression_list')
    .select('email, domain')
    .or(`email.eq.${lower},domain.eq.${domain ?? ''}`)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

export async function suppress(opts: { email?: string; domain?: string; reason: string }) {
  const supabase = createServiceClient();
  await supabase.from('suppression_list').insert({
    email: opts.email?.toLowerCase() ?? null,
    domain: opts.domain?.toLowerCase() ?? null,
    reason: opts.reason,
  } as never);

  if (opts.email) {
    await supabase
      .from('contacts')
      .update({ unsubscribed: true, email_verified: false } as never)
      .ilike('email', opts.email);
  }
}
