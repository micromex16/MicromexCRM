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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { CAPABILITY_LABELS, type CapabilityBucket } from '@/lib/types/domain';
import { cn } from '@/lib/utils';

const CAPABILITIES: CapabilityBucket[] = ['electrical', 'refurb', 'packaging', 'mechanical'];

/**
 * Manual lead entry — for warm intros, referrals, inbound emails, trade-show
 * scans, anything that doesn't come through the CSV/scraper pipeline.
 *
 * Required: company name. Everything else is optional, including the contact
 * block (so you can capture the company first and chase down a contact later).
 *
 * When `Run enrichment after save` is checked, the company is dropped into
 * the research/score queue and picked up by the next cron tick.
 */
export function AddLeadDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Company
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [website, setWebsite] = useState('');
  const [industry, setIndustry] = useState('');
  const [hqCity, setHqCity] = useState('');
  const [hqState, setHqState] = useState('');
  const [revenueBand, setRevenueBand] = useState<string>('');
  const [employeeBand, setEmployeeBand] = useState<string>('');
  const [capabilities, setCapabilities] = useState<CapabilityBucket[]>([]);
  const [source, setSource] = useState<'manual' | 'referral' | 'linkedin' | 'csv_upload'>(
    'manual',
  );
  const [description, setDescription] = useState('');

  // Contact (optional)
  const [showContact, setShowContact] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');

  const [enrich, setEnrich] = useState(true);

  function reset() {
    setName('');
    setDomain('');
    setWebsite('');
    setIndustry('');
    setHqCity('');
    setHqState('');
    setRevenueBand('');
    setEmployeeBand('');
    setCapabilities([]);
    setSource('manual');
    setDescription('');
    setShowContact(false);
    setFirstName('');
    setLastName('');
    setTitle('');
    setEmail('');
    setPhone('');
    setLinkedinUrl('');
    setEnrich(true);
  }

  function toggleCap(c: CapabilityBucket) {
    setCapabilities((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  async function save() {
    if (!name.trim()) {
      toast.error('Company name is required');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        domain: domain.trim() || null,
        website: website.trim() || null,
        industry_segment: industry.trim() || null,
        hq_city: hqCity.trim() || null,
        hq_state: hqState.trim() || null,
        revenue_band: revenueBand || null,
        employee_band: employeeBand || null,
        capability_match: capabilities,
        description: description.trim() || null,
        source,
        contact: showContact
          ? {
              first_name: firstName.trim() || null,
              last_name: lastName.trim() || null,
              title: title.trim() || null,
              email: email.trim() || null,
              phone: phone.trim() || null,
              linkedin_url: linkedinUrl.trim() || null,
            }
          : null,
        enrich,
      };

      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));

      if (res.status === 409 && json.error === 'duplicate_domain') {
        toast.error(
          `Already in your leads: ${json.existing?.name ?? 'this company'}. Opening it now.`,
        );
        setOpen(false);
        if (json.existing?.id) router.push(`/leads/${json.existing.id}`);
        return;
      }

      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }

      toast.success(
        `Lead added${json.contact_id ? ' with contact' : ''}${
          json.enrichment_queued ? ' · enrichment queued' : ''
        }`,
      );
      reset();
      setOpen(false);
      // Take the user straight to the new lead's detail page
      router.push(`/leads/${json.company_id}`);
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
          <Plus className="h-4 w-4" /> Add manually
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a lead manually</DialogTitle>
          <DialogDescription>
            For inbound emails, referrals, trade-show scans — anything that didn&apos;t come
            through the CSV/scraper pipeline. Only the company name is required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Company section */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Company
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label htmlFor="al-name">Name *</Label>
                <Input
                  id="al-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="National Elevator Cab and Door Corp"
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="al-domain">Domain</Label>
                <Input
                  id="al-domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="necd.com"
                />
              </div>
              <div>
                <Label htmlFor="al-website">Website</Label>
                <Input
                  id="al-website"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://necd.com"
                />
              </div>
              <div>
                <Label htmlFor="al-industry">Industry</Label>
                <Input
                  id="al-industry"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="Elevator hardware"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="al-city">HQ city</Label>
                  <Input
                    id="al-city"
                    value={hqCity}
                    onChange={(e) => setHqCity(e.target.value)}
                    placeholder="Brooklyn"
                  />
                </div>
                <div>
                  <Label htmlFor="al-state">State</Label>
                  <Input
                    id="al-state"
                    value={hqState}
                    onChange={(e) => setHqState(e.target.value)}
                    placeholder="NY"
                  />
                </div>
              </div>
              <div>
                <Label>Revenue</Label>
                <Select value={revenueBand} onValueChange={setRevenueBand}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="<$1M">&lt; $1M</SelectItem>
                    <SelectItem value="$1M-$10M">$1M–$10M</SelectItem>
                    <SelectItem value="$10M-$50M">$10M–$50M</SelectItem>
                    <SelectItem value="$50M-$250M">$50M–$250M</SelectItem>
                    <SelectItem value="$250M-$1B">$250M–$1B</SelectItem>
                    <SelectItem value=">$1B">&gt; $1B</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Employees</Label>
                <Select value={employeeBand} onValueChange={setEmployeeBand}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-10">1–10</SelectItem>
                    <SelectItem value="11-50">11–50</SelectItem>
                    <SelectItem value="51-200">51–200</SelectItem>
                    <SelectItem value="201-500">201–500</SelectItem>
                    <SelectItem value="501-1000">501–1,000</SelectItem>
                    <SelectItem value="1000+">1,000+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Capabilities (which buckets fit?)</Label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {CAPABILITIES.map((c) => {
                    const on = capabilities.includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => toggleCap(c)}
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs font-medium transition',
                          on
                            ? 'border-mx-600 bg-mx-600 text-white'
                            : 'border-input bg-background text-foreground hover:bg-muted',
                        )}
                      >
                        {CAPABILITY_LABELS[c]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label>Source</Label>
                <Select
                  value={source}
                  onValueChange={(v) => setSource(v as typeof source)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual entry</SelectItem>
                    <SelectItem value="referral">Referral</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="csv_upload">CSV (other)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label htmlFor="al-desc">Notes / description</Label>
                <Textarea
                  id="al-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="How did this lead show up? What do you already know?"
                  rows={2}
                />
              </div>
            </div>
          </div>

          {/* Contact section */}
          <div className="space-y-3 border-t pt-4">
            <button
              type="button"
              onClick={() => setShowContact((v) => !v)}
              className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              {showContact ? '−' : '+'} {showContact ? 'Hide' : 'Add'} a first contact
            </button>
            {showContact && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="al-fn">First name</Label>
                  <Input
                    id="al-fn"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="al-ln">Last name</Label>
                  <Input
                    id="al-ln"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="al-title">Title</Label>
                  <Input
                    id="al-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="VP Operations"
                  />
                </div>
                <div>
                  <Label htmlFor="al-email">Email</Label>
                  <Input
                    id="al-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jane@necd.com"
                  />
                </div>
                <div>
                  <Label htmlFor="al-phone">Phone</Label>
                  <Input
                    id="al-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="al-li">LinkedIn</Label>
                  <Input
                    id="al-li"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    placeholder="https://linkedin.com/in/jane"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Enrichment toggle */}
          <label className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-sm">
            <input
              type="checkbox"
              checked={enrich}
              onChange={(e) => setEnrich(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Run Claude research + scoring after save</span>
              <span className="block text-xs text-muted-foreground">
                Queues a research job — populates intel, capability match, and fit score on the
                next enrichment cron tick (or hit &quot;Re-enrich&quot; on the lead page to run
                immediately). Costs ~$0.03.
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              'Add lead'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
