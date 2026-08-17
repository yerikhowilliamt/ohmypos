import * as React from 'react';
import { cn } from '@ohmypos/ui/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-sm bg-surface-muted', className)}
      {...props}
    />
  );
}

export { Skeleton };
