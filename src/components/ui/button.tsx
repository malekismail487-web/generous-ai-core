import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium",
    "ring-offset-background overflow-hidden isolate select-none",
    "transition-[transform,background-color,border-color,color,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
    "hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.98]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-40 disabled:translate-y-0",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-300",
    // Sheen sweep on hover — the shared Onyx button gesture.
    "before:content-[''] before:absolute before:inset-y-0 before:-left-1/2 before:w-1/2 before:skew-x-[18deg]",
    "before:bg-gradient-to-r before:from-transparent before:via-white/15 before:to-transparent",
    "before:opacity-0 before:transition-opacity before:duration-200 before:-z-10",
    "hover:before:opacity-100 hover:before:animate-sheen",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[var(--shadow-card)] hover:bg-destructive/90",
        outline:
          "border border-border bg-card/50 backdrop-blur-xl hover:border-foreground/25 hover:bg-accent/60 hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "before:hidden hover:bg-accent hover:text-accent-foreground",
        link:
          "before:hidden hover:-translate-y-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3",
        lg: "h-12 rounded-2xl px-8 text-base",
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
