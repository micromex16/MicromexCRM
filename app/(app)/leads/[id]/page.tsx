import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Mail, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ScoreBadge } from '@/components/common/score-badge';
import { CapabilityList } from '@/components/common/capability-badge';
import { StatusBadge } from '@/components/common/status-badge';
import { ResearchIntel } from '@/components/leads/research-intel';
import { ActivityTimeline, type ActivityRow } from '@/components/leads/activity-timeline';
import { LeadActions } from '@/components/leads/lead-actions';
import { EmailThread, type ThreadSend, type ThreadContact } from '@/components/leads/email-thread';
import { PipelineControls } from '@/components/leads/pipeline-controls';
import { createClient } from '@/lib/supabase/server';
import { initials } from '@/lib/utils';
import { format } from 'date-fns';
import type { CapabilityBucket, LeadStatus, ResearchIntelligence } from '@/lib/types/domain';

export const dynamic = 'force-dynamic';

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (!company) notFound();

  const c = company as {
    id: string;
    name: string;
    domain: string | null;
    website: string | null;
    industry_segment: string | null;
    revenue_band: string | null;
    employee_band: string | null;
    fit_score: number | null;
    tariff_exposure_score: number | null;
    capability_match: string[] | null;
    status: LeadStatus;
    research_summary: string | null;
    research_intelligence_json: ResearchIntelligence | null;
    source: string | null;
    created_at: string;
    last_activity_at: string | null;
    deal_value_usd: number | null;
    quote_sent_at: string | null;
    pipeline_notes: string | null;
  };

  const [contactsRes, shipmentsRes, activitiesRes, sendsRes] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, first_name, last_name, title, email, email_verified, is_primary, role_match_score, phone, linkedin_url')
      .eq('company_id', params.id)
      .order('is_primary', { ascending: false })
      .order('role_match_score', { ascending: false }),
    supabase
      .from('shipments')
      .select('id, arrival_date, shipper_name, shipper_country, product_description, hts_code, weight_kg, container_count')
      .eq('company_id', params.id)
      .order('arrival_date', { ascending: false })
      .limit(50),
    supabase
      .from('activities')
      .select('id, type, body, actor, created_at')
      .eq('company_id', params.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('sends')
      .select('id, contact_id, subject_rendered, body_rendered, status, sent_at, opened_at, clicked_at, replied_at, bounced_at, reply_body, reply_classification, created_at, contacts(first_name,last_name,email)')
      .eq('company_id', params.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const contacts = (contactsRes.data ?? []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    title: string | null;
    email: string | null;
    email_verified: boolean;
    is_primary: boolean;
    role_match_score: number;
    phone: string | null;
    linkedin_url: string | null;
  }>;
  const shipments = (shipmentsRes.data ?? []) as Array<{
    id: string;
    arrival_date: string | null;
    shipper_name: string | null;
    shipper_country: string | null;
    product_description: string | null;
    hts_code: string | null;
    weight_kg: number | null;
    container_count: number | null;
  }>;
  const activities = (activitiesRes.data ?? []) as ActivityRow[];
  const sends = (sendsRes.data ?? []) as Array<{
    id: string;
    contact_id: string;
    subject_rendered: string;
    body_rendered: string;
    status: string;
    sent_at: string | null;
    opened_at: string | null;
    clicked_at: string | null;
    replied_at: string | null;
    bounced_at: string | null;
    reply_body: string | null;
    reply_classification: string | null;
    created_at: string;
    contacts: { first_name: string | null; last_name: string | null; email: string | null } | null;
  }>;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <Link href="/leads" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back to leads
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-mx-500 text-lg font-bold text-white">
            {initials(c.name)}
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">{c.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {c.domain && (
                <a
                  href={c.website ?? `https://${c.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-mx-600"
                >
                  {c.domain} <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {c.industry_segment && <span>· {c.industry_segment}</span>}
              {c.revenue_band && <span>· {c.revenue_band}</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={c.status} />
              <ScoreBadge score={c.fit_score} label="fit" />
              <ScoreBadge score={c.tariff_exposure_score} label="tariff" />
              <CapabilityList buckets={(c.capability_match ?? []) as CapabilityBucket[]} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        <div className="order-2 min-w-0 space-y-4 lg:order-1">
          <Tabs defaultValue="overview">
            <TabsList className="flex w-full justify-start overflow-x-auto">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="research">Research</TabsTrigger>
              <TabsTrigger value="contacts">
                Contacts <span className="ml-1 text-muted-foreground">({contacts.length})</span>
              </TabsTrigger>
              <TabsTrigger value="shipments">
                Shipments <span className="ml-1 text-muted-foreground">({shipments.length})</span>
              </TabsTrigger>
              <TabsTrigger value="emails">
                Emails <span className="ml-1 text-muted-foreground">({sends.length})</span>
              </TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Research summary</CardTitle>
                  <CardDescription>
                    Claude-generated brief based on shipment evidence + company data.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {c.research_summary ? (
                    <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed">
                      {c.research_summary}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No research yet. Click <strong>Run enrichment</strong> in the side panel.
                    </p>
                  )}
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Source</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm capitalize text-muted-foreground">
                    {c.source ?? '—'} · added {format(new Date(c.created_at), 'PP')}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Last activity</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {c.last_activity_at ? format(new Date(c.last_activity_at), 'PPp') : '—'}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="research" className="space-y-4">
              {c.research_intelligence_json ? (
                <ResearchIntel intel={c.research_intelligence_json} />
              ) : (
                <Card>
                  <CardContent className="py-12 text-center text-sm text-muted-foreground">
                    No research intelligence yet. Run enrichment to generate it.
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="contacts" className="space-y-4">
              {contacts.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-sm text-muted-foreground">
                    No contacts found. Apollo/Hunter lookup runs as part of enrichment.
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Role match</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {contacts.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">
                              {p.first_name} {p.last_name}
                              {p.is_primary && (
                                <span className="ml-2 rounded bg-accent-amber/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent-amber">
                                  Primary
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {p.title ?? '—'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {p.email ? (
                                <a
                                  href={`mailto:${p.email}`}
                                  className="inline-flex items-center gap-1 hover:text-mx-600"
                                >
                                  <Mail className="h-3 w-3" /> {p.email}
                                </a>
                              ) : (
                                '—'
                              )}
                            </TableCell>
                            <TableCell>
                              <ScoreBadge score={p.role_match_score} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="shipments" className="space-y-4">
              {shipments.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-sm text-muted-foreground">
                    No shipments on record.
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Arrival</TableHead>
                          <TableHead>Shipper</TableHead>
                          <TableHead>Origin</TableHead>
                          <TableHead>HTS</TableHead>
                          <TableHead>Product</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shipments.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="text-sm">
                              {s.arrival_date ? format(new Date(s.arrival_date), 'PP') : '—'}
                            </TableCell>
                            <TableCell className="text-sm">{s.shipper_name ?? '—'}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {s.shipper_country ?? '—'}
                            </TableCell>
                            <TableCell className="text-sm font-mono">{s.hts_code ?? '—'}</TableCell>
                            <TableCell className="max-w-md truncate text-sm text-muted-foreground">
                              {s.product_description ?? '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="emails" className="space-y-4">
              <EmailThread
                contacts={contacts.map((p): ThreadContact => ({
                  id: p.id,
                  first_name: p.first_name,
                  last_name: p.last_name,
                  title: p.title,
                  email: p.email,
                }))}
                sends={sends.map((s): ThreadSend => ({
                  id: s.id,
                  contact_id: s.contact_id,
                  subject_rendered: s.subject_rendered,
                  body_rendered: s.body_rendered,
                  status: s.status,
                  sent_at: s.sent_at,
                  opened_at: s.opened_at,
                  clicked_at: s.clicked_at,
                  replied_at: s.replied_at,
                  bounced_at: s.bounced_at,
                  reply_body: s.reply_body,
                  reply_classification: s.reply_classification,
                  created_at: s.created_at,
                }))}
                leadId={c.id}
              />
            </TabsContent>

            <TabsContent value="activity" className="space-y-4">
              <Card>
                <CardContent className="p-6">
                  <ActivityTimeline items={activities} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="order-1 space-y-4 lg:order-2">
          <PipelineControls
            leadId={c.id}
            initialStatus={c.status}
            initialDealValue={c.deal_value_usd}
            initialNotes={c.pipeline_notes}
            initialQuoteSentAt={c.quote_sent_at}
          />
          <LeadActions leadId={c.id} />
        </div>
      </div>
    </div>
  );
}
