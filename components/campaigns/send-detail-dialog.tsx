'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Send, RefreshCw, AlertCircle, Loader2, Eye, Mail, Clock, MousePointerClick, MessageCircle, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export interface SendDetail {
  id: string;
  subject: string;
  body: string;
  status: string;
  error: string | null;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  replied_at: string | null;
  bounced_at: string | null;
  reply_body: string | null;
  reply_classification: string | null;
  resend_message_id: string | null;
  created_at: string;
  recipient_name: string | null;
  recipient_email: string | null;
}

export function SendDetailDialog({ send }: { send: SendDetail }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function doSend(action: 'send-now' | 'retry') {
    setBusy(true);
    try {
      const path =
        action === 'retry'
          ? `/api/sends/${send.id}/retry`
          : `/api/sends/${send.id}/send-now`;
      const res = await fetch(path, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (json.status === 'sent') {
        toast.success('Sent ✉');
        setOpen(false);
      } else if (json.status === 'skipped_suppressed') {
        toast.error('Skipped — contact is on the suppression list');
      } else {
        toast.error(`${action === 'retry' ? 'Retry' : 'Send'} failed`, {
          description: json.error ?? 'unknown',
        });
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Eye className="h-3 w-3" /> View
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{send.subject}</DialogTitle>
            <DialogDescription className="text-xs">
              To: <strong>{send.recipient_name ?? '(no name)'}</strong>
              {send.recipient_email && (
                <>
                  {' '}— <span className="font-mono">{send.recipient_email}</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Status pills + timestamps */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <StatusPill status={send.status} />
            {send.sent_at && (
              <PillRow icon={Mail} label={`Sent ${format(new Date(send.sent_at), 'PPp')}`} tone="mx" />
            )}
            {send.opened_at && (
              <PillRow icon={Eye} label={`Opened ${format(new Date(send.opened_at), 'PPp')}`} tone="mx" />
            )}
            {send.clicked_at && (
              <PillRow icon={MousePointerClick} label={`Clicked ${format(new Date(send.clicked_at), 'PPp')}`} tone="mx" />
            )}
            {send.replied_at && (
              <PillRow icon={MessageCircle} label={`Replied ${format(new Date(send.replied_at), 'PPp')}`} tone="success" />
            )}
            {send.bounced_at && (
              <PillRow icon={AlertCircle} label={`Bounced ${format(new Date(send.bounced_at), 'PPp')}`} tone="destructive" />
            )}
          </div>

          {/* Failure reason */}
          {send.status === 'failed' && send.error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-destructive">
                <AlertCircle className="h-3.5 w-3.5" /> Why this send failed
              </div>
              <div className="font-mono text-xs leading-relaxed text-destructive/90">
                {send.error}
              </div>
              <FailureHint error={send.error} />
            </div>
          )}

          {/* Body */}
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Email body (rendered, including signature + footer)
            </div>
            <pre className="max-h-[40vh] overflow-y-auto whitespace-pre-wrap break-words rounded-md border bg-card p-3 font-sans text-sm leading-relaxed">
              {send.body}
            </pre>
          </div>

          {/* Reply, if any */}
          {send.reply_body && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                Reply received
                {send.reply_classification && (
                  <Badge variant="secondary" className="ml-2 text-[10px] font-normal capitalize">
                    {send.reply_classification.replace('_', ' ')}
                  </Badge>
                )}
              </div>
              <pre className="whitespace-pre-wrap break-words rounded-md border border-emerald-200 bg-emerald-50/60 p-3 font-sans text-sm leading-relaxed">
                {send.reply_body}
              </pre>
            </div>
          )}

          {/* Resend metadata */}
          {send.resend_message_id && (
            <div className="text-[10px] text-muted-foreground">
              Resend message ID: <span className="font-mono">{send.resend_message_id}</span>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Close
            </Button>
            {send.status === 'queued' && (
              <Button onClick={() => doSend('send-now')} disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" /> Send now
                  </>
                )}
              </Button>
            )}
            {send.status === 'failed' && (
              <Button onClick={() => doSend('retry')} disabled={busy} variant="default">
                {busy ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Retrying…
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" /> Retry send
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'sent'
      ? 'bg-mx-100 text-mx-700'
      : status === 'replied'
        ? 'bg-emerald-100 text-emerald-700'
        : status === 'opened' || status === 'clicked'
          ? 'bg-mx-100 text-mx-700'
          : status === 'failed' || status === 'bounced'
            ? 'bg-destructive/15 text-destructive'
            : status === 'queued' || status === 'manual_hold'
              ? 'bg-amber-100 text-amber-800'
              : 'bg-muted text-muted-foreground';
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold capitalize', tone)}>
      {status.replace('_', ' ')}
    </span>
  );
}

function PillRow({
  icon: Icon,
  label,
  tone,
}: {
  icon: typeof Mail;
  label: string;
  tone: 'mx' | 'success' | 'destructive';
}) {
  const color =
    tone === 'success'
      ? 'text-emerald-600'
      : tone === 'destructive'
        ? 'text-destructive'
        : 'text-mx-600';
  return (
    <span className={`inline-flex items-center gap-1 ${color}`}>
      <Icon className="h-3 w-3" />
      <span>{label}</span>
    </span>
  );
}

function FailureHint({ error }: { error: string }) {
  const lower = error.toLowerCase();
  let hint: { icon: typeof Mail; label: string } | null = null;
  if (lower.includes('rate') || lower.includes('429') || lower.includes('daily') || lower.includes('limit')) {
    hint = {
      icon: Clock,
      label:
        'Looks like a daily / rate limit. On Resend free tier (100/day, 3,000/month) you\'ll hit this after ~100 sends per day. Wait until tomorrow and click Retry, or upgrade Resend ($20/mo for 50k/mo).',
    };
  } else if (lower.includes('no email') || lower.includes('invalid')) {
    hint = {
      icon: ShieldOff,
      label:
        'The contact has no valid email on file. Edit the contact and add an email, or skip this send.',
    };
  } else if (lower.includes('domain') || lower.includes('dkim') || lower.includes('spf')) {
    hint = {
      icon: AlertCircle,
      label:
        'Sender-domain issue. Check Resend dashboard → Domains → micromex.com is still green on SPF/DKIM/DMARC.',
    };
  }
  if (!hint) return null;
  const Icon = hint.icon;
  return (
    <div className="mt-2 flex items-start gap-1.5 text-[11px] text-destructive/80">
      <Icon className="mt-0.5 h-3 w-3 shrink-0" />
      <div>{hint.label}</div>
    </div>
  );
}
