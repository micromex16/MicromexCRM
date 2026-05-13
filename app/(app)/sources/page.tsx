import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrapeForm } from '@/components/sources/scrape-form';
import { CsvUpload } from '@/components/sources/csv-upload';
import { createClient } from '@/lib/supabase/server';
import { formatDistanceToNow } from 'date-fns';

export const dynamic = 'force-dynamic';

export default async function SourcesPage() {
  const supabase = createClient();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: shipments } = await supabase
    .from('shipments')
    .select('source, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500);

  const rows = (shipments ?? []) as { source: string; created_at: string }[];
  const buckets = new Map<string, { source: string; day: string; count: number; latest: string }>();
  for (const r of rows) {
    const day = r.created_at.slice(0, 10);
    const key = `${r.source}:${day}`;
    const b = buckets.get(key);
    if (b) {
      b.count++;
      if (r.created_at > b.latest) b.latest = r.created_at;
    } else {
      buckets.set(key, { source: r.source, day, count: 1, latest: r.created_at });
    }
  }
  const runs = Array.from(buckets.values()).sort((a, b) => b.latest.localeCompare(a.latest));

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Sources</h1>
        <p className="text-sm text-muted-foreground">
          Pull shipment data from ImportYeti and feed it to the enrichment pipeline.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <ScrapeForm />
          <CsvUpload />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Last 30 days</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {runs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No ingest runs yet.
              </p>
            ) : (
              <ul className="space-y-3 text-sm">
                {runs.slice(0, 10).map((r) => (
                  <li key={`${r.source}:${r.day}`} className="flex items-start justify-between border-b pb-3 last:border-0">
                    <div>
                      <div className="font-medium capitalize">{r.source.replace('_', ' ')}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(r.latest), { addSuffix: true })}
                      </div>
                    </div>
                    <div className="font-display text-base font-semibold text-mx-600">
                      {r.count}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
