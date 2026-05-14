import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Send, MessageCircle, AlertCircle, Activity, Clock, ShieldOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CapabilityBadge } from '@/components/common/capability-badge';
import { EmptyState } from '@/components/common/empty-state';
import { EditCampaignDialog } from '@/components/campaigns/edit-campaign-dialog';
import { AddLeadsDialog } from '@/components/campaigns/add-leads-dialog';
import { createClient } from '@/lib/supabase/server';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { CapabilityBucket } from '@/lib/types/domain';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
  searchParams: { filter?: string };
}

interface CampaignRow {
  id: string;
  name: string;
  capability_bucket: CapabilityBucket;
  template_id: string | null;
  status: 'draft' | 'live' | 'paused' | 'complete';
  send_mode: 'auto' | 'manual_review';
  daily_send_cap: number;
  total_targets: number | null;
  total_sent: number | null;
  total_replied: number | null;
  total_bounced: number | null;
  created_at: string;
  email_templates: { name: string; subject: string } | null;
}

interface SendRow {
  id: string;
  subject_rendered: string;
  status: string;
  sent_at: string | null;
  opened_at: string | null;
  replied_at: string | null;
  bounced_at: string | null;
  reply_classification: string | null;
  created_at: string;
  contacts: { first_name: string | null; last_name: string | null; email: string | null } | null;
  companies: { id: string; name: string } | null;
}

const FILTERS = [
  { key: 'all', label: 'All', match: (_s: SendRow) => true },
  {
    key: 'queued',
    label: 'Queued',
    match: (s: SendRow) => s.status === 'queued' || s.status === 'manual_hold',
  },
  {
    key: 'sent',
    label: 'Sent',
    match: (s: SendRow) =>
      s.status === 'sent' || s.status === 'opened' || s.status === 'clicked' || Boolean(s.sent_at),
  },
  { key: 'opened', label: 'Opened', match: (s: SendRow) => Boolean(s.opened_at) },
  { key: 'replied', label: 'Replied', match: (s: SendRow) => Boolean(s.replied_at) || s.status === 'replied' },
  { key: 'bounced', label: 'Bounced', match: (s: SendRow) => Boolean(s.bounced_at) || s.status === 'bounced' },
  { key: 'failed', label: 'Failed', match: (s: SendRow) => s.status === 'failed' },
  { key: 'unsubscribed', label: 'Unsubscribed', match: (s: SendRow) => s.status === 'unsubscribed' },
] as const;

