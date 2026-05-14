'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

export function FlushQueueButton({ campaignId, queuedCount }: { campaignId: string; queuedCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/flush-queue`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const parts: string[] = [];
      if (json.sent > 0) parts.push(`${json.sent} sent`);
      if (json.failed > 0) parts.push(`${json.failed} failed`);
      if (json.skipped_suppressed > 0) parts.push(`${json.skipped_suppressed} suppressed`);
      if (json.remaining > 0) parts.push(`${json.remaining} remaining — click again to drain`);
      if (json.sent > 0 || json.skipped_suppressed > 0) {
        toast.success(`Queue flushed: ${parts.join(' · ')}`);
      } else {
        toast.error('Flush failed', { description: parts.join(' · ') || 'no sends processed' });
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Flush failed');
    } finally {
      setBusy(false);
    }
  }

  if (queuedCount === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="accent">
          <Zap className="h-3.5 w-3.5" /> Send all {queuedCount} now
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send all {queuedCount} queued now?</DialogTitle>
          <DialogDescription>
            Bypasses the cron schedule and sends every queued email in this campaign
            immediately. The daily cap still applies — sends count against your
            <code className="rounded bg-muted px-1">DAILY_SEND_CAP</code> for today.
            <br />
            <br />
            Up to ~30 sends fit in one request (60s budget). If you have more queued
            than that, run this again after the first batch lands.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="accent" onClick={go} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Sending…
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" /> Send all now
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
