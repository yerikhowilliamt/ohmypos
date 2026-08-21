'use client';

import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@ohmypos/ui/lib/utils';
import { Button } from '@ohmypos/ui/components/button';
import { Input } from '@ohmypos/ui/components/input';
import { Separator } from '@ohmypos/ui/components/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@ohmypos/ui/components/sheet';
import { Skeleton } from '@ohmypos/ui/components/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@ohmypos/ui/components/tooltip';

/**
 * Port of shadcn/ui's Sidebar (ui.shadcn.com/docs/components/sidebar),
 * adapted for OhMyPos:
 *
 * - `isMobile` is a required `SidebarProvider` prop instead of an internal
 *   breakpoint hook — the app already has `useIsRail`/`useIsMobile`
 *   (`apps/web/hooks/useMediaQuery.ts`) as the single source of truth for
 *   these breakpoints; this file must not reimplement a second one.
 * - `open`/`onOpenChange` are always controlled by the caller and never
 *   persisted to a cookie — this project's rail/expanded switch is
 *   breakpoint-forced (`!isRail`), never a user preference to remember.
 * - No desktop keyboard shortcut: nothing here lets the user toggle desktop
 *   collapse, so a shortcut for it would silently do nothing.
 */

const SIDEBAR_WIDTH = '216px';
const SIDEBAR_WIDTH_MOBILE = '280px';
const SIDEBAR_WIDTH_ICON = '64px';

type SidebarContextProps = {
  state: 'expanded' | 'collapsed';
  open: boolean;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
};

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

function useSidebar(): SidebarContextProps {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider.');
  }
  return context;
}

function SidebarProvider({
  isMobile,
  open,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  isMobile: boolean;
  open: boolean;
}) {
  const [openMobile, setOpenMobile] = React.useState(false);
  const state = open ? 'expanded' : 'collapsed';

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({ state, open, isMobile, openMobile, setOpenMobile }),
    [state, open, isMobile, openMobile],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        <div
          data-slot="sidebar-wrapper"
          style={
            {
              '--sidebar-width': SIDEBAR_WIDTH,
              '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
              ...style,
            } as React.CSSProperties
          }
          className={cn('flex min-h-svh w-full', className)}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
}

function Sidebar({
  side = 'left',
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  side?: 'left' | 'right';
}) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          className="w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
          style={
            { '--sidebar-width': SIDEBAR_WIDTH_MOBILE } as React.CSSProperties
          }
          side={side}
          {...props}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navigasi OhMyPos</SheetTitle>
          </SheetHeader>
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      data-slot="sidebar"
      data-state={state}
      data-collapsible={state === 'collapsed' ? 'icon' : ''}
      data-side={side}
      className={cn(
        'group sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-linear md:flex',
        state === 'collapsed'
          ? 'w-(--sidebar-width-icon)'
          : 'w-(--sidebar-width)',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { setOpenMobile } = useSidebar();

  return (
    <Button
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      className={cn('size-9', className)}
      onClick={(event) => {
        onClick?.(event);
        setOpenMobile(true);
      }}
      {...props}
    />
  );
}

function SidebarInset({ className, ...props }: React.ComponentProps<'main'>) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn('flex flex-1 flex-col', className)}
      {...props}
    />
  );
}

function SidebarInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="sidebar-input"
      className={cn('h-9 bg-sidebar', className)}
      {...props}
    />
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-header"
      className={cn('flex flex-col gap-2', className)}
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-footer"
      className={cn(
        'mt-auto flex flex-col gap-1 border-t border-sidebar-border py-2',
        className,
      )}
      {...props}
    />
  );
}

function SidebarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      className={cn('mx-2 w-auto bg-sidebar-border', className)}
      {...props}
    />
  );
}

function SidebarContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden',
        className,
      )}
      {...props}
    />
  );
}

function SidebarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-group"
      className={cn('relative flex w-full min-w-0 flex-col', className)}
      {...props}
    />
  );
}

