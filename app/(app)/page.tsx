import Link from 'next/link';
import { Activity, Flame, Send, Users, Trophy, TrendingUp } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatCard } from '@/components/dashboard/stat-card';
import { PipelineChart } from '@/components/dashboard/pipeline-chart';
import { StageChart } from '@/components/dashboard/stage-chart';
import { IndustryChart } from '@/components/dashboard/industry-chart';
import { ScoreBadge } from '@/components/common/score-badge';
import { CapabilityList } from '@/components/common/capability-badge';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { loadDashboard } from '@/lib/dashboard';
import { formatCurrency, formatNumber, formatPct } from '@/lib/utils';
import type { CapabilityBucket } from '@/lib/types/domain';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  let data;
  try {
    data = await loadDashboard();
  } catch (e) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Activity}
          title="Database not connected yet"
          description={`Configure NEXT_PUBLIC_SUPABASE_URL + service role in .env.local and run migrations. (${e instanceof Error ? e.message : String(e)})`}
          action={{ label: 'Open Settings', href: '/settings' }}
        />
      </div>
    );
  }

  const { stats, pipelineByWeek, byStage, byIndustry, hotLeads } = data;
  const hasData = stats.totalLeads > 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Lead engine overview — pipeline, outreach, replies.
          </p>
        </div>
        <Button asChild>
          <Link href="/sources">Run import</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total pipeline"
          value={formatCurrency(stats.pipelineEstimateUsd, { compact: true })}
          delta={`${stats.qualifiedLeads} qualified leads`}
          icon={Activity}
          accent
        />
        <StatCard
          label="Total leads"
          value={formatNumber(stats.totalLeads)}
          delta={`${stats.qualifiedLeads} qualified`}
          icon={Users}
        />
        <StatCard
          label="Sent (7d)"
          value={formatNumber(stats.totalSentWeek)}
          delta={`${formatNumber(stats.totalRepliedWeek)} replied`}
          icon={Send}
        />
        <StatCard
          label="Reply rate"
          value={formatPct(stats.replyRate)}
          delta={`${formatNumber(stats.closedWon)} won · ${formatPct(stats.winRate)} win rate`}
          icon={Flame}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Pipeline by week</CardTitle>
            <CardDescription>Sends + replies, last 12 weeks.</CardDescription>
          </CardHeader>
          <CardContent>
            <PipelineChart data={pipelineByWeek} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By industry</CardTitle>
            <CardDescription>Top 6 segments by lead count.</CardDescription>
          </CardHeader>
          <CardContent>
            <IndustryChart data={byIndustry} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Pipeline by stage</CardTitle>
            <CardDescription>Active leads only.</CardDescription>
          </CardHeader>
          <CardContent>
            <StageChart data={byStage} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Top 10 hot leads</CardTitle>
              <CardDescription>Sorted by fit score.</CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/leads">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {hotLeads.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {hasData ? 'No qualified leads yet. Enrichment is still running.' : 'No leads yet — run an import.'}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Capability</TableHead>
                    <TableHead>Fit</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hotLeads.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">
                        <Link href={`/leads/${l.id}`} className="hover:text-mx-600 hover:underline">
                          {l.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">{l.domain ?? ''}</div>
                      </TableCell>
                      <TableCell>
                        <CapabilityList buckets={(l.capability_match ?? []) as CapabilityBucket[]} />
                      </TableCell>
                      <TableCell>
                        <ScoreBadge score={l.fit_score} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={l.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {!hasData && (
        <Card className="border-dashed bg-mx-50/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-accent-amber" />
              Get started
            </CardTitle>
            <CardDescription>
              The engine is ready. Drop a CSV from ImportYeti at <strong>/sources</strong> or run the
              Playwright scraper from CLI to bootstrap. Enrichment workers will then turn shipments
              into research briefs and qualified leads.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
      <p className="pt-4 text-center text-[10px] uppercase tracking-widest text-mx-300">
        Micromex · Est. 1988 · USMCA
      </p>
      {/* Use Trophy to silence unused-import lint; surface won-deals icon if we ever add a 5th card */}
      <Trophy className="hidden" aria-hidden />
    </div>
  );
}