export default async function CampaignDetailPage({ params, searchParams }: PageProps) {
  const supabase = createClient();

  const { data: campaign } = await supabase
    .from('campaigns')
    .select(
      'id, name, capability_bucket, template_id, status, send_mode, daily_send_cap, total_targets, total_sent, total_replied, total_bounced, created_at, email_templates(name, subject)',
    )
    .eq('id', params.id)
    .maybeSingle();
  if (!campaign) notFound();
  const c = campaign as unknown as CampaignRow;

  const { data: sends } = await supabase
    .from('sends')
    .select(
      'id, subject_rendered, status, sent_at, opened_at, replied_at, bounced_at, reply_classification, created_at, contacts(first_name,last_name,email), companies(id,name)',
    )
    .eq('campaign_id', params.id)
    .order('created_at', { ascending: false })
    .limit(500);
  const sendRows = (sends ?? []) as unknown as SendRow[];

  // Compute live counts from the actual sends (more accurate than the
  // totals on the campaign row, which only get incremented at certain
  // points).
  const counts = {
    all: sendRows.length,
    queued: sendRows.filter(FILTERS[1].match).length,
    sent: sendRows.filter(FILTERS[2].match).length,
    opened: sendRows.filter(FILTERS[3].match).length,
    replied: sendRows.filter(FILTERS[4].match).length,
    bounced: sendRows.filter(FILTERS[5].match).length,
    failed: sendRows.filter(FILTERS[6].match).length,
    unsubscribed: sendRows.filter(FILTERS[7].match).length,
  };

  const sent = counts.sent;
  const replied = counts.replied;
  const replyRate = sent === 0 ? 0 : Math.round((replied / sent) * 100);

  const activeFilter = (searchParams.filter ?? 'all') as keyof typeof counts;
  const matchFn = FILTERS.find((f) => f.key === activeFilter)?.match ?? FILTERS[0].match;
  const filteredRows = sendRows.filter(matchFn);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <Link href="/campaigns" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back to campaigns
        </Link>
      </div>

      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{c.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <CapabilityBadge bucket={c.capability_bucket} />
            <Badge variant={c.status === 'live' ? 'success' : c.status === 'paused' ? 'secondary' : 'muted'}>
              {c.status}
            </Badge>
            <Badge variant="outline">
              {c.send_mode === 'auto' ? 'Auto-send' : 'Manual review'}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Created {format(new Date(c.created_at), 'PP')} · cap {c.daily_send_cap}/day
            </span>
            {c.email_templates && (
              <span className="text-xs text-muted-foreground">
                · Template: {c.email_templates.name}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AddLeadsDialog campaignId={c.id} />
          <EditCampaignDialog
            campaignId={c.id}
            initial={{
              name: c.name,
              status: c.status,
              send_mode: c.send_mode,
              daily_send_cap: c.daily_send_cap,
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <FilterStatCard
          label="Targets"
          value={c.total_targets ?? counts.all}
          icon={Activity}
          href={`/campaigns/${c.id}?filter=all`}
          active={activeFilter === 'all'}
        />
        <FilterStatCard
          label="Sent"
          value={sent}
          icon={Send}
          href={`/campaigns/${c.id}?filter=sent`}
          active={activeFilter === 'sent'}
        />
        <FilterStatCard
          label="Replied"
          value={replied}
          deltaText={sent > 0 ? `${replyRate}% rate` : undefined}
          icon={MessageCircle}
          accent
          href={`/campaigns/${c.id}?filter=replied`}
          active={activeFilter === 'replied'}
        />
        <FilterStatCard
          label="Bounced"
          value={counts.bounced}
          icon={AlertCircle}
          href={`/campaigns/${c.id}?filter=bounced`}
          active={activeFilter === 'bounced'}
        />
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const n = counts[f.key as keyof typeof counts];
          const isActive = activeFilter === f.key;
          return (
            <Link
              key={f.key}
              href={`/campaigns/${c.id}?filter=${f.key}`}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                isActive
                  ? 'border-mx-500 bg-mx-500 text-white'
                  : 'border-border bg-card hover:bg-muted/40',
              )}
            >
              {f.label} <span className="ml-0.5 opacity-70">({n})</span>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle>
              {activeFilter === 'all' ? 'Send queue & history' : FILTERS.find((f) => f.key === activeFilter)?.label}
            </CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {filteredRows.length} of {sendRows.length} sends
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredRows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={activeFilter === 'all' ? Send : activeFilter === 'replied' ? MessageCircle : activeFilter === 'unsubscribed' ? ShieldOff : Clock}
                title={activeFilter === 'all' ? 'No sends yet' : `No ${activeFilter} sends`}
                description={
                  activeFilter === 'all'
                    ? 'Add leads to this campaign to queue drafts. Use the Add leads button above.'
                    : 'Try a different filter, or add more leads.'
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>To</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reply</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1">
                        {s.contacts?.first_name} {s.contacts?.last_name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.companies?.id ? (
                          <Link
                            href={`/leads/${s.companies.id}`}
                            className="hover:text-mx-600 hover:underline"
                          >
                            {s.companies.name}
                          </Link>
                        ) : (
                          s.companies?.name
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-md truncate text-sm">{s.subject_rendered}</TableCell>
                    <TableCell>
                      <span className="text-xs capitalize">{s.status}</span>
                    </TableCell>
                    <TableCell>
                      {s.reply_classification ? (
                        <Badge variant="secondary">{s.reply_classification}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.sent_at
                        ? formatDistanceToNow(new Date(s.sent_at), { addSuffix: true })
                        : formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FilterStatCard({
  label,
  value,
  deltaText,
  icon: Icon,
  href,
  active,
  accent,
}: {
  label: string;
  value: number;
  deltaText?: string;
  icon: typeof Send;
  href: string;
  active: boolean;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group rounded-xl border bg-card p-4 transition-all hover:shadow-md',
        active && 'border-mx-500 ring-2 ring-mx-100',
      )}
    >
      <div className="flex items-center justify-between pb-1">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <Icon className={cn('h-4 w-4', accent ? 'text-accent-amber' : 'text-mx-400')} />
      </div>
      <div className="font-display text-2xl font-semibold tracking-tight">{value}</div>
      {deltaText && <div className="text-xs text-muted-foreground">{deltaText}</div>}
    </Link>
  );
}
