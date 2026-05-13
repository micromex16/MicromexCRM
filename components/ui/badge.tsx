import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-mx-500 text-white hover:bg-mx-600',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground',
        hot: 'border-transparent bg-accent-amber/15 text-accent-amber',
        success: 'border-transparent bg-emerald-100 text-emerald-700',
        muted: 'border-transparent bg-muted text-muted-foreground',
        electrical: 'border-transparent bg-mx-100 text-mx-700',
        refurb: 'border-transparent bg-emerald-100 text-emerald-700',
        packaging: 'border-transparent bg-violet-100 text-violet-700',
        mechanical: 'border-transparent bg-amber-100 text-amber-800',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
