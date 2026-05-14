'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DollarSign, Loader2, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  STATUS_LABELS,
  STATUS_ORDER,
  TEMPERATURE_BY_STATUS,
  TEMPERATURE_LABELS,
  type LeadStatus,
} from '@/lib/types/domain';
import { formatCurrency, cn } from '@/lib/utils';
import { toast } from 'sonner';

const TEMP_COLOR: Record<string, string> = {
  cold: 'text-slate-500',
  warm: 'text-amber-600',
  hot: 'text-orange-600',
  won: 'text-emerald-600',
  lost: 'text-slate-400',
};

interface Props {
  leadId: string;
  initialStatus: LeadStatus;
  initialDealValue: number | null;
  initialNotes: string | null;
  initialQuoteSentAt: string | null;
}

export function PipelineControls({
  leadId,
  initialStatus,
  initialDealValue,
  initialNotes,
  initialQuoteSentAt,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<LeadStatus>(initialStatus);
  const [dealValue, setDealValue] = useState<string>(
    initialDealValue !== null ? String(initialDealValue) : '',
  );
  const [notes, setNotes] = useState<string>(initialNotes ?? '');
  const [saving, setSaving] = useState(false);

  const temperature = TEMPERATURE_BY_STATUS[status];

  async function save() {
    setSaving(true);
    try {
      const parsedValue = dealValue.trim() === '' ? null : Number(dealValue);
      if (parsedValue !== null && (Number.isNaN(parsedValue) || parsedValue < 0)) {
        throw new Error('Deal value must be a non-negative number');
      }
      const res = await fetch(`/api/leads/${leadId}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          deal_value_usd: parsedValue,
          pipeline_notes: notes.trim() === '' ? null : notes,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast.success('Pipeline updated');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
          Pipeline
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="space-y-1.5">
          <Label htmlFor="stage">Stage</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as LeadStatus)}>
            <SelectTrigger id="stage">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        'text-[10px] font-semibold uppercase',
                        TEMP_COLOR[TEMPERATURE_BY_STATUS[s]],
                      )}
                    >
                      {TEMPERATURE_LABELS[TEMPERATURE_BY_STATUS[s]]}
                    </span>
                    <span>·</span>
                    <span>{STATUS_LABELS[s]}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className={cn('text-[11px] font-medium uppercase tracking-wider', TEMP_COLOR[temperature])}>
            {TEMPERATURE_LABELS[temperature]}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="value">Deal value (USD)</Label>
          <div className="relative">
            <DollarSign className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="value"
              type="number"
              min={0}
              step={1000}
              inputMode="decimal"
              placeholder="50000"
              value={dealValue}
              onChange={(e) => setDealValue(e.target.value)}
              className="pl-8"
            />
          </div>
          {dealValue && !Number.isNaN(Number(dealValue)) && (
            <p className="text-[11px] text-muted-foreground">
              {formatCurrency(Number(dealValue))}
            </p>
          )}
          {initialQuoteSentAt && (
            <p className="text-[11px] text-muted-foreground">
              Quote sent {new Date(initialQuoteSentAt).toLocaleDateString()}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Pipeline notes</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What did they ask for? Decision criteria? Budget? Next step?"
            className="min-h-[80px] text-sm"
          />
        </div>

        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Save className="h-4 w-4" /> Save pipeline
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
