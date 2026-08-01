import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Premium glass header bar with cosmic blur and cyan hairline border. */
export function CosmicHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('cosmic-header sticky top-0 z-50', className)}>
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        {children}
      </div>
    </header>
  );
}

/** Glowing logo tile with cyan pulse. */
export function CosmicLogoTile({
  icon,
  className,
}: {
  icon: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'w-11 h-11 rounded-xl flex items-center justify-center cosmic-pulse',
        className,
      )}
      style={{
        background: 'linear-gradient(135deg, hsl(187 92% 52% / 0.2) 0%, hsl(187 92% 52% / 0.05) 100%)',
        border: '1px solid hsl(187 92% 52% / 0.3)',
      }}
    >
      {icon}
    </div>
  );
}

/** Stat card with cosmic glass surface and hover glow. */
export function CosmicStatCard({
  label,
  value,
  icon,
  accent = 'primary',
  className,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  accent?: 'primary' | 'success' | 'warning' | 'danger' | 'silver';
  className?: string;
}) {
  const accentMap = {
    primary: 'text-cyan-400',
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    danger: 'text-red-400',
    silver: 'text-slate-300',
  };
  const glowMap = {
    primary: 'hsl(187 92% 52% / 0.2)',
    success: 'hsl(152 68% 50% / 0.15)',
    warning: 'hsl(38 92% 50% / 0.15)',
    danger: 'hsl(0 72% 52% / 0.15)',
    silver: 'hsl(210 20% 88% / 0.1)',
  };
  return (
    <div
      className={cn('cosmic-stat p-5 space-y-2', className)}
      style={{ '--glow': glowMap[accent] } as React.CSSProperties}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = `0 0 32px -8px ${glowMap[accent]}`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = '';
      }}
    >
      {icon && <div className={cn('flex items-center gap-2', accentMap[accent])}>{icon}</div>}
      <p className={cn('text-3xl font-bold tracking-tight', accentMap[accent])}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/** Cosmic-themed tab trigger wrapper for consistent styling. */
export function CosmicTabLabel({ icon, label, badge }: { icon?: ReactNode; label: string; badge?: ReactNode }) {
  return (
    <>
      {icon}
      <span className="hidden sm:inline">{label}</span>
      {badge}
    </>
  );
}
