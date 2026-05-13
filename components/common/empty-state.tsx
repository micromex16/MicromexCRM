import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 p-12 text-center">
      {Icon && (
        <div className="mb-4 rounded-full bg-mx-50 p-3 text-mx-500">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <h3 className="font-display text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {action && (
        <Button asChild className="mt-5">
          <a href={action.href}>{action.label}</a>
        </Button>
      )}
    </div>
  );
}
