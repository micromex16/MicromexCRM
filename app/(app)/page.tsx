// Dashboard placeholder. Agent 5 (UI) will replace with real metrics + charts.

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Flame, Send, Users } from 'lucide-react';

const STATS = [
  { label: 'Total pipeline', value: '$—', delta: '—', icon: Activity },
  { label: 'Total leads', value: '0', delta: '—', icon: Users },
  { label: 'Sent this week', value: '0', delta: '—', icon: Send },
  { label: 'Reply rate', value: '—', delta: '—', icon: Flame },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Lead engine overview — pipeline, outreach, replies.
          </p>
        </div>
        <Badge variant="muted">Foundation ready · awaiting data</Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map(({ label, value, delta, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-mx-400" />
            </CardHeader>
            <CardContent>
              <div className="font-display text-2xl font-semibold">{value}</div>
              <p className="text-xs text-muted-foreground">{delta}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Welcome, Giovanni</CardTitle>
          <CardDescription>
            The foundation is up. Next: run the ImportYeti scraper or upload a CSV from{' '}
            <strong>Sources</strong>, then watch the enrichment workers turn raw shipment data into
            qualified leads with research briefs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">USMCA wedge:</strong> Section 301 + reciprocal
            tariffs hurt Chinese imports. We open conversations with US brands importing from
            China/Vietnam/Taiwan and pitch Imuris, Sonora as a same-day-truck-to-Phoenix swap.
          </p>
          <p>
            <strong className="text-foreground">Four capability buckets:</strong> Electrical,
            Refurb, Packaging, Mechanical. Each has its own email template, segment filter, and
            campaign cadence.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
