import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { TemplateEditor } from './editor';
import type { CapabilityBucket } from '@/lib/types/domain';

export const dynamic = 'force-dynamic';

export default async function TemplateDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data } = await supabase
    .from('email_templates')
    .select('id, name, capability_bucket, variant_label, subject, body_md, is_active')
    .eq('id', params.id)
    .maybeSingle();
  if (!data) notFound();

  return (
    <div className="space-y-6 p-6">
      <div>
        <Link href="/templates" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back to templates
        </Link>
      </div>
      <TemplateEditor template={data as {
        id: string;
        name: string;
        capability_bucket: CapabilityBucket;
        variant_label: string;
        subject: string;
        body_md: string;
        is_active: boolean;
      }} />
    </div>
  );
}
