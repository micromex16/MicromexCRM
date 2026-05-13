import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/dashboard/stat-card';
import { CapabilityBadge } from '@/components/common/capability-badge';
import { createClient } from '@/lib/supabase/server';
import { format } from 'date-fns';
import { Send, MessageCircle, AlertCircle, Activity } from 'lucide-react';
import type { CapabilityBucket } from '@/lib/types/domain';

export const dynamic = 'force-dynamic';

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, name, capability_bucket, template_id, status, send_mode, daily_send_cap, total_targets, total_sent, total_replied, total_bounced, created_at, email_templates(name, subject)')
    .eq('id', params.id)
    .maybeSingle();
  if (!campaign) notFound();

  const c = campaign as {
    id: string;
    name: string;
    capability_bucket: CapabilityBucket;
    template_id: string | null;
    status: string;
    send_mode: string;
    daily_send_cap: number;
    total_targets: number | null;
    total_sent: number | null;
    total_replied: number | null;
    total_bounced: number | null;
    created_at: string;
    email_templates: { name: string; subject: string } | null;
  };

  const { data: sends } = await supabase
    .from('sends')
    .select('id, subject_rendered, status, sent_at, replied_at, reply_classification, contacts(first_name,last_name,email), companies(name)')
    .eq('campaign_id', params.id)
    .order('created_at', { ascending: false })
    .limit(100);
  const sendRows = (sends ?? []) as Array<{
    id: string;
    subject_rendered: string;
    status: string;
    sent_at: string | null;
    replied_at: string | null;
    reply_classification: string | null;
    contacts: { first_name: string | null; last_name: string | null; email: string | null } | null;
    companies: { name: string } | null;
  }>;

  const sent = c.total_sent ?? 0;
  const replied = c.total_replied ?? 0;
  const replyRate = sent === 0 ? 0 : Math.round((replied / sent) * 100);

  return (
    <div className="space-y-6 p-6">
      <div>
        <Link href="/campaigns" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back to campaigns
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{c.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <CapabilityBadge bucket={c.capability_bucket} />
            <Badge variant="muted">{c.status}</Badge>
            <Badge variant="outline">{c.send_mode}</Badge>
            <span className="text-xs text-muted-foreground">
              Created {format(new Date(c.created_at), 'PP')} · cap {c.daily_send_cap}/day
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Targets" value={String(c.total_targets ?? 0)} icon={Activity} />
        <StatCard label="Sent" value={String(sent)} icon={Send} />
        <StatCard label="Replied" value={String(replied)} icon={MessageCircle} delta={`${replyRate}% rate`} accent />
        <StatCard label="Bounced" value={String(c.total_bounced ?? 0)} icon={AlertCircle} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Send queue & history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sendRows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No sends yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>To</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reply</TableHead>
                  <TableHead>Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sendRows.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      {s.contacts?.first_name} {s.contacts?.last_name}
                      <div className="text-xs text-muted-foreground">{s.companies?.name}</div>
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
                      {s.sent_at ? format(new Date(s.sent_at), 'PP') : '—'}
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
