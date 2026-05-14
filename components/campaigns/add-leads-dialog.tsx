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
import { Plus, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AddableCompany {
  id: string;
  name: string;
  domain: string | null;
  fit_score: number | null;
  status: string;
  industry_segment: string | null;
  contact_count: number;
  already_in_campaign: boolean;
}

export function AddLeadsDialog({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<AddableCompany[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [minScore, setMinScore] = useState('');
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (minScore) params.set('min', minScore);
      const res = await fetch(`/api/campaigns/${campaignId}/add-leads?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setCompanies(json.companies ?? []);
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
  }, [q, minScore]);

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
      toast.success(`Added ${json.companies_added} companies — ${json.queued} drafts queued`, {
        description: json.skipped > 0 ? `${json.skipped} contacts skipped (no email or unsubscribed)` : undefined,
      });
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
  const total = eligible.length;
  const selectedEligible = Array.from(selected).filter((id) =>
    companies.find((c) => c.id === id && !c.already_in_campaign),
  ).length;

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
            Companies matching this campaign&apos;s capability bucket. Picking a company queues a
            draft for every emailable contact at that company.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
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
              disabled={total === 0 || loading}
            >
              Select all
            </Button>
          </div>

          <div className="max-h-[50vh] overflow-y-auto rounded-md border">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : companies.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No matching companies. Try clearing filters.
              </div>
            ) : (
              <ul className="divide-y">
                {companies.map((c) => {
                  const disabled = c.already_in_campaign || c.contact_count === 0;
                  const isChecked = selected.has(c.id);
                  return (
                    <li key={c.id}>
                      <label
                        className={cn(
                          'flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors',
                          disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-muted/50',
                          isChecked && !disabled && 'bg-mx-50',
                        )}
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-mx-500"
                          checked={isChecked}
                          disabled={disabled}
                          onChange={() => toggle(c.id)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{c.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {c.domain ?? '—'} {c.industry_segment && `· ${c.industry_segment}`}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 text-xs">
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
                              {c.fit_score}
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
            {selectedEligible > 0 ? `${selectedEligible} selected` : 'Pick a few companies to add.'}
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
