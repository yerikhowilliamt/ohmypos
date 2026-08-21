import * as React from 'react';

import { cn } from '@ohmypos/ui/lib/utils';

const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<'input'>, 'type'>
>(({ className, ...props }, ref) => (
  <input
    type="checkbox"
    ref={ref}
    data-slot="checkbox"
    className={cn(
      'size-4 rounded-xs border border-border-default bg-surface-raised text-brand-primary outline-none transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-focus-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Checkbox.displayName = 'Checkbox';

export { Checkbox };
