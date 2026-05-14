'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Loader2 } from 'lucide-react';
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

export function RetryFailedButton({ campaignId, failedCount }: { campaignId: string; failedCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/retry-failed`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const parts: string[] = [];
      if (json.sent > 0) parts.push(`${json.sent} sent`);
      if (json.failed > 0) parts.push(`${json.failed} failed again`);
      if (json.skipped_suppressed > 0) parts.push(`${json.skipped_suppressed} suppressed`);
      if (json.remaining > 0) parts.push(`${json.remaining} remaining — click again to keep draining`);
      if (json.sent > 0) {
        toast.success(`Retried: ${parts.join(' · ')}`);
      } else {
        toast.error('Retry didn\'t recover any', { description: parts.join(' · ') });
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Retry failed');
    } finally {
      setBusy(false);
    }
  }

  if (failedCount === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="default">
          <RefreshCw className="h-3.5 w-3.5" /> Retry all {failedCount}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Retry all {failedCount} failed sends?</DialogTitle>
          <DialogDescription>
            Resets each failed send back to queued and tries to send again immediately.
            <br />
            <br />
            <strong>If you failed because of the Resend free-tier 100/day cap</strong>, wait
            until tomorrow (or upgrade) — otherwise these will fail again with the same
            rate-limit error. Cheapest paid plan is $20/mo for 50,000 emails.
            <br />
            <br />
            Up to ~30 retries fit in one click (60s budget). If more remain, run this again.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={go} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Retrying…
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" /> Retry all
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
