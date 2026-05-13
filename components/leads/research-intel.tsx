import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CapabilityBadge } from '@/components/common/capability-badge';
import { formatCurrency } from '@/lib/utils';
import { AlertTriangle, Clock, Quote, Users, Wallet, Building, Target, TrendingDown } from 'lucide-react';
import type { CapabilityBucket, ResearchIntelligence } from '@/lib/types/domain';

export function ResearchIntel({ intel }: { intel: ResearchIntelligence }) {
  return (
    <div className="space-y-4">
      {intel.opening_hook && (
        <Card className="border-accent-amber/40 bg-accent-amber/5">
          <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-2">
            <Quote className="h-4 w-4 text-accent-amber" />
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-accent-amber">
              Opening hook
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm font-medium leading-relaxed">{intel.opening_hook}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <IntelCard icon={Target} label="Primary capability">
          <CapabilityBadge bucket={intel.primary_capability_match} />
          {intel.secondary_capability_matches && intel.secondary_capability_matches.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              <span className="text-xs text-muted-foreground">Also:</span>
              {(intel.secondary_capability_matches as CapabilityBucket[]).map((b) => (
                <CapabilityBadge key={b} bucket={b} />
              ))}
            </div>
          )}
        </IntelCard>

        <IntelCard icon={Wallet} label="Est. annual spend">
          <div className="font-display text-xl font-semibold">
            {formatCurrency(intel.estimated_annual_spend_usd.low, { compact: true })} –{' '}
            {formatCurrency(intel.estimated_annual_spend_usd.high, { compact: true })}
          </div>
        </IntelCard>

        <IntelCard icon={TrendingDown} label="Tariff exposure">
          <div className="font-display text-xl font-semibold">
            {intel.tariff_exposure_pct_estimate}%
          </div>
          <p className="text-xs text-muted-foreground">
            Estimated landed-cost premium from Section 301 + freight + lead time.
          </p>
        </IntelCard>

        <IntelCard icon={Clock} label="Decision cycle">
          <div className="font-display text-xl font-semibold">
            {intel.decision_cycle_weeks.low}–{intel.decision_cycle_weeks.high} weeks
          </div>
        </IntelCard>

        <IntelCard icon={Building} label="Current vendor (guess)">
          <p className="text-sm">{intel.current_vendor_guess || '—'}</p>
        </IntelCard>

        <IntelCard icon={Users} label="Buying committee">
          {intel.buying_committee_titles && intel.buying_committee_titles.length > 0 ? (
            <ul className="mt-1 space-y-1 text-sm">
              {intel.buying_committee_titles.map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-mx-400" />
                  {t}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </IntelCard>
      </div>

      {intel.switching_triggers && intel.switching_triggers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
              Switching triggers
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {intel.switching_triggers.map((t) => (
                <Badge key={t} variant="secondary" className="text-xs font-normal">
                  {t}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {intel.risk_flags && intel.risk_flags.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="flex flex-row items-start gap-2 space-y-0 pb-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <CardTitle className="text-sm uppercase tracking-wider text-destructive">
              Risk flags
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-1 text-sm">
              {intel.risk_flags.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function IntelCard({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Quote;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
        <Icon className="h-4 w-4 text-mx-400" />
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}
