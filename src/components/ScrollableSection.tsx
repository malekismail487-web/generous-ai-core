import { ReactNode } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface ScrollableSectionProps {
  children: ReactNode;
  className?: string;
}

/**
 * A reusable scrollable container for all app sections.
 * Provides per-tab internal scrolling that works on both desktop and mobile.
 */
export function ScrollableSection({ children, className }: ScrollableSectionProps) {
  return (
    <ScrollArea className={cn("flex-1 h-[calc(100vh-120px)]", className)}>
      <div className="pt-16 pb-20">
        {children}
      </div>
    </ScrollArea>
  );
}
