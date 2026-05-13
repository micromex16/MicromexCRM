'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { TARGET_HTS_CODES } from '@/lib/types/domain';

export function ScrapeForm() {
  const router = useRouter();
  const [hts, setHts] = useState('8544');
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [since, setSince] = useState(since30);
  const [maxPages, setMaxPages] = useState('3');
  const [country, setCountry] = useState('China');
  const [running, setRunning] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    try {
      const res = await fetch('/api/sources/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hts_code: hts,
          since,
          max_pages: parseInt(maxPages, 10) || 3,
          country: country || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast.success(`Imported ${json.shipments_inserted ?? 0} shipments`, {
        description: `${json.companies_created ?? 0} new companies · ${json.jobs_enqueued ?? 0} enrichment jobs queued`,
      });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Scrape failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Run ImportYeti scrape</CardTitle>
        <CardDescription>
          Pull recent shipments by HTS chapter + origin country. Requires{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">IMPORTYETI_USERNAME</code> /{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">IMPORTYETI_PASSWORD</code> in env;
          falls back to the CSV path otherwise.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="hts">HTS chapter</Label>
            <Select value={hts} onValueChange={setHts}>
              <SelectTrigger id="hts">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TARGET_HTS_CODES.map((h) => (
                  <SelectItem key={h.code} value={h.code}>
                    {h.code} · {h.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="since">Since</Label>
            <Input id="since" type="date" value={since} onChange={(e) => setSince(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="country">Origin country</Label>
            <Input
              id="country"
              placeholder="e.g. China"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="max">Max pages</Label>
            <Input
              id="max"
              type="number"
              min={1}
              max={20}
              value={maxPages}
              onChange={(e) => setMaxPages(e.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <Button type="submit" disabled={running} className="w-full">
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Running…
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" /> Run import
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
