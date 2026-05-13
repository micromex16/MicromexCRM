'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileSearch, Mail, Pencil, RefreshCw } from 'lucide-react';
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

  async function runEnrich() {
    setEnriching(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/enrich`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      toast.success('Enrichment jobs queued', {
        description: 'research + score will run on the next cron tick.',
      });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to queue enrichment');
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
