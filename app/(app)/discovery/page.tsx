import Link from 'next/link';
import { Sparkles, Clock, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CapabilityBadge } from '@/components/common/capability-badge';
import { EmptyState } from '@/components/common/empty-state';
import { DiscoveryForm } from '@/components/sources/discovery-form';
import { CustomTargetDialog } from '@/components/discovery/custom-target-dialog';
import { createClient } from '@/lib/supabase/server';
import { todaysTarget } from '@/lib/discovery/targets';
import { allActiveTargets } from '@/lib/discovery/all-targets';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface RunRow {
  id: string;
  target_id: string;
  trigger: 'manual' | 'cron';
  candidates_returned: number;
  companies_created: number;
  companies_skipped_dedupe: number;
  jobs_enqueued: number;
  duration_ms: number | null;
  errors: unknown[] | null;
  created_at: string;
  profiles: { email: string; full_name: string | null } | null;
}

interface SummaryRow {
  runs_7d: number;
  companies_7d: number;
  jobs_7d: number;
  companies_30d: number;
  last_run_at: string | null;
}

export default async function DiscoveryPage() {
  const supabase = createClient();
  const today = todaysTarget();

  const [runsRes, summaryRes, allTargets] = await Promise.all([
    supabase
      .from('discovery_runs')
      .select('id, target_id, trigger, candidates_returned, companies_created, companies_skipped_dedupe, jobs_enqueued, duration_ms, errors, created_at, profiles(email, full_name)')
      .order('created_at', { ascending: false })
      .limit(30),
    supabase.from('v_discovery_summary').select('*').maybeSingle(),
    allActiveTargets(),
  ]);

  const runs = (runsRes.data ?? []) as unknown as RunRow[];
  const summary = (summaryRes.data as SummaryRow | null) ?? {
    runs_7d: 0,
    companies_7d: 0,
    jobs_7d: 0,
    companies_30d: 0,
    last_run_at: null,
  };

  const runsByTarget = new Map<string, { count: number; companies: number; last: string }>();
  for (const r of runs) {
    const existing = runsByTarget.get(r.target_id);
    if (existing) {
      existing.count++;
      existing.companies += r.companies_created;
      if (r.created_at > existing.last) existing.last = r.created_at;
    } else {
      runsByTarget.set(r.target_id, {
        count: 1,
        companies: r.companies_created,
        last: r.created_at,
      });
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Discovery</h1>
          <p className="text-sm text-muted-foreground">
            Claude searches the web for US brands matching your ICP, dedupes, and queues them for
            full enrichment.
          </p>
        </div>
        <Badge variant="hot" className="px-3 py-1">
          <Sparkles className="mr-1.5 h-3 w-3" /> Today&apos;s rotation: {today.industry_segment}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Runs (7d)" value={summary.runs_7d} icon={Sparkles} />
        <StatCard label="Companies (7d)" value={summary.companies_7d} icon={CheckCircle2} accent />
        <StatCard label="Companies (30d)" value={summary.companies_30d} icon={CheckCircle2} />
        <StatCard
          label="Last run"
          valueText={summary.last_run_at ? formatDistanceToNow(new Date(summary.last_run_at), { addSuffix: true }) : '—'}
          icon={Clock}
        />
      </div>

      <DiscoveryForm
        targets={allTargets.map((t) => ({
          id: t.id,
          capability: t.capability,
          industry_segment: t.industry_segment,
          revenue_band: t.revenue_band,
          description: t.description,
        }))}
      />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Target profiles</CardTitle>
            <CardDescription>
              {allTargets.length} ICP slices the agent rotates through daily — built-in + your custom targets.
            </CardDescription>
          </div>
          <CustomTargetDialog />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            {allTargets.map((t) => {
              const stats = runsByTarget.get(t.id);
              const isToday = t.id === today.id;
              return (
                <div
                  key={t.id}
                  className={cn(
                    'rounded-lg border bg-card p-3 transition-shadow hover:shadow-md',
                    isToday && 'border-accent-amber bg-accent-amber/[0.04]',
                  )}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <CapabilityBadge bucket={t.capability} />
                    <div className="flex gap-1">
                      {t.id.startsWith('custom_') && (
                        <span className="rounded bg-mx-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-mx-700">
                          Custom
                        </span>
                      )}
                      {isToday && (
                        <span className="rounded bg-accent-amber/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent-amber">
                          Today
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mb-1 font-display text-sm font-semibold">{t.industry_segment}</div>
                  <div className="mb-2 text-xs text-muted-foreground">{t.revenue_band}</div>
                  <div className="flex items-center gap-3 text-xs">
                    <span>
                      <strong className="text-foreground">{stats?.count ?? 0}</strong>{' '}
                      <span className="text-muted-foreground">runs</span>
                    </span>
                    <span>
                      <strong className="text-mx-600">{stats?.companies ?? 0}</strong>{' '}
                      <span className="text-muted-foreground">leads</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Run history</CardTitle>
          <CardDescription>Last 30 runs across cron + manual triggers.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {runs.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Sparkles}
                title="No runs yet"
                description="Run the agent above on any target — the first run takes 30–60 seconds while Claude does web research."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead className="text-right">Candidates</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                  <TableHead className="text-right">Dedupe</TableHead>
                  <TableHead className="text-right">Jobs</TableHead>
                  <TableHead className="text-right">Took</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => {
                  const errCount = Array.isArray(r.errors) ? r.errors.length : 0;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">
                        <div>{format(new Date(r.created_at), 'PP')}</div>
                        <div className="text-muted-foreground">
                          {format(new Date(r.created_at), 'p')}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{r.target_id}</TableCell>
                      <TableCell>
                        <Badge variant={r.trigger === 'cron' ? 'muted' : 'secondary'}>
                          {r.trigger}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{r.candidates_returned}</TableCell>
                      <TableCell className="text-right font-semibold text-mx-600">
                        {r.companies_created}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {r.companies_skipped_dedupe}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {r.jobs_enqueued}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : '—'}
                      </TableCell>
                      <TableCell>
                        {errCount > 0 && (
                          <Badge variant="destructive" className="text-[10px]">
                            <AlertCircle className="mr-1 h-3 w-3" />
                            {errCount}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-mx-100 bg-mx-50/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6 text-sm">
          <div className="text-muted-foreground">
            Newly discovered companies enter the standard pipeline: research → contact lookup →
            scoring → ready to add to a campaign.
          </div>
          <Link
            href="/leads?status=new,researching,qualified"
            className="inline-flex items-center gap-1 font-medium text-mx-600 hover:text-mx-700"
          >
            View leads <ArrowRight className="h-3 w-3" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  valueText,
  icon: Icon,
  accent,
}: {
  label: string;
  value?: number;
  valueText?: string;
  icon: typeof Sparkles;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className={cn('h-4 w-4', accent ? 'text-accent-amber' : 'text-mx-400')} />
      </CardHeader>
      <CardContent>
        <div className="font-display text-2xl font-semibold tracking-tight">
          {valueText ?? value}
        </div>
      </CardContent>
    </Card>
  );
}
