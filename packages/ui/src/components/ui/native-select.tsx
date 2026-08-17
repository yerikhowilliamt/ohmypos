import * as React from 'react';

import { cn } from '@ohmypos/ui/lib/utils';

function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        'h-9 w-full rounded-sm border border-border-default bg-surface-raised px-3 text-sm text-text-primary outline-none focus:ring-2 focus:ring-focus-ring cursor-pointer disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-status-danger',
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
