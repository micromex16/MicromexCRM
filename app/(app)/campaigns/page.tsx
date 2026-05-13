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

export default async function CampaignsPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from('campaigns')
    .select('id, name, capability_bucket, status, total_targets, total_sent, total_replied, daily_send_cap, send_mode, created_at')
    .order('created_at', { ascending: false });

  const rows = (data ?? []) as Array<{
    id: string;
    name: string;
    capability_bucket: CapabilityBucket;
    status: 'draft' | 'live' | 'paused' | 'complete';
    total_targets: number | null;
    total_sent: number | null;
    total_replied: number | null;
    daily_send_cap: number;
    send_mode: 'auto' | 'manual_review';
    created_at: string;
  }>;

  return (
    <div className="space-y-6 p-6">
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

      {rows.length === 0 ? (
        <EmptyState
          icon={Send}
          title="No campaigns yet"
          description="Spin up your first campaign — pick a capability, pick a template, segment your leads, launch."
          action={{ label: 'New campaign', href: '/campaigns/new' }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {rows.map((c) => {
            const replyRate =
              (c.total_sent ?? 0) === 0
                ? 0
                : Math.round(((c.total_replied ?? 0) / (c.total_sent ?? 1)) * 100);
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
                      <CardDescription className="mt-1 flex items-center gap-2">
                        <CapabilityBadge bucket={c.capability_bucket} />
                        <span>·</span>
                        <span>{c.send_mode === 'auto' ? 'Auto-send' : 'Manual review'}</span>
                      </CardDescription>
                    </div>
                    <StatusChip status={c.status} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-3 border-t pt-4 text-center text-xs">
                    <Stat label="Targets" value={c.total_targets ?? 0} />
                    <Stat label="Sent" value={c.total_sent ?? 0} />
                    <Stat label="Replied" value={c.total_replied ?? 0} />
                    <Stat label="Reply %" value={`${replyRate}%`} accent />
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

function StatusChip({ status }: { status: 'draft' | 'live' | 'paused' | 'complete' }) {
  const map: Record<typeof status, 'default' | 'muted' | 'success' | 'secondary'> = {
    draft: 'muted',
    live: 'success',
    paused: 'secondary',
    complete: 'default',
  };
  return <Badge variant={map[status]}>{status}</Badge>;
}
