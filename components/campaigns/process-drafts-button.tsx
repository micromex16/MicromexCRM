'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Props {
  campaignId: string;
  pendingCount: number;
}

/**
 * Banner-style control that surfaces when there are draft_email jobs
 * sitting in the enrichment queue for this campaign. Each click drains
 * up to ~12 drafts inline (Anthropic latency × 60s function cap).
 */
export function ProcessDraftsButton({ campaignId, pendingCount }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [autoLoop, setAutoLoop] = useState(false);

  async function processOne() {
    const res = await fetch(`/api/campaigns/${campaignId}/process-drafts`, { method: 'POST' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    return json as { drafted: number; failed: number; remaining: number; errors: string[] };
  }

  async function run(loop = false) {
    setBusy(true);
    setAutoLoop(loop);
    const id = toast.loading('Drafting…');
    let totalDrafted = 0;
    let totalFailed = 0;

    try {
      while (true) {
        const r = await processOne();
        totalDrafted += r.drafted;
        totalFailed += r.failed;
        toast.loading(
          `${totalDrafted} drafted · ${totalFailed} failed · ${r.remaining} remaining`,
          { id },
        );
        if (!loop || r.remaining === 0 || r.drafted === 0) {
          toast.success(
            `Done — ${totalDrafted} drafted${totalFailed > 0 ? `, ${totalFailed} failed` : ''}${
              r.remaining > 0 ? `, ${r.remaining} still pending` : ''
            }`,
            { id },
          );
          break;
        }
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Processing failed', { id });
    } finally {
      setBusy(false);
      setAutoLoop(false);
    }
  }

  if (pendingCount === 0) return null;

  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div>
          <div className="font-semibold text-amber-900">
            {pendingCount} drafts waiting in the queue
          </div>
          <div className="text-xs text-amber-800">
            These were enqueued for the daily cron. Click to draft them now (~$0.03
            in Anthropic credits per draft, ~10s each).
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => run(false)} disabled={busy} size="sm" variant="default">
          {busy && !autoLoop ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Drafting…
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" /> Process next batch (~12)
            </>
          )}
        </Button>
        <Button
          onClick={() => run(true)}
          disabled={busy}
          size="sm"
          variant="accent"
          title="Process the entire queue. Will loop until done — keeps this tab busy for several minutes."
        >
          {autoLoop ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Draining queue…
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" /> Drain all {pendingCount}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
