import { createClient } from '@/lib/supabase/server';
import { ComposerForm } from './form';
import type { CapabilityBucket } from '@/lib/types/domain';

export const dynamic = 'force-dynamic';

interface Search {
  lead?: string;
}

export default async function ComposerPage({ searchParams }: { searchParams: Search }) {
  const supabase = createClient();

  const { data: hotLeads } = await supabase
    .from('v_hot_leads')
    .select('id, name, domain, fit_score, capability_match')
    .limit(50);

  const { data: templates } = await supabase
    .from('email_templates')
    .select('id, name, capability_bucket, variant_label, subject, body_md, is_active')
    .eq('is_active', true)
    .order('capability_bucket');

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Composer</h1>
        <p className="text-sm text-muted-foreground">
          Manual send for high-value leads. Pick a lead, pick a template, let Claude draft, then
          edit before sending.
        </p>
      </div>

      <ComposerForm
        initialLeadId={searchParams.lead}
        leads={(hotLeads ?? []) as Array<{
          id: string;
          name: string;
          domain: string | null;
          fit_score: number | null;
          capability_match: string[] | null;
        }>}
        templates={(templates ?? []) as Array<{
          id: string;
          name: string;
          capability_bucket: CapabilityBucket;
          variant_label: string;
          subject: string;
          body_md: string;
        }>}
      />
    </div>
  );
}
