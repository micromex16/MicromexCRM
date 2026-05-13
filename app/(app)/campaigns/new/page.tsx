import { createClient } from '@/lib/supabase/server';
import { NewCampaignForm } from './form';
import type { CapabilityBucket } from '@/lib/types/domain';

export const dynamic = 'force-dynamic';

export default async function NewCampaignPage() {
  const supabase = createClient();
  const { data: templates } = await supabase
    .from('email_templates')
    .select('id, name, capability_bucket, subject, variant_label, is_active')
    .eq('is_active', true)
    .order('capability_bucket');

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">New campaign</h1>
        <p className="text-sm text-muted-foreground">
          Pick a capability bucket, choose a template, segment the lead list, launch.
        </p>
      </div>

      <NewCampaignForm
        templates={(templates ?? []) as Array<{
          id: string;
          name: string;
          capability_bucket: CapabilityBucket;
          subject: string;
          variant_label: string;
          is_active: boolean;
        }>}
      />
    </div>
  );
}
