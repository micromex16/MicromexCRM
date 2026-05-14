'use client';

import { useEffect, useState } from 'react';
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
import { Plus, Loader2, Search, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CAPABILITY_LABELS, CAPABILITY_SHORT, type CapabilityBucket } from '@/lib/types/domain';

interface AddableCompany {
  id: string;
  name: string;
  domain: string | null;
  fit_score: number | null;
  status: string;
  capability_match: string[] | null;
  industry_segment: string | null;
  contact_count: number;
  already_in_campaign: boolean;
}

const BUCKETS: CapabilityBucket[] = ['electrical', 'refurb', 'packaging', 'mechanical'];

const BUCKET_TONE: Record<CapabilityBucket, { active: string; text: string }> = {
  electrical: { active: 'border-mx-500 bg-mx-50 text-mx-700', text: 'text-mx-700' },
  refurb: { active: 'border-emerald-500 bg-emerald-50 text-emerald-700', text: 'text-emerald-700' },
  packaging: { active: 'border-violet-500 bg-violet-50 text-violet-700', text: 'text-violet-700' },
  mechanical: { active: 'border-amber-500 bg-amber-50 text-amber-800', text: 'text-amber-800' },
};

export function AddLeadsDialog({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<AddableCompany[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [minScore, setMinScore] = useState('');
  const [activeBucket, setActiveBucket] = useState<CapabilityBucket | null>(null);
  const [campaignBucket, setCampaignBucket] = useState<CapabilityBucket | null>(null);
  const [bucketCounts, setBucketCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  async function load(bucketOverride?: CapabilityBucket | null) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (minScore) params.set('min', minScore);
      const bucket = bucketOverride ?? activeBucket;
      if (bucket) params.set('capability', bucket);
      const res = await fetch(`/api/campaigns/${campaignId}/add-leads?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setCompanies(json.companies ?? []);
      if (json.campaign_capability && !campaignBucket) {
        setCampaignBucket(json.campaign_capability);
        if (!activeBucket) setActiveBucket(json.campaign_capability);
      }
      if (json.bucket_counts) setBucketCounts(json.bucket_counts);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load addable leads');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      load();
      setSelected(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Debounce filter changes once dialog is open
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => load(), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, minScore, activeBucket]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    const eligible = companies.filter((c) => !c.already_in_campaign && c.contact_count > 0);
    setSelected(new Set(eligible.map((c) => c.id)));
  }

  async function commit() {
    if (selected.size === 0) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/add-leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_ids: Array.from(selected) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const inline = json.drafted_inline ?? 0;
      const later = json.queued_for_later ?? 0;
      const skip = json.skipped ?? 0;
      const fail = json.draft_failed ?? 0;
      const parts: string[] = [];
      if (inline > 0) parts.push(`${inline} drafted now`);
      if (later > 0) parts.push(`${later} more on next cron`);
      if (skip > 0) parts.push(`${skip} skipped (no email / unsubscribed)`);
      if (fail > 0) parts.push(`${fail} failed`);
      const headline = `Added ${json.companies_added} compan${json.companies_added === 1 ? 'y' : 'ies'}`;
      if (inline > 0 || later > 0) {
        toast.success(headline, {
          description: parts.join(' · ') || undefined,
        });
      } else {
        toast.error(`${headline} but nothing drafted`, {
          description: parts.join(' · ') || 'No emailable contacts at the selected companies.',
        });
      }
      setOpen(false);
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Add failed');
    } finally {
      setAdding(false);
    }
  }

  const eligible = companies.filter((c) => !c.already_in_campaign);
  const selectedEligible = Array.from(selected).filter((id) =>
    companies.find((c) => c.id === id && !c.already_in_campaign),
  ).length;

  const mismatchWarning = activeBucket && campaignBucket && activeBucket !== campaignBucket;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-3.5 w-3.5" /> Add leads
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add leads to this campaign</DialogTitle>
          <DialogDescription>
            Picking a company queues a draft for every emailable contact at that company.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Capability tabs */}
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Capability
            </div>
            <div className="flex flex-wrap gap-1.5">
              {BUCKETS.map((b) => {
                const isActive = activeBucket === b;
                const isCampaignBucket = campaignBucket === b;
                const count = bucketCounts[b] ?? 0;
                const tone = BUCKET_TONE[b];
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setActiveBucket(b)}
                    className={cn(
                      'group flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors',
                      isActive
                        ? tone.active
                        : 'border-border bg-card hover:bg-muted/40',
                    )}
                  >
                    <span className={cn('font-medium', isActive ? '' : tone.text)}>
                      {CAPABILITY_SHORT[b]}
                    </span>
                    <span className="opacity-60">({count})</span>
                    {isCampaignBucket && !isActive && (
                      <span className="text-[9px] uppercase tracking-wider opacity-70">
                        ← campaign
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {mismatchWarning && (
              <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <div>
                  This campaign uses the{' '}
                  <strong>{CAPABILITY_LABELS[campaignBucket!]}</strong> template. Leads you add
                  from <strong>{CAPABILITY_LABELS[activeBucket!]}</strong> will still be drafted
                  using that template — usually a mismatch. Switch back to the campaign&apos;s
                  capability unless you know what you&apos;re doing.
                </div>
              </div>
            )}
          </div>

          {/* Search + min score */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Filter by name…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-8 pl-8 text-sm"
              />
            </div>
            <Input
              type="number"
              min={0}
              max={100}
              placeholder="Min fit"
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
              className="h-8 w-24 text-sm"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={selectAllVisible}
              disabled={eligible.length === 0 || loading}
            >
              Select all
            </Button>
          </div>

          {/* Results */}
          <div className="max-h-[45vh] overflow-y-auto rounded-md border">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : companies.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No matching companies. Try clearing filters or switching capability tab.
              </div>
            ) : (
              <ul className="divide-y">
                {companies.map((c) => {
                  const disabled = c.already_in_campaign || c.contact_count === 0;
                  const isChecked = selected.has(c.id);
                  const caps = (c.capability_match ?? []) as CapabilityBucket[];
                  return (
                    <li key={c.id}>
                      <label
                        className={cn(
                          'flex cursor-pointer items-start gap-3 px-3 py-2 text-sm transition-colors',
                          disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-muted/50',
                          isChecked && !disabled && 'bg-mx-50',
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-3.5 w-3.5 accent-mx-500"
                          checked={isChecked}
                          disabled={disabled}
                          onChange={() => toggle(c.id)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{c.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {c.domain ?? '—'} {c.industry_segment && `· ${c.industry_segment}`}
                          </div>
                          {caps.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {caps.map((cap) => (
                                <span
                                  key={cap}
                                  className={cn(
                                    'rounded px-1.5 py-0.5 text-[10px] font-medium',
                                    BUCKET_TONE[cap].text,
                                    'bg-muted/60',
                                  )}
                                >
                                  {CAPABILITY_SHORT[cap]}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                          {c.already_in_campaign && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              already in
                            </span>
                          )}
                          {c.contact_count === 0 && !c.already_in_campaign && (
                            <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                              no contacts
                            </span>
                          )}
                          <span className="text-muted-foreground">
                            {c.contact_count} contact{c.contact_count === 1 ? '' : 's'}
                          </span>
                          {c.fit_score !== null && (
                            <span className="rounded bg-mx-100 px-1.5 py-0.5 text-[10px] font-semibold text-mx-700">
                              fit {c.fit_score}
                            </span>
                          )}
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="text-xs text-muted-foreground">
            {selectedEligible > 0 ? `${selectedEligible} selected` : 'Pick companies to add.'}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={adding}>
            Cancel
          </Button>
          <Button onClick={commit} disabled={adding || selectedEligible === 0}>
            {adding ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Adding…
              </>
            ) : (
              `Add ${selectedEligible} to campaign`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
