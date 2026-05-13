'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { CAPABILITY_LABELS, type CapabilityBucket } from '@/lib/types/domain';

const MERGE_TAGS = [
  '{{contact.first_name}}',
  '{{contact.last_name}}',
  '{{contact.title}}',
  '{{company.name}}',
  '{{company.domain}}',
  '{{shipments.top_hts_description}}',
  '{{shipments.top_origin_country}}',
];

const CAPS: CapabilityBucket[] = ['electrical', 'refurb', 'packaging', 'mechanical'];

interface TemplateProps {
  id: string;
  name: string;
  capability_bucket: CapabilityBucket;
  variant_label: string;
  subject: string;
  body_md: string;
  is_active: boolean;
}

const SAMPLE = {
  'contact.first_name': 'Sarah',
  'contact.last_name': 'Chen',
  'contact.title': 'VP Operations',
  'company.name': 'Acme Espresso',
  'company.domain': 'acmeespresso.com',
  'shipments.top_hts_description': 'small electrical appliances',
  'shipments.top_origin_country': 'China',
};

function preview(s: string) {
  return s.replace(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi, (_, k) => SAMPLE[k as keyof typeof SAMPLE] ?? `[${k}]`);
}

export function TemplateEditor({ template }: { template: TemplateProps }) {
  const router = useRouter();
  const [name, setName] = useState(template.name);
  const [capability, setCapability] = useState(template.capability_bucket);
  const [variant, setVariant] = useState(template.variant_label);
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body_md);
  const [active, setActive] = useState(template.is_active);
  const [saving, setSaving] = useState(false);

  function insertTag(tag: string) {
    setBody((b) => `${b}${tag}`);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          capability_bucket: capability,
          variant_label: variant,
          subject,
          body_md: body,
          is_active: active,
        }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      toast.success('Saved');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>{name || 'Untitled template'}</CardTitle>
              <CardDescription>Edit subject, body, and merge tags.</CardDescription>
            </div>
            <Button onClick={save} disabled={saving}>
              <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Capability</Label>
                <Select value={capability} onValueChange={(v) => setCapability(v as CapabilityBucket)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CAPS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CAPABILITY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="variant">Variant</Label>
                <Input id="variant" value={variant} onChange={(e) => setVariant(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="body">Body</Label>
              <div className="flex flex-wrap gap-1.5">
                {MERGE_TAGS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => insertTag(t)}
                    className="rounded border border-mx-100 bg-mx-50 px-1.5 py-0.5 font-mono text-[10px] text-mx-700 hover:bg-mx-100"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-[280px] font-mono text-xs"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Active</div>
              <div className="text-xs text-muted-foreground">Inactive templates can't be selected in campaigns.</div>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Preview</CardTitle>
          <CardDescription>Rendered with a sample lead.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="rounded-md border bg-card p-3">
            <div className="mb-1 text-xs text-muted-foreground">Subject</div>
            <div className="font-medium">{preview(subject)}</div>
          </div>
          <div className="rounded-md border bg-card p-3">
            <div className="mb-1 text-xs text-muted-foreground">Body</div>
            <div className="whitespace-pre-wrap leading-relaxed">{preview(body)}</div>
          </div>
          <div className="rounded-md border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
            <Badge variant="muted">Sample data</Badge> Real sends use the actual lead's data; missing values
            fall back to sensible defaults (e.g. "your team" instead of an empty company name).
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