function SidebarGroupLabel({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-group-label"
      className={cn(
        'px-3 pb-1 text-xs font-medium uppercase tracking-wider text-text-tertiary transition-[margin,opacity] duration-200',
        'group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0',
        className,
      )}
      {...props}
    />
  );
}

function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-group-content"
      className={cn('w-full text-sm', className)}
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="sidebar-menu"
      className={cn('flex w-full min-w-0 flex-col gap-1', className)}
      {...props}
    />
  );
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li
      data-slot="sidebar-menu-item"
      className={cn('group/menu-item relative', className)}
      {...props}
    />
  );
}

const sidebarMenuButtonVariants = cva(
  'relative flex min-h-10 w-full items-center gap-2.5 overflow-hidden rounded-sm px-3 text-sm font-medium text-text-secondary outline-none transition-colors hover:bg-surface-muted hover:text-text-primary focus-visible:ring-2 focus-visible:ring-focus-ring disabled:pointer-events-none disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold data-[active=true]:text-sidebar-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0 group-data-[collapsible=icon]:size-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:[&>span]:hidden',
  {
    variants: {
      tone: {
        default: '',
        danger: 'text-status-danger hover:bg-surface-muted',
      },
    },
    defaultVariants: {
      tone: 'default',
    },
  },
);

function SidebarMenuButton({
  asChild = false,
  tooltip,
  tone,
  className,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof sidebarMenuButtonVariants> & {
    asChild?: boolean;
    tooltip?: string;
  }) {
  const { isMobile, state } = useSidebar();
  const Comp = asChild ? Slot.Root : 'button';

  const button = (
    <Comp
      data-slot="sidebar-menu-button"
      className={cn(sidebarMenuButtonVariants({ tone, className }))}
      {...props}
    />
  );

  if (!tooltip || state !== 'collapsed' || isMobile) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function SidebarMenuBadge({
  className,
  ...props
}: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="sidebar-menu-badge"
      className={cn(
        'ml-auto shrink-0 rounded-pill bg-surface-muted px-2 py-0.5 text-xs font-medium text-text-tertiary',
        'group-data-[collapsible=icon]:hidden',
        className,
      )}
      {...props}
    />
  );
}

function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}: React.ComponentProps<'div'> & { showIcon?: boolean }) {
  const width = React.useMemo(
    () => `${Math.floor(Math.random() * 40) + 50}%`,
    [],
  );

  return (
    <div
      data-slot="sidebar-menu-skeleton"
      className={cn(
        'flex h-10 items-center gap-2.5 rounded-sm px-3',
        className,
      )}
      {...props}
    >
      {showIcon && <Skeleton className="size-4 shrink-0 rounded-xs" />}
      <Skeleton
        className="h-4 max-w-(--skeleton-width) flex-1"
        style={{ '--skeleton-width': width } as React.CSSProperties}
      />
    </div>
  );
}

function SidebarMenuSub({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      className={cn(
        'ml-[22px] flex flex-col gap-0.5 border-l border-border-default pl-2',
        'group-data-[collapsible=icon]:hidden',
        className,
      )}
      {...props}
    />
  );
}

function SidebarMenuSubItem({
  className,
  ...props
}: React.ComponentProps<'li'>) {
  return (
    <li data-slot="sidebar-menu-sub-item" className={className} {...props} />
  );
}

function SidebarMenuSubButton({
  asChild = false,
  isActive = false,
  className,
  ...props
}: React.ComponentProps<'a'> & {
  asChild?: boolean;
  isActive?: boolean;
}) {
  const Comp = asChild ? Slot.Root : 'a';

  return (
    <Comp
      data-slot="sidebar-menu-sub-button"
      data-active={isActive}
      className={cn(
        'flex min-h-10 items-center rounded-sm px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring',
        isActive
          ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground'
          : 'font-medium text-text-secondary hover:text-text-primary',
        className,
      )}
      {...props}
    />
  );
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
};
