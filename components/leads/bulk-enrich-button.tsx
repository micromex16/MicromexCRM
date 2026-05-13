'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';

interface BatchResult {
  processed: number;
  remaining: number;
  results: Array<{
    id: string;
    name: string;
    research_ok: boolean;
    contacts_added?: number;
    fit_score?: number;
    errors?: string[];
  }>;
}

export function BulkEnrichButton() {
  const router = useRouter();
  const [pending, setPending] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [failedTotal, setFailedTotal] = useState(0);

  useEffect(() => {
    fetch('/api/leads/bulk-enrich')
      .then((r) => r.json())
      .then((j) => setPending(j.pending ?? 0))
      .catch(() => setPending(null));
  }, []);

  async function runBatch(): Promise<BatchResult> {
    const res = await fetch('/api/leads/bulk-enrich', { method: 'POST' });
    if (!res.ok) {
      throw new Error((await res.text()) || `HTTP ${res.status}`);
    }
    return (await res.json()) as BatchResult;
  }

  async function start() {
    setRunning(true);
    setDone(0);
    setContactsTotal(0);
    setFailedTotal(0);
    const startedAt = Date.now();
    const id = toast.loading('Starting bulk enrichment…');
    let totalProcessed = 0;
    let totalContacts = 0;
    let totalFailed = 0;

    try {
      while (true) {
        const batch = await runBatch();
        totalProcessed += batch.processed;

        for (const r of batch.results) {
          if (r.contacts_added !== undefined) totalContacts += r.contacts_added;
          if (r.errors?.length) totalFailed++;
        }

        setDone(totalProcessed);
        setContactsTotal(totalContacts);
        setFailedTotal(totalFailed);

        toast.loading(
          `Enriched ${totalProcessed} of ${totalProcessed + batch.remaining} · ${totalContacts} contacts · ${totalFailed} failed`,
          { id },
        );

        if (batch.remaining === 0 || batch.processed === 0) {
          break;
        }
      }

      const seconds = Math.round((Date.now() - startedAt) / 1000);
      toast.success(
        `Done — ${totalProcessed} leads enriched · ${totalContacts} contacts added · ${totalFailed} failed (${seconds}s)`,
        { id },
      );
      setPending(0);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk enrichment failed', { id });
    } finally {
      setRunning(false);
    }
  }

  if (pending === null) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </Button>
    );
  }

  if (pending === 0 && !running) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Zap className="h-4 w-4" /> No pending enrichment
      </Button>
    );
  }

  return (
    <Button
      variant="accent"
      size="sm"
      onClick={start}
      disabled={running}
      title="Runs research + contact lookup + scoring on every lead that hasn't been enriched yet. Costs ~$0.10–$0.20 in Anthropic + 1 Hunter credit per lead."
    >
      {running ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {done > 0 ? `Enriched ${done}…` : 'Starting…'}
        </>
      ) : (
        <>
          <Zap className="h-4 w-4" />
          Enrich {pending} pending
        </>
      )}
    </Button>
  );
}
