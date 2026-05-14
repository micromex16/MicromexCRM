import Link from 'next/link';
import { Plus, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/common/empty-state';
import { CapabilityBadge } from '@/components/common/capability-badge';
import { createClient } from '@/lib/supabase/server';
import { formatDistanceToNow } from 'date-fns';
import type { CapabilityBucket } from '@/lib/types/domain';

export const dynamic = 'force-dynamic';

interface CampaignRow {
  id: string;
  name: string;
  capability_bucket: CapabilityBucket;
  status: 'draft' | 'live' | 'paused' | 'complete';
  total_targets: number | null;
  daily_send_cap: number;
  send_mode: 'auto' | 'manual_review';
  created_at: string;
}

interface SendCountRow {
  campaign_id: string | null;
  status: string;
  sent_at: string | null;
  replied_at: string | null;
  bounced_at: string | null;
  opened_at: string | null;
}

interface JobCountRow {
  metadata_json: { campaign_id?: string } | null;
}

interface Live {
  drafting: number;
  queued: number;
  sent: number;
  replied: number;
  bounced: number;
  failed: number;
  opened: number;
}

export default async function CampaignsPage() {
  const supabase = createClient();

  // Pull campaigns + a single sweep of all sends (we'll aggregate live in JS).
  // Plus pending draft_email jobs for the per-campaign drafting count.
  const [campaignsRes, sendsRes, pendingJobsRes] = await Promise.all([
    supabase
      .from('campaigns')
      .select('id, name, capability_bucket, status, total_targets, daily_send_cap, send_mode, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('sends')
      .select('campaign_id, status, sent_at, replied_at, bounced_at, opened_at')
      .not('campaign_id', 'is', null),
    supabase
      .from('enrichment_jobs')
      .select('metadata_json')
      .eq('job_type', 'draft_email')
      .eq('status', 'pending'),
  ]);

  const campaigns = (campaignsRes.data ?? []) as CampaignRow[];
  const sends = (sendsRes.data ?? []) as SendCountRow[];
  const pendingJobs = (pendingJobsRes.data ?? []) as JobCountRow[];

  // Aggregate counts per campaign_id
  const liveByCampaign = new Map<string, Live>();
  for (const c of campaigns) {
    liveByCampaign.set(c.id, {
      drafting: 0,
      queued: 0,
      sent: 0,
      replied: 0,
      bounced: 0,
      failed: 0,
      opened: 0,
    });
  }
  for (const s of sends) {
    if (!s.campaign_id) continue;
    const live = liveByCampaign.get(s.campaign_id);
    if (!live) continue;
    if (s.status === 'queued' || s.status === 'manual_hold') live.queued++;
    if (s.sent_at) live.sent++;
    if (s.opened_at) live.opened++;
    if (s.replied_at || s.status === 'replied') live.replied++;
    if (s.bounced_at || s.status === 'bounced') live.bounced++;
    if (s.status === 'failed') live.failed++;
  }
  for (const j of pendingJobs) {
    const cid = j.metadata_json?.campaign_id;
    if (!cid) continue;
    const live = liveByCampaign.get(cid);
    if (!live) continue;
    live.drafting++;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Targeted outreach. One template per capability bucket.
          </p>
        </div>
        <Button asChild>
          <Link href="/campaigns/new">
            <Plus className="h-4 w-4" /> New campaign
          </Link>
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Send}
          title="No campaigns yet"
          description="Spin up your first campaign — pick a capability, pick a template, segment your leads, launch."
          action={{ label: 'New campaign', href: '/campaigns/new' }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {campaigns.map((c) => {
            const live = liveByCampaign.get(c.id) ?? {
              drafting: 0,
              queued: 0,
              sent: 0,
              replied: 0,
              bounced: 0,
              failed: 0,
              opened: 0,
            };
            const replyRate = live.sent === 0 ? 0 : Math.round((live.replied / live.sent) * 100);
            return (
              <Card key={c.id} className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle>
                        <Link href={`/campaigns/${c.id}`} className="hover:text-mx-600">
                          {c.name}
                        </Link>
                      </CardTitle>
                      <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
                        <CapabilityBadge bucket={c.capability_bucket} />
                        <span>·</span>
                        <span>{c.send_mode === 'auto' ? 'Auto-send' : 'Manual review'}</span>
                      </CardDescription>
                    </div>
                    <StatusChip status={c.status} />
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Pipeline stats row */}
                  <div className="grid grid-cols-4 gap-3 border-t pt-4 text-center text-xs">
                    <Stat label="Targets" value={c.total_targets ?? 0} />
                    <Stat label="Sent" value={live.sent} />
                    <Stat label="Replied" value={live.replied} />
                    <Stat label="Reply %" value={`${replyRate}%`} accent />
                  </div>
                  {/* Secondary row — what's in motion / what's stuck */}
                  <div className="mt-2 grid grid-cols-4 gap-3 border-t pt-2 text-center text-[10px]">
                    <SmallStat label="Drafting" value={live.drafting} tone={live.drafting > 0 ? 'amber' : 'muted'} />
                    <SmallStat label="Queued" value={live.queued} tone={live.queued > 0 ? 'mx' : 'muted'} />
                    <SmallStat label="Bounced" value={live.bounced} tone={live.bounced > 0 ? 'destructive' : 'muted'} />
                    <SmallStat label="Failed" value={live.failed} tone={live.failed > 0 ? 'destructive' : 'muted'} />
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    Started {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })} ·
                    cap {c.daily_send_cap}/day
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div>
      <div className={`font-display text-lg font-semibold ${accent ? 'text-accent-amber' : 'text-foreground'}`}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function SmallStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'amber' | 'mx' | 'destructive' | 'muted';
}) {
  const colorClass =
    tone === 'amber'
      ? 'text-amber-700'
      : tone === 'mx'
        ? 'text-mx-600'
        : tone === 'destructive'
          ? 'text-destructive'
          : 'text-muted-foreground';
  return (
    <div>
      <div className={`font-display text-sm font-semibold ${colorClass}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function StatusChip({ status }: { status: 'draft' | 'live' | 'paused' | 'complete' }) {
  const map: Record<typeof status, 'default' | 'muted' | 'success' | 'secondary'> = {
    draft: 'muted',
    live: 'success',
    paused: 'secondary',
    complete: 'default',
  };
  return <Badge variant={map[status]}>{status}</Badge>;
}
