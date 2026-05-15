import Link from 'next/link';
import { Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ScoreBadge } from '@/components/common/score-badge';
import { CapabilityList } from '@/components/common/capability-badge';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { LeadFilters } from '@/components/leads/filters';
import { BulkEnrichButton } from '@/components/leads/bulk-enrich-button';
import { AddLeadDialog } from '@/components/leads/add-lead-dialog';
import { createClient } from '@/lib/supabase/server';
import type { CapabilityBucket, LeadStatus } from '@/lib/types/domain';

export const dynamic = 'force-dynamic';

interface SearchParams {
  cap?: string | string[];
  status?: string | string[];
  min?: string;
  has_email?: string;
  q?: string;
}

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = createClient();

  let query = supabase
    .from('companies')
    .select(
      'id, name, domain, industry_segment, fit_score, tariff_exposure_score, capability_match, status, last_activity_at',
      { count: 'exact' },
    )
    .order('fit_score', { ascending: false, nullsFirst: false })
    .limit(100);

  const caps = arr(searchParams.cap);
  const statuses = arr(searchParams.status);
  const min = searchParams.min ? parseInt(searchParams.min, 10) : null;

  if (caps.length) query = query.overlaps('capability_match', caps);
  if (statuses.length) query = query.in('status', statuses);
  if (min !== null && !Number.isNaN(min)) query = query.gte('fit_score', min);
  if (searchParams.q) query = query.ilike('name', `%${searchParams.q}%`);

  const { data: leads, count, error } = await query;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">
            {count ?? 0} companies · sorted by fit score
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <BulkEnrichButton />
          <AddLeadDialog />
          <Button asChild>
            <Link href="/sources">Import CSV</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="lg:w-60 lg:shrink-0">
          <LeadFilters />
        </div>

        <div className="min-w-0 flex-1">
          {error ? (
            <EmptyState
              icon={Users}
              title="Couldn't load leads"
              description={error.message}
            />
          ) : (leads ?? []).length === 0 ? (
            <EmptyState
              icon={Users}
              title="No leads yet"
              description="Drop an ImportYeti CSV at /sources or trigger a scrape. Enrichment workers will research and score every new company."
              action={{ label: 'Go to Sources', href: '/sources' }}
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company</TableHead>
                      <TableHead>Industry</TableHead>
                      <TableHead>Capability</TableHead>
                      <TableHead>Fit</TableHead>
                      <TableHead>Tariff</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(leads ?? []).map((l) => {
                      const row = l as {
                        id: string;
                        name: string;
                        domain: string | null;
                        industry_segment: string | null;
                        fit_score: number | null;
                        tariff_exposure_score: number | null;
                        capability_match: string[] | null;
                        status: LeadStatus;
                      };
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">
                            <Link
                              href={`/leads/${row.id}`}
                              className="hover:text-mx-600 hover:underline"
                            >
                              {row.name}
                            </Link>
                            <div className="text-xs text-muted-foreground">{row.domain ?? ''}</div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {row.industry_segment ?? '—'}
                          </TableCell>
                          <TableCell>
                            <CapabilityList
                              buckets={(row.capability_match ?? []) as CapabilityBucket[]}
                            />
                          </TableCell>
                          <TableCell>
                            <ScoreBadge score={row.fit_score} />
                          </TableCell>
                          <TableCell>
                            <ScoreBadge score={row.tariff_exposure_score} />
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={row.status} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function arr(v: string | string[] | undefined): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return [v];
}
