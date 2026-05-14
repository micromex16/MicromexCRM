'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  CAPABILITY_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
  type CapabilityBucket,
  type LeadStatus,
} from '@/lib/types/domain';
import { useCallback } from 'react';

const ALL_CAPS: CapabilityBucket[] = ['electrical', 'refurb', 'packaging', 'mechanical'];

export function LeadFilters() {
  const router = useRouter();
  const params = useSearchParams();

  const toggle = useCallback(
    (key: string, value: string) => {
      const current = new Set(params.getAll(key));
      if (current.has(value)) current.delete(value);
      else current.add(value);
      const sp = new URLSearchParams(params.toString());
      sp.delete(key);
      for (const v of current) sp.append(key, v);
      router.push(`/leads?${sp.toString()}`);
    },
    [router, params],
  );

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const sp = new URLSearchParams(params.toString());
      if (value === null || value === '') sp.delete(key);
      else sp.set(key, value);
      router.push(`/leads?${sp.toString()}`);
    },
    [router, params],
  );

  const selectedCaps = new Set(params.getAll('cap'));
  const selectedStatus = new Set(params.getAll('status'));
  const minScore = params.get('min') ?? '';
  const hasEmail = params.get('has_email') === '1';

  const clear = () => router.push('/leads');

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Capability</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 pt-0">
          {ALL_CAPS.map((c) => (
            <label key={c} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-mx-500"
                checked={selectedCaps.has(c)}
                onChange={() => toggle('cap', c)}
              />
              {CAPABILITY_LABELS[c]}
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 pt-0">
          {STATUS_ORDER.filter((s) => s !== 'closed_lost' && s !== 'disqualified').map((s: LeadStatus) => (
            <label key={s} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-mx-500"
                checked={selectedStatus.has(s)}
                onChange={() => toggle('status', s)}
              />
              {STATUS_LABELS[s]}
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Score</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          <div className="space-y-1">
            <Label htmlFor="min-score" className="text-xs text-muted-foreground">
              Min fit score
            </Label>
            <Input
              id="min-score"
              type="number"
              min={0}
              max={100}
              value={minScore}
              onChange={(e) => setParam('min', e.target.value)}
              className="h-8"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="has-email" className="text-xs">
              Has email
            </Label>
            <Switch
              id="has-email"
              checked={hasEmail}
              onCheckedChange={(v) => setParam('has_email', v ? '1' : null)}
            />
          </div>
        </CardContent>
      </Card>

      <Button variant="ghost" size="sm" className="w-full" onClick={clear}>
        Clear filters
      </Button>
    </div>
  );
}
