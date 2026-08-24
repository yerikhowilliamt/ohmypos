import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@ohmypos/ui/lib/utils';

const alertVariants = cva(
  'relative w-full rounded-md border p-4 text-sm [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-text-primary',
  {
    variants: {
      variant: {
        default: 'bg-surface-raised text-text-primary border-border-default',
        info: 'bg-brand-primary/10 text-brand-primary border-brand-primary/30 [&>svg]:text-brand-primary',
        success:
          'bg-status-success/10 text-status-success border-status-success/30 [&>svg]:text-status-success',
        warning:
          'bg-status-warning/10 text-status-warning border-status-warning/30 [&>svg]:text-status-warning',
        destructive:
          'bg-status-danger/10 text-status-danger border-status-danger/30 [&>svg]:text-status-danger',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<'h5'>) {
  return (
    <h5
      data-slot="alert-title"
      className={cn(
        'mb-1 font-semibold leading-none tracking-tight',
        className,
      )}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn('text-sm [&_p]:leading-relaxed', className)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };
