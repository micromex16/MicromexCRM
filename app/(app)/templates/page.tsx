import Link from 'next/link';
import { FileText, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CapabilityBadge } from '@/components/common/capability-badge';
import { EmptyState } from '@/components/common/empty-state';
import { createClient } from '@/lib/supabase/server';
import { CAPABILITY_LABELS, type CapabilityBucket } from '@/lib/types/domain';

export const dynamic = 'force-dynamic';

const BUCKETS: CapabilityBucket[] = ['electrical', 'refurb', 'packaging', 'mechanical'];

export default async function TemplatesPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from('email_templates')
    .select('id, name, capability_bucket, variant_label, subject, is_active, updated_at')
    .order('capability_bucket')
    .order('variant_label');

  const rows = (data ?? []) as Array<{
    id: string;
    name: string;
    capability_bucket: CapabilityBucket;
    variant_label: string;
    subject: string;
    is_active: boolean;
    updated_at: string;
  }>;

  const grouped = BUCKETS.map((b) => ({
    bucket: b,
    templates: rows.filter((r) => r.capability_bucket === b),
  }));

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="text-sm text-muted-foreground">
            One file per capability bucket. Variants A/B run A/B tests.
          </p>
        </div>
        <Button asChild>
          <Link href="/templates/new">
            <Plus className="h-4 w-4" /> New template
          </Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No templates yet"
          description="Run the seed script (pnpm seed) to drop the 8 starter templates, or create one from scratch."
          action={{ label: 'Create template', href: '/templates/new' }}
        />
      ) : (
        <div className="space-y-6">
          {grouped.map((g) => (
            <div key={g.bucket}>
              <div className="mb-3 flex items-center gap-2">
                <CapabilityBadge bucket={g.bucket} />
                <span className="text-sm text-muted-foreground">{CAPABILITY_LABELS[g.bucket]}</span>
              </div>
              {g.templates.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-6 text-center text-sm text-muted-foreground">
                    No templates in this bucket yet.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {g.templates.map((t) => (
                    <Card key={t.id} className="transition-shadow hover:shadow-md">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-base">
                            <Link href={`/templates/${t.id}`} className="hover:text-mx-600">
                              {t.name}
                            </Link>
                          </CardTitle>
                          <div className="flex shrink-0 gap-1">
                            <Badge variant="outline">{t.variant_label}</Badge>
                            {!t.is_active && <Badge variant="muted">Inactive</Badge>}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="text-sm text-muted-foreground">
                        <p className="line-clamp-2">{t.subject}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
