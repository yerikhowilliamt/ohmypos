import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';

import { cn } from '@ohmypos/ui/lib/utils';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-sm text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-status-danger aria-invalid:ring-status-danger/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          'bg-brand-primary text-text-primary hover:bg-brand-primary/90 font-medium shadow-1',
        destructive:
          'bg-status-danger text-text-inverse hover:bg-status-danger/90 font-medium shadow-1',
        outline:
          'border border-border-default bg-surface-raised text-text-primary shadow-1 hover:bg-surface-muted',
        secondary:
          'bg-surface-muted text-text-primary hover:bg-surface-strong/60',
        ghost: 'text-text-primary hover:bg-surface-muted',
        link: 'text-brand-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        xs: "h-6 gap-1 rounded-xs px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 gap-1.5 rounded-sm px-3 text-xs has-[>svg]:px-2.5',
        lg: 'h-10 rounded-sm px-6 text-md has-[>svg]:px-4',
        icon: 'size-9',
        'icon-xs': "size-6 rounded-xs [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8 rounded-sm',
        'icon-lg': 'size-10 rounded-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
