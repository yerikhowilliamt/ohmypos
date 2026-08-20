'use client';

import * as React from 'react';
import { Accordion as AccordionPrimitive } from 'radix-ui';
import { ChevronDown } from 'lucide-react';
import { cn } from '@ohmypos/ui/lib/utils';

function Accordion(
  props: React.ComponentProps<typeof AccordionPrimitive.Root>,
) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn(
        'border-b border-border-default last:border-b-0',
        className,
      )}
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          'flex flex-1 items-center justify-between gap-4 py-4 text-left text-sm font-medium text-text-primary outline-none transition-colors hover:text-brand-primary focus-visible:ring-2 focus-visible:ring-focus-ring disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown className="size-4 shrink-0 text-text-tertiary transition-transform duration-200" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  // No open/close transition: the codebase has no `accordion-down`/
  // `accordion-up` keyframes defined anywhere (checked
  // `packages/ui/src/styles/globals.css` and both `package.json` files for a
  // `tailwindcss-animate`/`tw-animate-css` plugin — neither exists). Radix's
  // `Accordion.Content` shows/hides correctly without one; it just snaps
  // instead of animating. Do not add animation utility classes here without
  // first adding the plugin that defines them (a new-dependency governance
  // event, out of scope for this phase).
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="overflow-hidden text-sm text-text-secondary"
      {...props}
    >
      <div className={cn('pb-4', className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
