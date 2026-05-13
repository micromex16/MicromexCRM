'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileSearch, Mail, Pencil, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

export function LeadActions({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [enriching, setEnriching] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [findingSimilar, setFindingSimilar] = useState(false);

  async function findSimilar() {
    setFindingSimilar(true);
    try {
      const res = await fetch('/api/discovery/lookalike', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: leadId, max_candidates: 10 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast.success(`Found ${json.companies_created} similar companies`, {
        description: `${json.candidates_returned} returned · ${json.companies_skipped_dedupe} already in DB · ${json.jobs_enqueued} enrichment jobs queued`,
      });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lookalike failed');
    } finally {
      setFindingSimilar(false);
    }
  }

  async function callStep(step: 'research' | 'contacts' | 'score') {
    const res = await fetch(`/api/leads/${leadId}/enrich/${step}`, { method: 'POST' });
    let json: Record<string, unknown> = {};
    try {
      json = await res.json();
    } catch {
      // Vercel returns plain-text "Internal Server Error" on timeout/crash
      throw new Error(`${step}: server returned non-JSON (likely timeout or crash)`);
    }
    if (!res.ok) throw new Error((json.error as string) ?? `${step}: HTTP ${res.status}`);
    return json;
  }

  async function runEnrich() {
    setEnriching(true);
    const toastId = toast.loading('Enriching… research + contacts + score');
    try {
      // Research and contacts are independent; score depends on research.
      // Run research + contacts in parallel, then score once research lands.
      const [researchResult, contactsResult] = await Promise.allSettled([
        callStep('research'),
        callStep('contacts'),
      ]);

      let scoreResult: PromiseSettledResult<Record<string, unknown>> | null = null;
      if (researchResult.status === 'fulfilled') {
        scoreResult = await Promise.allSettled([callStep('score')]).then((r) => r[0]);
      }

      const parts: string[] = [];
      const errors: string[] = [];

      if (scoreResult?.status === 'fulfilled') {
        parts.push(`fit ${scoreResult.value.fit_score}`);
      } else if (researchResult.status === 'fulfilled') {
        parts.push('research done');
      } else {
        errors.push(`research: ${(researchResult as PromiseRejectedResult).reason?.message ?? 'failed'}`);
      }

      if (contactsResult.status === 'fulfilled') {
        const added = contactsResult.value.added as number;
        parts.push(`${added} contacts`);
        const hint = contactsResult.value.hint as string | undefined;
        if (added === 0 && hint) errors.push(hint);
      } else {
        errors.push(`contacts: ${(contactsResult as PromiseRejectedResult).reason?.message ?? 'failed'}`);
      }

      if (scoreResult?.status === 'rejected') {
        errors.push(`score: ${scoreResult.reason?.message ?? 'failed'}`);
      }

      const success = researchResult.status === 'fulfilled' || contactsResult.status === 'fulfilled';
      const summary = parts.join(' · ') || 'no progress';

      if (success) {
        toast.success(`Enrichment — ${summary}`, {
          id: toastId,
          description: errors.length ? errors.join('\n') : undefined,
        });
      } else {
        toast.error('Enrichment failed', {
          id: toastId,
          description: errors.join('\n') || 'All steps failed.',
        });
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Enrichment failed', { id: toastId });
    } finally {
      setEnriching(false);
    }
  }

  async function saveNote() {
    setSavingNote(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: note }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      toast.success('Note added');
      setNote('');
      setNoteOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save note');
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
          Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <Button variant="default" className="w-full justify-start" onClick={runEnrich} disabled={enriching}>
          <RefreshCw className={`h-4 w-4 ${enriching ? 'animate-spin' : ''}`} />
          {enriching ? 'Queueing…' : 'Run enrichment'}
        </Button>
        <Button
          variant="accent"
          className="w-full justify-start"
          onClick={findSimilar}
          disabled={findingSimilar}
        >
          <Sparkles className={`h-4 w-4 ${findingSimilar ? 'animate-pulse' : ''}`} />
          {findingSimilar ? 'Searching…' : 'Find similar companies'}
        </Button>
        <Button variant="outline" className="w-full justify-start" asChild>
          <a href={`/composer?lead=${leadId}`}>
            <Mail className="h-4 w-4" />
            Draft email
          </a>
        </Button>
        <Button variant="outline" className="w-full justify-start" asChild>
          <a href="/campaigns/new">
            <FileSearch className="h-4 w-4" />
            Add to campaign
          </a>
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={() => setNoteOpen((v) => !v)}
        >
          <Pencil className="h-4 w-4" />
          Add note
        </Button>
        {noteOpen && (
          <div className="space-y-2 pt-2">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Quick note about this lead…"
              className="min-h-[80px]"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setNoteOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={saveNote} disabled={savingNote || note.trim() === ''}>
                {savingNote ? 'Saving…' : 'Save note'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
