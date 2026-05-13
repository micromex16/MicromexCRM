import { createServiceClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

export async function getTodaysSendCount(): Promise<number> {
  const supabase = createServiceClient();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from('sends')
    .select('id', { count: 'exact', head: true })
    .gte('sent_at', start.toISOString());
  return count ?? 0;
}

export async function withinDailyCap(): Promise<{ ok: boolean; sent: number; cap: number }> {
  const sent = await getTodaysSendCount();
  const cap = env().DAILY_SEND_CAP;
  return { ok: sent < cap, sent, cap };
}
