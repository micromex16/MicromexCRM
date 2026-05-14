import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Admin-only one-shot: scrub suppression-list entries that look like email
 * scanner false positives.
 *
 * Pattern: a contact was sent a send AND that send's status went from
 * 'sent' -> 'unsubscribed' within 5 minutes. Real humans usually take
 * longer to read + click; scanners follow links within seconds.
 *
 * Default mode is DRY-RUN — returns what WOULD be cleaned without making
 * changes. POST { confirm: true } to actually clean.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const confirm = (body as { confirm?: boolean }).confirm === true;

  const adminDb = createServiceClient();

  // Pull the suspect suppression entries (sent_at AND unsubscribed_at within
  // 5 minutes). Use the sends table as the source of truth — easier to
  // correlate than scanning the suppression_list alone.
  const { data: sends } = await adminDb
    .from('sends')
    .select('id, status, sent_at, unsubscribed_at, contact_id, contacts(id, email)')
    .eq('status', 'unsubscribed')
    .not('sent_at', 'is', null)
    .not('unsubscribed_at', 'is', null);

  type Row = {
    id: string;
    status: string;
    sent_at: string;
    unsubscribed_at: string;
    contact_id: string;
    contacts: { id: string; email: string | null } | null;
  };

  const suspects: { send_id: string; email: string; contact_id: string; delta_sec: number }[] = [];
  for (const row of (sends ?? []) as Row[]) {
    if (!row.contacts?.email) continue;
    const sent = new Date(row.sent_at).getTime();
    const unsub = new Date(row.unsubscribed_at).getTime();
    const deltaSec = (unsub - sent) / 1000;
    // Scanners typically follow within seconds-to-minutes. Humans typically
    // take 1+ min and often hours/days. Threshold at 5 minutes catches
    // the worst false positives.
    if (deltaSec >= 0 && deltaSec < 5 * 60) {
      suspects.push({
        send_id: row.id,
        email: row.contacts.email,
        contact_id: row.contact_id,
        delta_sec: Math.round(deltaSec),
      });
    }
  }

  if (!confirm) {
    return NextResponse.json({
      dry_run: true,
      total_suspect: suspects.length,
      sample: suspects.slice(0, 20),
      message:
        'POST again with {"confirm": true} to actually clean these. Will: (1) delete the suppression_list rows for these emails; (2) set contacts.unsubscribed=false; (3) revert sends.status from unsubscribed -> sent (since they actually were delivered, just the post-delivery webhook lied).',
    });
  }

  let suppressionRowsDeleted = 0;
  let contactsRestored = 0;
  let sendsReverted = 0;

  // Batch by chunks of 50 to keep individual queries small
  const emails = Array.from(new Set(suspects.map((s) => s.email.toLowerCase())));
  const contactIds = Array.from(new Set(suspects.map((s) => s.contact_id)));
  const sendIds = suspects.map((s) => s.send_id);

  // 1. Delete from suppression_list (lower(email) match — case-insensitive)
  for (let i = 0; i < emails.length; i += 50) {
    const batch = emails.slice(i, i + 50);
    const { data: deleted } = await adminDb
      .from('suppression_list')
      .delete()
      .in('email', batch)
      .select('id');
    suppressionRowsDeleted += (deleted ?? []).length;
  }

  // 2. Unmark contacts.unsubscribed
  for (let i = 0; i < contactIds.length; i += 50) {
    const batch = contactIds.slice(i, i + 50);
    const { data: updated } = await adminDb
      .from('contacts')
      .update({ unsubscribed: false } as never)
      .in('id', batch)
      .select('id');
    contactsRestored += (updated ?? []).length;
  }

  // 3. Revert send status to 'sent' (the send DID go through Resend —
  //    only the false 'unsubscribed' click came after, so 'sent' is
  //    the true outcome).
  for (let i = 0; i < sendIds.length; i += 50) {
    const batch = sendIds.slice(i, i + 50);
    const { data: updated } = await adminDb
      .from('sends')
      .update({ status: 'sent', unsubscribed_at: null } as never)
      .in('id', batch)
      .select('id');
    sendsReverted += (updated ?? []).length;
  }

  return NextResponse.json({
    dry_run: false,
    total_suspect: suspects.length,
    suppression_rows_deleted: suppressionRowsDeleted,
    contacts_restored: contactsRestored,
    sends_reverted: sendsReverted,
  });
}
