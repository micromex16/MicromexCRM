import { formatDistanceToNow } from 'date-fns';
import { Activity, FileSearch, Mail, MessageCircle, Phone, Pencil, RefreshCw, Settings2 } from 'lucide-react';

export interface ActivityRow {
  id: string;
  type:
    | 'note'
    | 'email_sent'
    | 'email_replied'
    | 'meeting'
    | 'call'
    | 'status_change'
    | 'research_update'
    | 'system';
  body: string | null;
  actor: string;
  created_at: string;
}

const ICONS: Record<ActivityRow['type'], typeof Mail> = {
  note: Pencil,
  email_sent: Mail,
  email_replied: MessageCircle,
  meeting: Activity,
  call: Phone,
  status_change: RefreshCw,
  research_update: FileSearch,
  system: Settings2,
};

const TONES: Record<ActivityRow['type'], string> = {
  note: 'bg-slate-100 text-slate-600',
  email_sent: 'bg-mx-100 text-mx-700',
  email_replied: 'bg-emerald-100 text-emerald-700',
  meeting: 'bg-violet-100 text-violet-700',
  call: 'bg-amber-100 text-amber-700',
  status_change: 'bg-mx-50 text-mx-600',
  research_update: 'bg-accent-amber/15 text-accent-amber',
  system: 'bg-slate-50 text-slate-500',
};

export function ActivityTimeline({ items }: { items: ActivityRow[] }) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No activity yet.</p>;
  }

  return (
    <ol className="relative space-y-4 pl-8">
      <div className="absolute left-3 top-2 h-[calc(100%-1rem)] w-px bg-border" aria-hidden />
      {items.map((a) => {
        const Icon = ICONS[a.type];
        return (
          <li key={a.id} className="relative">
            <span
              className={`absolute -left-[1.65rem] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-background ${TONES[a.type]}`}
            >
              <Icon className="h-3 w-3" />
            </span>
            <div className="rounded-md border bg-card p-3 text-sm">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-medium capitalize">{a.type.replace('_', ' ')}</span>
                <span>
                  {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })} · {a.actor}
                </span>
              </div>
              {a.body && <p className="mt-1 whitespace-pre-wrap leading-relaxed">{a.body}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
