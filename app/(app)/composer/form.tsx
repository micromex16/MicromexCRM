'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mail, Sparkles, Send, ExternalLink, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import type { CapabilityBucket } from '@/lib/types/domain';

interface Lead {
  id: string;
  name: string;
  domain: string | null;
  fit_score: number | null;
  capability_match: string[] | null;
}

interface Template {
  id: string;
  name: string;
  capability_bucket: CapabilityBucket;
  variant_label: string;
  subject: string;
  body_md: string;
}

interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  email: string | null;
}

export function ComposerForm({
  initialLeadId,
  leads,
  templates,
}: {
  initialLeadId?: string;
  leads: Lead[];
  templates: Template[];
}) {
  const [leadId, setLeadId] = useState(initialLeadId ?? leads[0]?.id ?? '');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [templateId, setTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);

  const lead = leads.find((l) => l.id === leadId);
  const caps = (lead?.capability_match ?? []) as CapabilityBucket[];
  const filteredTemplates = templates.filter((t) => caps.length === 0 || caps.includes(t.capability_bucket));
  const selectedCount = selectedContactIds.size;
  const primaryContactId = selectedContactIds.values().next().value as string | undefined;

  useEffect(() => {
    if (!leadId) return;
    fetch(`/api/leads/${leadId}/contacts`)
      .then((r) => r.json())
      .then((j) => {
        const list: Contact[] = j.contacts ?? [];
        setContacts(list);
        // Auto-select the first contact (usually the primary one)
        setSelectedContactIds(new Set(list.length > 0 ? [list[0].id] : []));
      })
      .catch(() => {
        setContacts([]);
        setSelectedContactIds(new Set());
      });
  }, [leadId]);

  function toggleContact(id: string) {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedContactIds(new Set(contacts.filter((c) => c.email).map((c) => c.id)));
  }

  function selectNone() {
    setSelectedContactIds(new Set());
  }

  async function draft() {
    if (!primaryContactId || !templateId) return;
    setDrafting(true);
    try {
      const res = await fetch('/api/composer/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: primaryContactId, template_id: templateId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSubject(json.subject);
      setBody(json.body_md);
      toast.success(
        selectedCount > 1
          ? `Draft ready — first name will be substituted for each of the ${selectedCount} recipients.`
          : 'Draft ready — edit and send.',
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Draft failed');
    } finally {
      setDrafting(false);
    }
  }

  async function send() {
    if (selectedCount === 0 || !subject || !body) return;
    setSending(true);
    try {
      const res = await fetch('/api/composer/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_ids: Array.from(selectedContactIds),
          subject,
          body_md: body,
          template_id: templateId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const sent = json.sent ?? 0;
      const failed = json.failed ?? 0;
      const suppressed = json.skipped_suppressed ?? 0;
      if (sent > 0) {
        toast.success(`Sent to ${sent}${selectedCount > 1 ? ' contacts' : ''} ✉`, {
          description: [
            failed > 0 ? `${failed} failed` : null,
            suppressed > 0 ? `${suppressed} suppressed` : null,
          ].filter(Boolean).join(' · ') || undefined,
        });
      } else {
        toast.error('All sends failed', {
          description: (json.errors ?? []).slice(0, 3).join('\n') || undefined,
        });
      }
      setSubject('');
      setBody('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  function openMailto() {
    if (selectedContactIds.size === 0) return;
    const emails = contacts
      .filter((c) => selectedContactIds.has(c.id) && c.email)
      .map((c) => c.email!)
      .join(',');
    if (!emails) {
      toast.error('No emails on file for the selected contacts.');
      return;
    }
    const href = `mailto:${emails}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader>
          <CardTitle>Draft</CardTitle>
          <CardDescription>
            {selectedCount > 1
              ? `Same body sent to ${selectedCount} contacts. First name in the greeting is substituted per recipient.`
              : 'Personalize before sending.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="subj">Subject</Label>
            <Input id="subj" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="body">Body</Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-[280px]"
            />
            <p className="text-[11px] text-muted-foreground">
              Tip: use <code className="rounded bg-muted px-1">{'{{contact.first_name}}'}</code> in the greeting so each recipient gets their own name.
            </p>
          </div>

          {/* Signature preview — auto-appended to every send. Read-only. */}
          {body && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Auto-appended signature (preview)
              </Label>
              <div className="rounded-md border border-dashed bg-muted/30 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
                <div className="font-semibold text-foreground">Giovanni Garcin</div>
                <div>President, Micromex</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block rounded-sm bg-[#0A66C2] px-1 py-px text-[9px] font-bold text-white">
                      in
                    </span>
                    <a
                      href="https://www.linkedin.com/in/giovannigarcin/"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#0A66C2] hover:underline"
                    >
                      LinkedIn
                    </a>
                  </span>
                  <span>·</span>
                  <a
                    href="https://micromex.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-mx-600 hover:underline"
                  >
                    micromex.com
                  </a>
                </div>
                <div className="mt-3 border-t pt-2 text-[10px]">
                  Postal address + unsubscribe link added below (required for compliance).
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Configured via <code className="rounded bg-muted px-1">SIGNATURE_*</code> env vars.
                Same block goes on every send.
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={send} disabled={sending || !subject || !body || selectedCount === 0}>
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Sending…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send to {selectedCount} {selectedCount === 1 ? 'contact' : 'contacts'}
                </>
              )}
            </Button>
            <Button variant="outline" onClick={openMailto} disabled={!subject || !body || selectedCount === 0}>
              <ExternalLink className="h-4 w-4" /> Open in mail client
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Lead</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <Select value={leadId} onValueChange={setLeadId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a lead…" />
              </SelectTrigger>
              <SelectContent>
                {leads.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name} {l.fit_score != null ? `(${l.fit_score})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {lead && <div className="text-xs text-muted-foreground">{lead.domain ?? ''}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm">
              Contacts <span className="text-muted-foreground">({selectedCount} selected)</span>
            </CardTitle>
            {contacts.length > 0 && (
              <div className="flex gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-mx-600 hover:underline"
                >
                  All
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  type="button"
                  onClick={selectNone}
                  className="text-mx-600 hover:underline"
                >
                  None
                </button>
              </div>
            )}
          </CardHeader>
          <CardContent className="pt-0">
            {contacts.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">No contacts found.</p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto">
                {contacts.map((c) => {
                  const checked = selectedContactIds.has(c.id);
                  const hasEmail = Boolean(c.email);
                  return (
                    <li key={c.id}>
                      <label
                        className={`flex cursor-pointer items-start gap-2 rounded-md p-2 text-sm transition-colors ${
                          checked ? 'bg-mx-50' : 'hover:bg-muted/40'
                        } ${!hasEmail ? 'opacity-50' : ''}`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-3.5 w-3.5 accent-mx-500"
                          checked={checked}
                          disabled={!hasEmail}
                          onChange={() => toggleContact(c.id)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">
                            {[c.first_name, c.last_name].filter(Boolean).join(' ') || '(no name)'}
                          </div>
                          {c.title && (
                            <div className="truncate text-[11px] text-muted-foreground">{c.title}</div>
                          )}
                          {c.email ? (
                            <div className="truncate text-[11px] text-muted-foreground">{c.email}</div>
                          ) : (
                            <div className="text-[11px] italic text-destructive">no email on file</div>
                          )}
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Template</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a template…" />
              </SelectTrigger>
              <SelectContent>
                {filteredTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.variant_label})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="default"
              className="w-full"
              onClick={draft}
              disabled={!primaryContactId || !templateId || drafting}
            >
              {drafting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Drafting…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> Generate draft with Claude
                </>
              )}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Draft uses the first selected contact's name. The body is shared across all recipients;
              first names are substituted per send.
            </p>
          </CardContent>
        </Card>

        <Card className="border-mx-100 bg-mx-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              <Mail className="mr-1 inline h-4 w-4" /> Sending hygiene
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 pt-0 text-xs text-muted-foreground">
            <p>· Each contact counts against the daily cap.</p>
            <p>· Suppressed emails skipped silently.</p>
            <p>· Footer + unsubscribe link added automatically.</p>
            <p>
              <Check className="mr-1 inline h-3 w-3 text-mx-500" />
              Signature appended per send.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
