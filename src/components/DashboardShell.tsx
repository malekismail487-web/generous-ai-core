import { ReactNode, useState } from 'react';
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
  /** Role label shown below the atom logo */
  role: string;
  /** User display name */
  name?: string;
  /** School / org name */
  org?: string;
  /** Navigation items */
  navItems: NavItem[];
  /** Currently active tab id */
  activeTab: string;
  onTabChange: (id: string) => void;
  /** Right side of header (extra buttons) */
  headerRight?: ReactNode;
  children: ReactNode;
  /** Extra bottom content in sidebar (e.g. extra links) */
  sidebarBottom?: ReactNode;
}

/**
 * Universal dashboard layout shell for ALL 7 roles.
 *
 * Desktop: fixed left sidebar (280px) + scrollable main content.
 * Mobile: top hamburger → slide-over drawer + bottom-anchored pill nav.
 *
 * The sidebar shows the animated Lumina atom, role label, and vertical
 * nav tabs with indicator bars and hover glow.
 */
export function DashboardShell({
  role,
  name,
  org,
  navItems,
  activeTab,
  onTabChange,
  headerRight,
  children,
  sidebarBottom,
}: DashboardShellProps) {
  const { signOut } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const SidebarContent = () => (
    <aside className="lumina-sidebar h-full flex flex-col w-[260px]">
      {/* Logo + identity */}
      <div className="flex flex-col items-center py-8 px-4 border-b border-white/5 gap-3">
        <div className="relative">
          <LuminaAtom size={68} animate glow />
          {/* subtle ring behind atom */}
          <div className="absolute inset-[-8px] rounded-full border border-white/[0.07] pointer-events-none" />
        </div>
        <div className="text-center space-y-0.5">
          <div className="text-[11px] font-semibold tracking-[0.25em] uppercase text-white/25">{role}</div>
          {name && <div className="text-[13px] font-medium text-white/70 leading-tight">{name}</div>}
          {org  && <div className="text-[11px] text-white/30 leading-tight">{org}</div>}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => { onTabChange(item.id); setDrawerOpen(false); }}
              className={cn(
                'lumina-sidebar-tab w-full text-left group',
                isActive && 'active',
              )}
            >
              <span className={cn(
                'flex-shrink-0 transition-transform duration-300',
                isActive && 'scale-110',
                'group-hover:scale-105',
              )}>
                {item.icon}
              </span>
              <span className="flex-1 text-sm font-medium truncate">{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="ml-auto text-[10px] font-bold bg-white/10 text-white/70 rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Sidebar bottom */}
      {sidebarBottom && (
        <div className="px-3 pb-2 border-t border-white/5 pt-3">
          {sidebarBottom}
        </div>
      )}

      {/* Sign out */}
      <div className="px-3 pb-6 pt-2">
        <button
          onClick={() => signOut()}
          className="lumina-sidebar-tab w-full text-left text-red-400/50 hover:text-red-400 hover:bg-red-500/5"
        >
          <LogOut size={16} />
          <span className="text-sm font-medium">Sign out</span>
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen bg-black overflow-hidden">
      {/* ── Desktop sidebar ── */}
      <div className="hidden md:flex flex-shrink-0">
        <SidebarContent />
      </div>

      {/* ── Mobile drawer ── */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="relative z-10">
            <SidebarContent />
          </div>
          <button
            className="absolute top-4 right-4 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-white/5 border border-white/10"
            onClick={() => setDrawerOpen(false)}
          >
            <X size={16} className="text-white/60" />
          </button>
        </div>
      )}

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="lumina-header flex items-center justify-between px-4 md:px-6 h-14 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost" size="icon"
              className="md:hidden text-white/40 hover:text-white/70"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu size={18} />
            </Button>
            {/* Active tab label */}
            <div className="hidden md:flex items-center gap-2">
              <span className="text-white/20 text-sm">/</span>
              <span className="text-white/60 text-sm font-medium">
                {navItems.find(n => n.id === activeTab)?.label ?? ''}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {headerRight}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
