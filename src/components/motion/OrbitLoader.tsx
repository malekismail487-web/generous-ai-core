import { AtomMark } from '@/components/motion/AtomMark';
import { cn } from '@/lib/utils';

interface OrbitLoaderProps {
  /** What Lumina is doing, in plain words. */
  label?: string;
  size?: number;
  className?: string;
}

/** The one loading state in the product: the mark, spinning up. */
export function OrbitLoader({ label = 'Working on it', size = 72, className }: OrbitLoaderProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 py-10', className)}>
      <AtomMark size={size} tempo={2.2} />
      {label && (
        <p className="text-sm text-muted-foreground animate-pulse" role="status">
          {label}
        </p>
      )}
    </div>
  );
}

interface QuietStateProps {
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}

/** Empty states as a moment of calm rather than an error. */
export function QuietState({ title, body, action, className }: QuietStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-5 px-6 py-16 text-center', className)}>
      <AtomMark size={96} tempo={0.5} className="opacity-40" />
      <div className="space-y-2">
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        {body && <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">{body}</p>}
      </div>
      {action}
    </div>
  );
}
