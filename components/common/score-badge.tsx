import { cn } from '@/lib/utils';

export function ScoreBadge({ score, label, className }: { score: number | null; label?: string; className?: string }) {
  const n = score ?? 0;
  const tone =
    n >= 80
      ? 'bg-accent-amber/15 text-accent-amber'
      : n >= 60
        ? 'bg-mx-100 text-mx-700'
        : n >= 40
          ? 'bg-slate-100 text-slate-700'
          : 'bg-slate-50 text-slate-500';
  return (
    <div className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold', tone, className)}>
      <span>{n}</span>
      {label && <span className="text-[10px] font-medium uppercase tracking-wider opacity-70">{label}</span>}
    </div>
  );
}
