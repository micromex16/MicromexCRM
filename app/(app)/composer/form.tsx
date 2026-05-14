'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mail, Sparkles, Send, ExternalLink, Loader2 } from 'lucide-react';
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
  const [contactId, setContactId] = useState<string>('');
  const [contacts, setContacts] = useState<Array<{ id: string; first_name: string | null; last_name: string | null; title: string | null; email: string | null }>>([]);
  const [templateId, setTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);

  const lead = leads.find((l) => l.id === leadId);
  const caps = (lead?.capability_match ?? []) as CapabilityBucket[];
  const filteredTemplates = templates.filter((t) => caps.length === 0 || caps.includes(t.capability_bucket));

  useEffect(() => {
    if (!leadId) return;
    fetch(`/api/leads/${leadId}/contacts`)
      .then((r) => r.json())
      .then((j) => {
        setContacts(j.contacts ?? []);
        if (j.contacts?.length) setContactId(j.contacts[0].id);
      })
      .catch(() => setContacts([]));
  }, [leadId]);

  async function draft() {
    if (!contactId || !templateId) return;
    setDrafting(true);
    try {
      const res = await fetch('/api/composer/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, template_id: templateId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSubject(json.subject);
      setBody(json.body_md);
      toast.success('Draft ready — edit and send.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Draft failed');
    } finally {
      setDrafting(false);
    }
  }

  async function send() {
    if (!contactId || !subject || !body) return;
    setSending(true);
    try {
      const res = await fetch('/api/composer/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, subject, body_md: body, template_id: templateId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (json.status === 'sent') {
        toast.success('Sent ✉', {
          description: json.resend_message_id ? `Resend ID: ${json.resend_message_id}` : undefined,
        });
      } else if (json.status === 'skipped_suppressed') {
        toast.error('Skipped — contact is on the suppression list');
      } else {
        toast.error('Send failed', { description: json.error ?? 'unknown' });
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
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact?.email) {
      toast.error('No email on file for this contact.');
      return;
    }
    const href = `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader>
          <CardTitle>Draft</CardTitle>
          <CardDescription>Personalize before sending.</CardDescription>
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
              className="min-h-[320px]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={send} disabled={sending || !subject || !body || !contactId}>
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Queueing…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" /> Send via Resend
                </>
              )}
            </Button>
            <Button variant="outline" onClick={openMailto} disabled={!subject || !body}>
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
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Contact</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Select value={contactId} onValueChange={setContactId} disabled={contacts.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={contacts.length === 0 ? 'No contacts found' : 'Pick a contact…'} />
              </SelectTrigger>
              <SelectContent>
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {[c.first_name, c.last_name].filter(Boolean).join(' ')}
                    {c.title ? ` · ${c.title}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              disabled={!contactId || !templateId || drafting}
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
              Claude rewrites the template in plain English using the lead's research + shipment data.
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
            <p>· Sends count against the daily cap.</p>
            <p>· Suppressed emails are skipped silently.</p>
            <p>· Footer + unsubscribe link added automatically.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
