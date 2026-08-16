import * as React from 'react';

import { cn } from '@ohmypos/ui/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 rounded-sm border border-border-default bg-surface-raised px-3 py-1 text-sm text-text-primary placeholder:text-text-tertiary shadow-1 transition-colors outline-none focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-focus-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-status-danger',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
