import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  delta?: string;
  icon: LucideIcon;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className={cn('h-4 w-4', accent ? 'text-accent-amber' : 'text-mx-400')} />
      </CardHeader>
      <CardContent>
        <div className="font-display text-2xl font-semibold tracking-tight">{value}</div>
        {delta && <p className="text-xs text-muted-foreground">{delta}</p>}
      </CardContent>
    </Card>
  );
}
