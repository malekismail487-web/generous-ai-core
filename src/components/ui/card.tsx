import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Liquid Glass card.
 *
 * Three optical layers ship with every card:
 *  - the pane itself (blur + film + specular crescent, from .liquid-glass)
 *  - a travelling rim line (.liquid-rim-line)
 *  - a sheen band that sweeps on hover (.liquid-sheen-band)
 *
 * Pass `flat` to fall back to an opaque surface (tables, dense lists).
 */

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  flat?: boolean;
  rim?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, flat = false, rim = true, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        flat
          ? "rounded-lg border bg-card text-card-foreground shadow-sm"
          : "liquid-glass liquid-sheen liquid-rim liquid-press text-card-foreground",
        className,
      )}
      {...props}
    >
      {!flat && rim && <span className="liquid-rim-line" aria-hidden />}
      {!flat && <span className="liquid-sheen-band" aria-hidden />}
      {children}
    </div>
  ),
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("relative flex flex-col space-y-1.5 p-6", className)} {...props}>
      {children}
    </div>
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("font-display text-2xl font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm leading-relaxed text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("relative p-6 pt-0", className)} {...props} />,
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("relative flex items-center p-6 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
