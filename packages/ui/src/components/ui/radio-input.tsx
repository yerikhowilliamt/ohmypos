import * as React from 'react';

import { cn } from '@ohmypos/ui/lib/utils';

const RadioInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<'input'>, 'type'>
>(({ className, ...props }, ref) => (
  <input
    type="radio"
    ref={ref}
    data-slot="radio-input"
    className={cn(
      'size-4 border border-border-default text-brand-primary outline-none transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-focus-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
RadioInput.displayName = 'RadioInput';

export { RadioInput };
