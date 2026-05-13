'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { CAPABILITY_LABELS, STATUS_LABELS, type CapabilityBucket, type LeadStatus } from '@/lib/types/domain';

interface Template {
  id: string;
  name: string;
  capability_bucket: CapabilityBucket;
  subject: string;
  variant_label: string;
}

const CAPS: CapabilityBucket[] = ['electrical', 'refurb', 'packaging', 'mechanical'];
const STATUSES: LeadStatus[] = ['qualified', 'researching', 'new'];

export function NewCampaignForm({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [capability, setCapability] = useState<CapabilityBucket>('electrical');
  const [templateId, setTemplateId] = useState<string>('');
  const [minScore, setMinScore] = useState('60');
  const [hasEmail, setHasEmail] = useState(true);
  const [dailyCap, setDailyCap] = useState('25');
  const [sendMode, setSendMode] = useState<'manual_review' | 'auto'>('manual_review');
  const [statuses, setStatuses] = useState<LeadStatus[]>(['qualified']);
  const [creating, setCreating] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const filteredTemplates = templates.filter((t) => t.capability_bucket === capability);
  const selectedTemplate = filteredTemplates.find((t) => t.id === templateId);

  async function createCampaign(launch: boolean) {
    setCreating(true);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          capability_bucket: capability,
          template_id: templateId,
          send_mode: sendMode,
          daily_send_cap: parseInt(dailyCap, 10) || 25,
          segment_filter: {
            capability_match: [capability],
            status: statuses,
            fit_score_min: parseInt(minScore, 10) || 0,
            has_email: hasEmail,
            limit: 200,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

      if (launch) {
        setLaunching(true);
        const launchRes = await fetch(`/api/campaigns/${json.id}/launch`, { method: 'POST' });
        const launchJson = await launchRes.json();
        if (!launchRes.ok) throw new Error(launchJson.error ?? `HTTP ${launchRes.status}`);
        toast.success(`Campaign launched · ${launchJson.queued} drafts queued`);
      } else {
        toast.success('Campaign created as draft');
      }
      router.push(`/campaigns/${json.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create campaign');
    } finally {
      setCreating(false);
      setLaunching(false);
      setConfirm(false);
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Setup</CardTitle>
            <CardDescription>All fields required.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Campaign name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Q2 2026 — Electrical / EV charging brands"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Capability</Label>
                <Select
                  value={capability}
                  onValueChange={(v) => {
                    setCapability(v as CapabilityBucket);
                    setTemplateId('');
                  }}
                >
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
                <Label>Template</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} ({t.variant_label})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="min">Min fit score</Label>
                <Input
                  id="min"
                  type="number"
                  min={0}
                  max={100}
                  value={minScore}
                  onChange={(e) => setMinScore(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cap">Daily send cap</Label>
                <Input
                  id="cap"
                  type="number"
                  min={1}
                  max={500}
                  value={dailyCap}
                  onChange={(e) => setDailyCap(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Lead statuses</Label>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      setStatuses((prev) =>
                        prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
                      )
                    }
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                      statuses.includes(s)
                        ? 'border-mx-500 bg-mx-50 text-mx-700'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Has email address</div>
                <div className="text-xs text-muted-foreground">
                  Only include contacts with a verified email.
                </div>
              </div>
              <Switch checked={hasEmail} onCheckedChange={setHasEmail} />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Auto-send</div>
                <div className="text-xs text-muted-foreground">
                  Off = drafts queue for manual review before sending.
                </div>
              </div>
              <Switch
                checked={sendMode === 'auto'}
                onCheckedChange={(v) => setSendMode(v ? 'auto' : 'manual_review')}
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Subject</div>
                <div className="font-medium">{selectedTemplate?.subject ?? '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Capability</div>
                <div>{CAPABILITY_LABELS[capability]}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Statuses</div>
                <div className="capitalize">{statuses.length ? statuses.join(', ') : '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Min fit score</div>
                <div>{minScore}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 pt-6">
              <Button
                className="w-full"
                disabled={!name || !templateId || statuses.length === 0 || creating}
                onClick={() => setConfirm(true)}
              >
                <Rocket className="h-4 w-4" />
                {sendMode === 'auto' ? 'Launch & start sending' : 'Launch & generate drafts'}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                disabled={!name || !templateId || creating}
                onClick={() => createCampaign(false)}
              >
                Save as draft
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Launch this campaign?</DialogTitle>
            <DialogDescription>
              We'll generate personalized drafts for every matching contact (capped at 200). Drafts
              go to the queue {sendMode === 'auto' ? 'and start sending on the next cron tick' : 'for you to review before sending'}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)} disabled={creating || launching}>
              Cancel
            </Button>
            <Button onClick={() => createCampaign(true)} disabled={creating || launching}>
              {creating ? 'Creating…' : launching ? 'Launching…' : 'Launch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
