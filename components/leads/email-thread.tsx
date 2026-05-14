import Link from 'next/link';
import { Mail, MessageCircle, AlertCircle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/empty-state';
import { initials } from '@/lib/utils';

export interface ThreadSend {
  id: string;
  contact_id: string;
  subject_rendered: string;
  body_rendered: string;
  status: string;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  replied_at: string | null;
  bounced_at: string | null;
  reply_body: string | null;
  reply_classification: string | null;
  created_at: string;
}

export interface ThreadContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  email: string | null;
}

interface Props {
  contacts: ThreadContact[];
  sends: ThreadSend[];
  leadId: string;
}

export function EmailThread({ contacts, sends, leadId }: Props) {
  // Group sends by contact, then sort within each thread chronologically
  const threads = contacts
    .map((c) => ({
      contact: c,
      sends: sends
        .filter((s) => s.contact_id === c.id)
        .sort((a, b) =>
          (a.sent_at ?? a.created_at).localeCompare(b.sent_at ?? b.created_at),
        ),
    }))
    .filter((t) => t.sends.length > 0)
    .sort((a, b) => {
      // Most recent activity first
      const aLast = a.sends[a.sends.length - 1];
      const bLast = b.sends[b.sends.length - 1];
      const aTime = aLast.replied_at ?? aLast.sent_at ?? aLast.created_at;
      const bTime = bLast.replied_at ?? bLast.sent_at ?? bLast.created_at;
      return bTime.localeCompare(aTime);
    });

  if (threads.length === 0) {
    return (
      <EmptyState
        icon={Mail}
        title="No emails yet"
        description="Use the composer to send your first email to any contact at this lead."
        action={{ label: 'Open composer', href: `/composer?lead=${leadId}` }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {threads.map(({ contact, sends }) => (
        <ContactThread key={contact.id} contact={contact} sends={sends} leadId={leadId} />
      ))}
    </div>
  );
}

function ContactThread({
  contact,
  sends,
  leadId,
}: {
  contact: ThreadContact;
  sends: ThreadSend[];
  leadId: string;
}) {
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || '(no name)';

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mx-500 text-xs font-semibold text-white">
            {initials(name)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {contact.title ?? '—'} · {contact.email ?? 'no email'}
            </div>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/composer?lead=${leadId}&contact=${contact.id}`}>
            <Mail className="h-3 w-3" /> Send
          </Link>
        </Button>
      </div>

      {/* Messages */}
      <div className="space-y-3 bg-mx-50/20 px-4 py-4">
        {sends.map((s) => (
          <MessageBubbles key={s.id} send={s} />
        ))}
      </div>
    </div>
  );
}

function MessageBubbles({ send }: { send: ThreadSend }) {
  return (
    <>
      <OutboundBubble send={send} />
      {send.reply_body && <InboundBubble send={send} />}
    </>
  );
}

function OutboundBubble({ send }: { send: ThreadSend }) {
  const ts = send.sent_at ?? send.created_at;
  const subject = send.subject_rendered;
  // Strip the auto-appended signature + footer for the preview
  const body = stripFooterArtifacts(send.body_rendered);

  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] space-y-1">
        <div className="rounded-2xl rounded-br-md bg-mx-500 px-4 py-3 text-white shadow-sm">
          <div className="mb-1 text-xs font-semibold opacity-80">{subject}</div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{body}</div>
        </div>
        <div className="flex items-center justify-end gap-2 text-[10px] text-muted-foreground">
          <span>{format(new Date(ts), 'PPp')}</span>
          <span>·</span>
          <StatusChip send={send} />
        </div>
      </div>
    </div>
  );
}

function InboundBubble({ send }: { send: ThreadSend }) {
  const ts = send.replied_at ?? send.sent_at ?? send.created_at;
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] space-y-1">
        <div className="rounded-2xl rounded-bl-md border bg-card px-4 py-3 shadow-sm">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <MessageCircle className="h-3 w-3" />
            Reply
            {send.reply_classification && (
              <Badge variant="secondary" className="text-[10px] font-normal capitalize">
                {send.reply_classification.replace('_', ' ')}
              </Badge>
            )}
          </div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{send.reply_body}</div>
        </div>
        <div className="flex items-center justify-start gap-2 text-[10px] text-muted-foreground">
          <span>{format(new Date(ts), 'PPp')}</span>
          <span>·</span>
          <span>{formatDistanceToNow(new Date(ts), { addSuffix: true })}</span>
        </div>
      </div>
    </div>
  );
}

function StatusChip({ send }: { send: ThreadSend }) {
  // Show the most informative status: replied > clicked > opened > delivered > sent > queued > bounced > failed
  if (send.replied_at) return <span className="text-emerald-600">replied</span>;
  if (send.clicked_at) return <span className="text-mx-600">clicked</span>;
  if (send.opened_at) return <span className="text-mx-600">opened</span>;
  if (send.bounced_at)
    return (
      <span className="inline-flex items-center gap-0.5 text-destructive">
        <AlertCircle className="h-2.5 w-2.5" /> bounced
      </span>
    );
  if (send.status === 'sent') return <span>delivered</span>;
  if (send.status === 'queued') return <span className="text-amber-600">queued</span>;
  if (send.status === 'failed') return <span className="text-destructive">failed</span>;
  if (send.status === 'unsubscribed') return <span className="text-muted-foreground">unsubscribed</span>;
  return <span className="capitalize">{send.status}</span>;
}

/**
 * Strip the postal address + unsubscribe footer + signature lines from the
 * stored body so the chat preview is readable. The full body is still in
 * the DB; this is just for the bubble.
 */
function stripFooterArtifacts(body: string): string {
  if (!body) return '';
  // Cut at the unsub line ("--" separator from renderFooter) or the
  // signature block (line starting with the configured name).
  const sepIdx = body.indexOf('\n--\n');
  if (sepIdx > 0) return body.slice(0, sepIdx).trim();
  return body.trim();
}
