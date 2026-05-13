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
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { CAPABILITY_LABELS, type CapabilityBucket } from '@/lib/types/domain';

const CAPS: CapabilityBucket[] = ['electrical', 'refurb', 'packaging', 'mechanical'];

export function CustomTargetDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState('');
  const [capability, setCapability] = useState<CapabilityBucket>('electrical');
  const [industry, setIndustry] = useState('');
  const [description, setDescription] = useState('');
  const [revenue, setRevenue] = useState('$5M-$200M');
  const [origins, setOrigins] = useState('China, Vietnam');
  const [hints, setHints] = useState('');
  const [signals, setSignals] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/discovery/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          capability,
          industry_segment: industry,
          description,
          revenue_band: revenue,
          import_origins: split(origins),
          search_hints: split(hints, '\n'),
          product_signals: split(signals),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast.success('Custom target added — joins the daily rotation');
      setOpen(false);
      // reset
      setSlug(''); setIndustry(''); setDescription(''); setHints(''); setSignals('');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create target');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4" /> Add custom target
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New discovery target</DialogTitle>
          <DialogDescription>
            Define your own ICP slice — Claude will use these hints to find matching US brands.
            Joins the daily rotation alongside the 8 built-in targets.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="slug">Short ID (slug)</Label>
              <Input
                id="slug"
                required
                placeholder="e.g. coffee_grinders"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              />
            </div>
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
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="industry">Industry segment</Label>
            <Input
              id="industry"
              required
              placeholder="e.g. Premium coffee grinder brands"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desc">Description (what to look for)</Label>
            <Textarea
              id="desc"
              placeholder="What kind of company qualifies? What signals indicate they import from Asia? What price band?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[70px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="revenue">Revenue band</Label>
              <Input
                id="revenue"
                value={revenue}
                onChange={(e) => setRevenue(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="origins">Import origins (comma-sep)</Label>
              <Input
                id="origins"
                value={origins}
                onChange={(e) => setOrigins(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hints">Search hints (one per line)</Label>
            <Textarea
              id="hints"
              placeholder={'e.g.\nUS coffee grinder DTC brand\npremium burr grinder startup'}
              value={hints}
              onChange={(e) => setHints(e.target.value)}
              className="min-h-[70px] font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="signals">Product signals (comma-sep)</Label>
            <Input
              id="signals"
              placeholder="e.g. coffee grinder, burr grinder, espresso accessory"
              value={signals}
              onChange={(e) => setSignals(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !slug || !industry}>
              {submitting ? 'Saving…' : 'Add target'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function split(s: string, sep: string | RegExp = ','): string[] {
  return s
    .split(sep)
    .map((x) => x.trim())
    .filter(Boolean);
}
