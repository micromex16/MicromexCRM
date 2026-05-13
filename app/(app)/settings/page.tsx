import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, X, AlertCircle } from 'lucide-react';
import { getProfile } from '@/lib/auth/require';

export const dynamic = 'force-dynamic';

interface KeyRow {
  label: string;
  env: string;
  required: boolean;
  description: string;
}

const KEY_GROUPS: { title: string; rows: KeyRow[] }[] = [
  {
    title: 'Database',
    rows: [
      {
        label: 'Supabase URL',
        env: 'NEXT_PUBLIC_SUPABASE_URL',
        required: true,
        description: 'Your project URL (https://<ref>.supabase.co).',
      },
      {
        label: 'Supabase anon key',
        env: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        required: true,
        description: 'Public publishable key, used in the browser.',
      },
      {
        label: 'Supabase service role',
        env: 'SUPABASE_SERVICE_ROLE_KEY',
        required: true,
        description: 'Bypasses RLS — server-only, never expose to the browser.',
      },
    ],
  },
  {
    title: 'AI',
    rows: [
      {
        label: 'Anthropic API key',
        env: 'ANTHROPIC_API_KEY',
        required: true,
        description: 'Powers research, scoring, drafting, and reply classification.',
      },
    ],
  },
  {
    title: 'Email',
    rows: [
      {
        label: 'Resend API key',
        env: 'RESEND_API_KEY',
        required: true,
        description: 'Required to send outbound email.',
      },
      {
        label: 'Resend webhook secret',
        env: 'RESEND_WEBHOOK_SECRET',
        required: true,
        description: 'Signs incoming webhook events and unsub tokens.',
      },
      {
        label: 'From email',
        env: 'RESEND_FROM_EMAIL',
        required: true,
        description: 'Must be on a domain with SPF + DKIM + DMARC passing.',
      },
    ],
  },
  {
    title: 'Contact enrichment',
    rows: [
      {
        label: 'Apollo.io API key',
        env: 'APOLLO_API_KEY',
        required: false,
        description: 'Primary source for contact lookups by company domain.',
      },
      {
        label: 'Hunter.io API key',
        env: 'HUNTER_API_KEY',
        required: false,
        description: 'Fallback when Apollo returns nothing.',
      },
    ],
  },
  {
    title: 'ImportYeti',
    rows: [
      {
        label: 'ImportYeti username/password',
        env: 'IMPORTYETI_USERNAME',
        required: false,
        description: 'For the Playwright scraper. CSV upload works without these.',
      },
      {
        label: 'ImportYeti API key',
        env: 'IMPORTYETI_API_KEY',
        required: false,
        description: 'Paid API path (preferred if available).',
      },
    ],
  },
  {
    title: 'Operational',
    rows: [
      {
        label: 'Cron secret',
        env: 'CRON_SECRET',
        required: true,
        description: 'Vercel attaches this as a Bearer token to every cron call.',
      },
      {
        label: 'Daily send cap',
        env: 'DAILY_SEND_CAP',
        required: false,
        description: 'Hard cap on emails sent per UTC day (default 50).',
      },
      {
        label: 'Digest recipient',
        env: 'DIGEST_RECIPIENT',
        required: false,
        description: 'Inbox that receives the 9am ET daily summary.',
      },
    ],
  },
];

export default async function SettingsPage() {
  const profile = await getProfile();

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Environment variables and sender hygiene. Configure these in Vercel + .env.local.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sender hygiene</CardTitle>
          <CardDescription>
            SPF, DKIM, and DMARC must all pass before launching a campaign. Resend's dashboard shows
            DNS check results — paste them here once verified.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="SPF" status={null} />
          <Row label="DKIM" status={null} />
          <Row label="DMARC" status={null} />
          <p className="text-xs text-muted-foreground">
            Wired check coming in a follow-up. For now, verify in your Resend domain dashboard.
          </p>
        </CardContent>
      </Card>

      {KEY_GROUPS.map((group) => (
        <Card key={group.title}>
          <CardHeader>
            <CardTitle>{group.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {group.rows.map((r) => {
              const present = Boolean(process.env[r.env]);
              return (
                <div key={r.env} className="flex items-start justify-between gap-4 border-b pb-3 last:border-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{r.label}</span>
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {r.env}
                      </code>
                      {r.required && !present && <Badge variant="destructive">Required</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>
                  </div>
                  {present ? (
                    <Badge variant="success">
                      <Check className="mr-1 h-3 w-3" /> Set
                    </Badge>
                  ) : (
                    <Badge variant="muted">
                      <X className="mr-1 h-3 w-3" /> Missing
                    </Badge>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {profile ? (
            <div>
              <div className="font-medium">{profile.full_name ?? profile.email}</div>
              <div className="text-xs text-muted-foreground">{profile.email} · {profile.role}</div>
            </div>
          ) : (
            <p className="text-muted-foreground">No profile loaded.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, status }: { label: string; status: 'pass' | 'fail' | null }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      {status === 'pass' ? (
        <Badge variant="success">
          <Check className="mr-1 h-3 w-3" /> Pass
        </Badge>
      ) : status === 'fail' ? (
        <Badge variant="destructive">
          <X className="mr-1 h-3 w-3" /> Fail
        </Badge>
      ) : (
        <Badge variant="muted">
          <AlertCircle className="mr-1 h-3 w-3" /> Unchecked
        </Badge>
      )}
    </div>
  );
}
