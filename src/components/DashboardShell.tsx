import { ReactNode, useState, useRef, useEffect } from 'react';
import { LuminaAtom } from '@/components/LuminaAtom';
import { Button } from '@/components/ui/button';
import { LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

export interface NavItem {
  id: string;
  icon: ReactNode;
  label: string;
  badge?: number;
}

interface DashboardShellProps {
  role: string;
  name?: string;
  org?: string;
  navItems: NavItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
  headerRight?: ReactNode;
  /** Floating action buttons docked bottom-right of content area */
  floatingActions?: ReactNode;
  children: ReactNode;
  sidebarBottom?: ReactNode;
  /** Override the role accent color (defaults to silver) */
  roleAccent?: string;
}

/**
 * Universal dashboard shell — v2 Enterprise.
 *
 * CRITICAL: The root container is transparent so the 3D WebGL
 * CosmicBackground (mounted at -z-10 in App.tsx) shows through
 * behind the glass sidebar and content panels.
 *
 * Sidebar: collapsed icon-pill rail (72px) on desktop, expanding
 * to a full drawer on mobile. Active tab has a silver indicator
 * bar and glow.
 *
 * Header: slim command strip with breadcrumb + contextual actions.
 *
 * Floating action dock: bottom-right circular button cluster.
 */
export function DashboardShell({
  role, name, org, navItems, activeTab, onTabChange,
  headerRight, floatingActions, children, sidebarBottom, roleAccent,
}: DashboardShellProps) {
  const { signOut } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hoveredNav, setHoveredNav] = useState<string | null>(null);
  const contentRef = useRef<HTMLElement>(null);

  // Scroll to top on tab change
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [activeTab]);

  const Tooltip = ({ id, children }: { id: string; children: ReactNode }) => {
    if (hoveredNav !== id) return null;
    return (
      <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 pointer-events-none">
        <div className="lumina-card px-3 py-1.5 text-xs font-medium text-white/85 whitespace-nowrap scale-in">
          {children}
        </div>
      </div>
    );
  };

  const SidebarContent = () => (
    <aside className="lumina-sidebar h-full flex flex-col w-[72px]">
      {/* Logo */}
      <div className="flex flex-col items-center py-5 border-b border-white/5">
        <LuminaAtom size={40} animate glow />
      </div>

      {/* Nav pills */}
      <nav className="flex-1 flex flex-col items-center gap-2 py-4 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <div
              key={item.id}
              className="relative"
              onMouseEnter={() => setHoveredNav(item.id)}
              onMouseLeave={() => setHoveredNav(null)}
            >
              <button
                onClick={() => { onTabChange(item.id); setDrawerOpen(false); }}
                className={cn('lumina-nav-pill', isActive && 'active')}
              >
                {item.icon}
              </button>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute -top-0.5 -right-0.5 text-[9px] font-bold bg-red-500/80 text-white rounded-full px-1 min-w-[16px] h-4 flex items-center justify-center">
                  {item.badge}
                </span>
              )}
              <Tooltip id={item.id}>{item.label}</Tooltip>
            </div>
          );
        })}
      </nav>

      {/* Sidebar bottom */}
      {sidebarBottom && (
        <div className="px-1 pb-2 border-t border-white/5 pt-3 flex flex-col items-center gap-2">
          {sidebarBottom}
        </div>
      )}

      {/* Sign out */}
      <div className="pb-4 flex justify-center">
        <button
          onClick={() => signOut()}
          className="lumina-nav-pill text-red-400/40 hover:text-red-400 hover:bg-red-500/8"
          onMouseEnter={() => setHoveredNav('signout')}
          onMouseLeave={() => setHoveredNav(null)}
        >
          <LogOut size={18} />
        </button>
        <Tooltip id="signout">Sign out</Tooltip>
      </div>
    </aside>
  );

  const ExpandedDrawer = () => (
    <aside className="lumina-sidebar h-full flex flex-col w-[240px]">
      {/* Logo + identity */}
      <div className="flex flex-col items-center py-6 px-4 border-b border-white/5 gap-3">
        <LuminaAtom size={56} animate glow />
        <div className="text-center space-y-0.5">
          <div className="text-[10px] font-bold tracking-[0.25em] uppercase" style={{ color: roleAccent || 'rgba(232,232,232,0.3)' }}>{role}</div>
          {name && <div className="text-sm font-semibold text-white/75 leading-tight">{name}</div>}
          {org && <div className="text-[11px] text-white/30 leading-tight">{org}</div>}
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => { onTabChange(item.id); setDrawerOpen(false); }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-300',
                isActive ? 'bg-white/[0.08] text-white shadow-[0_0_24px_-6px_rgba(232,232,232,0.25)]' : 'text-white/35 hover:bg-white/[0.04] hover:text-white/65',
              )}
            >
              <span className={cn('transition-transform', isActive && 'scale-110')}>{item.icon}</span>
              <span className="text-sm font-medium flex-1">{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="text-[10px] font-bold bg-red-500/80 text-white rounded-full px-1.5 min-w-[18px] h-4 flex items-center justify-center">{item.badge}</span>
              )}
            </button>
          );
        })}
      </nav>
      {sidebarBottom && <div className="px-3 pb-2 border-t border-white/5 pt-3">{sidebarBottom}</div>}
      <div className="px-3 pb-6 pt-2">
        <button onClick={() => signOut()} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400/40 hover:text-red-400 hover:bg-red-500/8 transition-all">
          <LogOut size={18} /><span className="text-sm font-medium">Sign out</span>
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Grid overlay adds subtle moving grid above the 3D bg */}
      <div className="lumina-grid-overlay" />

      {/* Desktop sidebar — icon rail */}
      <div className="hidden md:flex flex-shrink-0">
        <SidebarContent />
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="relative z-10 scale-in"><ExpandedDrawer /></div>
          <button className="absolute top-4 right-4 z-20 lumina-btn-icon" onClick={() => setDrawerOpen(false)}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Main area — transparent so 3D shows through */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Command strip header */}
        <header className="lumina-header flex items-center justify-between px-4 md:px-6 h-14 flex-shrink-0 z-10">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden lumina-btn-icon w-9 h-9"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu size={16} />
            </button>
            {/* Role badge */}
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase hidden sm:inline" style={{ color: roleAccent || 'rgba(232,232,232,0.3)' }}>{role}</span>
            <span className="text-white/15 text-sm hidden sm:inline">/</span>
            {/* Active tab breadcrumb */}
            <span className="text-white/65 text-sm font-semibold font-mono">
              {navItems.find(n => n.id === activeTab)?.label ?? ''}
            </span>
            {/* Live status dot */}
            <span className="relative flex h-2 w-2 ml-1">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/40 animate-ping opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400/70" />
            </span>
          </div>
          <div className="flex items-center gap-2">{headerRight}</div>
        </header>

        {/* Content scroll area — transparent background */}
        <main ref={contentRef} className="flex-1 overflow-y-auto overflow-x-hidden relative">
          {children}

          {/* Floating action dock — bottom right */}
          {floatingActions && (
            <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-3 items-end">
              {floatingActions}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
