import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "group relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium tracking-[-0.01em]",
    "ring-offset-background overflow-hidden isolate select-none",
    "transition-[transform,background-color,border-color,color,box-shadow,letter-spacing] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
    "hover:-translate-y-[1.5px] active:translate-y-[0.5px] active:scale-[0.985]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-40 disabled:translate-y-0",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-300",
    "hover:[&_svg]:scale-110",
    // Sheen sweep on hover — the shared Onyx button gesture.
    "before:content-[''] before:absolute before:inset-y-0 before:-left-1/2 before:w-1/2 before:skew-x-[18deg]",
    "before:bg-gradient-to-r before:from-transparent before:via-white/15 before:to-transparent",
    "before:opacity-0 before:transition-opacity before:duration-200 before:-z-10",
    "hover:before:opacity-100 hover:before:animate-sheen",
    // Top edge highlight — a single filament of light across the crown.
    "after:content-[''] after:absolute after:inset-x-3 after:top-0 after:h-px after:-z-10",
    "after:bg-gradient-to-r after:from-transparent after:via-white/25 after:to-transparent",
    "after:opacity-0 after:transition-opacity after:duration-300 hover:after:opacity-100",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "border border-foreground/12 bg-foreground/[0.06] backdrop-blur-xl backdrop-saturate-150 text-foreground shadow-[var(--shadow-card)] hover:border-foreground/28 hover:bg-foreground/[0.1] hover:shadow-[var(--shadow-elevated)]",
        destructive:
          "border border-destructive/40 bg-destructive/85 backdrop-blur-xl text-destructive-foreground shadow-[var(--shadow-card)] hover:bg-destructive hover:border-destructive/70",
        outline:
          "border border-foreground/14 bg-foreground/[0.02] backdrop-blur-2xl backdrop-saturate-150 hover:border-foreground/30 hover:bg-foreground/[0.06] hover:text-foreground",
        secondary:
          "border border-foreground/10 bg-foreground/[0.04] backdrop-blur-xl text-secondary-foreground hover:bg-foreground/[0.08] hover:border-foreground/20",
        ghost:
          "before:hidden after:hidden hover:bg-foreground/[0.06] hover:text-foreground",
        link:
          "before:hidden after:hidden hover:-translate-y-0 text-primary underline-offset-4 hover:underline",
        // Onyx signature: a carved slab of black with a lit rim.
        onyx:
          "border border-foreground/10 bg-[hsl(0_0%_4%)]/80 backdrop-blur-2xl text-foreground shadow-[var(--shadow-card),var(--shadow-inset)] hover:border-foreground/28 hover:bg-[hsl(0_0%_7%)]/85 hover:shadow-[var(--shadow-elevated)]",
        // Hero: inverted ink, the one action that matters on a screen.
        hero:
          "bg-foreground text-background font-semibold shadow-[var(--shadow-elevated)] hover:shadow-[0_0_60px_-12px_hsl(var(--ink)/0.45)] hover:tracking-[0.01em]",
        // Quiet: present, but never competing.
        quiet:
          "before:hidden text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05]",
        // Glass: fully optical, for actions floating over content.
        glass:
          "liquid-glass liquid-sheen text-foreground hover:text-foreground",
      },

      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3",
        lg: "h-12 rounded-2xl px-8 text-base",
        xl: "h-14 rounded-[1.35rem] px-10 text-base",
        pill: "h-11 rounded-full px-6",
        icon: "h-10 w-10 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);



export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
