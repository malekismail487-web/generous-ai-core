import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

/**
 * Liquid Glass tabs.
 *
 * The rail is a blurred pane with a meniscus hairline along its lower lip.
 * Each trigger carries its own specular pill (::before) and a droplet
 * (::after) that falls into place when the tab becomes active.
 */

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, children, ...props }, ref) => (
  <div className="relative inline-flex max-w-full">
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        "liquid-tablist liquid-sheen group relative inline-flex h-12 max-w-full items-center justify-start gap-1 overflow-x-auto p-1.5 text-muted-foreground",
        "scrollbar-none",
        className,
      )}
      {...props}
    >
      <span className="liquid-sheen-band" aria-hidden />
      {children}
    </TabsPrimitive.List>
    {/* meniscus: the wet line where the pane meets the page */}
    <span
      aria-hidden
      className="liquid-hairline pointer-events-none absolute -bottom-px left-4 right-4 opacity-60"
    />
  </div>
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "liquid-tab inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2",
      "text-[13px] font-semibold tracking-tight ring-offset-background",
      "text-muted-foreground data-[state=active]:text-foreground",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      "disabled:pointer-events-none disabled:opacity-40",
      className,
    )}
    {...props}
  >
    {children}
  </TabsPrimitive.Trigger>
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "relative mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      "data-[state=active]:animate-rise-in",
      className,
    )}
    {...props}
  >
    {children}
  </TabsPrimitive.Content>
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
