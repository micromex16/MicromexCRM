'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface Target {
  id: string;
  capability: 'electrical' | 'refurb' | 'packaging' | 'mechanical';
  industry_segment: string;
  revenue_band: string;
  description: string;
}

export function DiscoveryForm({ targets }: { targets: Target[] }) {
  const router = useRouter();
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '');
  const [max, setMax] = useState('10');
  const [running, setRunning] = useState(false);

  const target = targets.find((t) => t.id === targetId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    try {
      const res = await fetch('/api/discovery/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_id: targetId, max_candidates: parseInt(max, 10) || 10 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast.success(`Discovered ${json.companies_created} new companies`, {
        description: `${json.candidates_returned} candidates returned · ${json.companies_skipped_dedupe} skipped (already in DB) · ${json.jobs_enqueued} enrichment jobs queued`,
      });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Discovery failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card className="border-accent-amber/30 bg-accent-amber/[0.02]">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent-amber" />
          <CardTitle>Claude discovery agent</CardTitle>
        </div>
        <CardDescription>
          Claude searches the web for US brands matching the target profile and queues them for
          enrichment. Runs automatically once daily; trigger manually any time.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label>Target profile</Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {targets.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.industry_segment} ({t.capability}) · {t.revenue_band}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {target && (
              <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                <Badge variant={target.capability} className="mb-1.5">
                  {target.capability}
                </Badge>
                <p>{target.description}</p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="max">Max candidates</Label>
            <Input
              id="max"
              type="number"
              min={1}
              max={25}
              value={max}
              onChange={(e) => setMax(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Be conservative — each candidate triggers research + scoring (~$0.10–$0.30 in
              Anthropic credits).
            </p>
          </div>

          <div className="flex items-end">
            <Button type="submit" disabled={running} className="w-full">
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching… (~30–60s)
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> Run discovery
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
