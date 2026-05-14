'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  campaignId: string;
  initial: {
    name: string;
    status: 'draft' | 'live' | 'paused' | 'complete';
    send_mode: 'auto' | 'manual_review';
    daily_send_cap: number;
  };
}

const STATUS_OPTIONS = ['draft', 'live', 'paused', 'complete'] as const;

export function EditCampaignDialog({ campaignId, initial }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial.name);
  const [status, setStatus] = useState(initial.status);
  const [sendMode, setSendMode] = useState(initial.send_mode);
  const [dailyCap, setDailyCap] = useState(String(initial.daily_send_cap));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const cap = parseInt(dailyCap, 10);
      if (Number.isNaN(cap) || cap < 1) throw new Error('Daily cap must be a positive number');
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, status, send_mode: sendMode, daily_send_cap: cap }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast.success('Campaign updated');
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="h-3.5 w-3.5" /> Edit settings
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit campaign</DialogTitle>
          <DialogDescription>
            Change the name, status, send mode, or daily cap. Doesn&apos;t affect already-queued sends.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="c-name">Name</Label>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Send mode</Label>
              <Select value={sendMode} onValueChange={(v) => setSendMode(v as typeof sendMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual_review">Manual review</SelectItem>
                  <SelectItem value="auto">Auto-send</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-cap">Daily send cap</Label>
            <Input
              id="c-cap"
              type="number"
              min={1}
              max={500}
              value={dailyCap}
              onChange={(e) => setDailyCap(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Max emails sent from THIS campaign per UTC day. Global cap also applies.
            </p>
          </div>
          <div className="rounded-md bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
            <strong>Tip:</strong> set status to <code className="rounded bg-card px-1">paused</code> to
            freeze sends without losing the queue. Switch back to <code className="rounded bg-card px-1">live</code>
            when ready.
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              'Save'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
