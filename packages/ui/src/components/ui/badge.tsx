import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@ohmypos/ui/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-pill border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-focus-ring',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-brand-primary text-white',
        secondary: 'border-transparent bg-surface-dark text-white',
        destructive: 'border-transparent bg-status-danger text-white',
        outline: 'border-border-default text-text-primary bg-surface-raised',
        success: 'border-transparent bg-status-success text-white',
        warning: 'border-transparent bg-status-warning text-white',
        danger: 'border-transparent bg-status-danger text-white',
        info: 'border-transparent bg-status-info text-white',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
