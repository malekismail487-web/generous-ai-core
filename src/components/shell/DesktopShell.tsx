import { ReactNode, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { LuminaLogo } from '@/components/LuminaLogo';
import { LiquidField } from '@/components/shell/LiquidField';

import { EffortSelector } from '@/components/ai/EffortSelector';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { useMagnetic } from '@/lib/motion';
import type { TabType } from '@/components/BottomNav';
import {
  BookOpen, Bot, Brain, Calendar, ClipboardList, FileText, Flame, Gauge,
  GraduationCap, Home, LayoutGrid, LineChart, Megaphone, Mic, Radio, Sparkles,
  Target, Timer, Trophy, User,
} from 'lucide-react';

interface NavItem {
  id: TabType;
  icon: typeof Home;
  label: string;
  labelAr: string;
}

interface NavGroup {
  title: string;
  titleAr: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    title: 'Today',
    titleAr: 'اليوم',
    items: [
      { id: 'home', icon: Home, label: 'Home', labelAr: 'الرئيسية' },
      { id: 'weeklyplan', icon: Calendar, label: 'Weekly plan', labelAr: 'الخطة الأسبوعية' },
      { id: 'live', icon: Radio, label: 'Live rooms', labelAr: 'الغرف المباشرة' },
      { id: 'announcements', icon: Megaphone, label: 'Announcements', labelAr: 'الإعلانات' },
    ],
  },
  {
    title: 'Learn',
    titleAr: 'التعلم',
    items: [
      { id: 'studybuddy', icon: Bot, label: 'Ask Lumina', labelAr: 'اسأل لومينا' },
      { id: 'subjects', icon: BookOpen, label: 'Subjects', labelAr: 'المواد' },
      { id: 'mindmaps', icon: Brain, label: 'Mind maps', labelAr: 'الخرائط الذهنية' },
      { id: 'podcasts', icon: Mic, label: 'Podcasts', labelAr: 'البودكاست' },
      { id: 'flashcards', icon: LayoutGrid, label: 'Flashcards', labelAr: 'البطاقات' },
      { id: 'graphcalc', icon: LineChart, label: 'Graphing', labelAr: 'الرسم البياني' },
    ],
  },
  {
    title: 'Practice',
    titleAr: 'التمرين',
    items: [
      { id: 'assignments', icon: ClipboardList, label: 'Assignments', labelAr: 'الواجبات' },
      { id: 'examination', icon: GraduationCap, label: 'Exams', labelAr: 'الاختبارات' },
      { id: 'sat', icon: Sparkles, label: 'SAT prep', labelAr: 'تحضير SAT' },
      { id: 'aiplans', icon: Target, label: 'Study plan', labelAr: 'خطة الدراسة' },
      { id: 'notes', icon: FileText, label: 'Notes', labelAr: 'الملاحظات' },
    ],
  },
  {
    title: 'You',
    titleAr: 'أنت',
    items: [
      { id: 'goals', icon: Flame, label: 'Goals & streak', labelAr: 'الأهداف' },
      { id: 'leaderboard', icon: Trophy, label: 'Leaderboard', labelAr: 'المتصدرون' },
      { id: 'focustimer', icon: Timer, label: 'Focus timer', labelAr: 'مؤقت التركيز' },
      { id: 'reports', icon: Gauge, label: 'Report cards', labelAr: 'كشوف الدرجات' },
      { id: 'profile', icon: User, label: 'Profile', labelAr: 'الملف الشخصي' },
    ],
  },
];

function NavButton({
  item,
  active,
  onSelect,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  onSelect: () => void;
  collapsed: boolean;
}) {
  const { t } = useThemeLanguage();
  const magneticRef = useMagnetic<HTMLButtonElement>(0.06);
  const Icon = item.icon;

  return (
    <button
      ref={magneticRef}
      onClick={onSelect}

      title={collapsed ? t(item.label, item.labelAr) : undefined}
      className={cn(
        'group relative flex items-center gap-3 w-full rounded-2xl px-3 py-2.5 text-sm',
        'transition-colors duration-300 will-change-transform',
        active
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {active && (
        <>
          <span className="liquid-glass liquid-glass-soft absolute inset-0 rounded-2xl border-foreground/20" />
          <span
            aria-hidden
            className="absolute inset-0 rounded-2xl opacity-[0.12]"
            style={{ backgroundImage: 'repeating-linear-gradient(135deg, hsl(var(--foreground)) 0 1px, transparent 1px 8px)' }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-3 top-0 h-1/2 rounded-b-full opacity-70"
            style={{ background: 'radial-gradient(60% 100% at 50% 0%, hsl(var(--ink) / 0.24), transparent 72%)' }}
          />
        </>
      )}
      <span className="absolute inset-0 rounded-2xl border border-transparent transition-colors duration-300 group-hover:border-foreground/10 group-hover:bg-foreground/[0.03] group-hover:backdrop-blur-xl" />

      <span
        className={cn(
          'absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-full bg-foreground transition-all duration-500',
          active ? 'h-5 opacity-100' : 'h-0 opacity-0',
        )}
      />
      <Icon
        size={17}
        className={cn(
          'relative shrink-0 transition-transform duration-500',
          active ? 'scale-110' : 'group-hover:scale-110',
        )}
      />
      {!collapsed && (
        <span className="relative truncate font-medium">{t(item.label, item.labelAr)}</span>
      )}
    </button>
  );
}

interface DesktopShellProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

/**
 * The PC layout: a persistent rail of everything Lumina can do, a quiet
 * command header, and one deep workspace column. The phone keeps its
 * circular home grid — this shell only ever renders on wide screens.
 */
export function DesktopShell({ activeTab, onTabChange, title, subtitle, children }: DesktopShellProps) {
  const { t } = useThemeLanguage();
  const [collapsed, setCollapsed] = useState(false);

  const groups = useMemo(() => GROUPS, []);

  return (
    <div className="relative h-screen w-full bg-background text-foreground flex overflow-hidden">
      <LiquidField dense />

      {/* Rail */}
      <aside
        className={cn(
          'relative z-10 shrink-0 h-full border-r border-foreground/10 bg-background/40 backdrop-blur-2xl backdrop-saturate-150',
          'transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
          collapsed ? 'w-[76px]' : 'w-[264px]',
        )}
      >
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-foreground/25 to-transparent" />
        <div className="relative flex items-center gap-3 h-16 px-4 border-b border-foreground/10">

          <button
            onClick={() => setCollapsed((v) => !v)}
            className="shrink-0 transition-transform duration-500 hover:rotate-90"
            aria-label="Toggle navigation"
          >
            <LuminaLogo size={30} />
          </button>
          {!collapsed && (
            <div className="min-w-0 animate-fade-in">
              <p className="font-display font-extrabold tracking-tight leading-none">Lumina</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-0.5">
                {t('Workspace', 'مساحة العمل')}
              </p>
            </div>
          )}
        </div>

        <nav className="h-[calc(100vh-4rem)] overflow-y-auto px-3 py-4 space-y-6 pb-24">
          {groups.map((group) => (
            <div key={group.title} className="space-y-1">
              {!collapsed && (
                <p className="px-3 pb-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
                  {t(group.title, group.titleAr)}
                </p>
              )}
              {group.items.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  collapsed={collapsed}
                  active={activeTab === item.id}
                  onSelect={() => onTabChange(item.id)}
                />
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* Workspace */}
      <div className="relative z-10 flex-1 min-w-0 flex flex-col">
        <header className="relative z-20 h-16 shrink-0 flex items-center gap-4 px-8 border-b border-foreground/10 bg-background/45 backdrop-blur-2xl backdrop-saturate-150">
          <span aria-hidden className="liquid-hairline pointer-events-none absolute inset-x-8 -bottom-px opacity-60" />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-8 opacity-60"
            style={{ background: 'linear-gradient(180deg, hsl(var(--ink) / 0.07), transparent)' }}
          />
          <div className="relative min-w-0 flex-1">
            <p className="liquid-label mb-0.5">{t('Lumina', 'لومينا')}</p>
            <h1 className="font-display text-lg font-bold tracking-tight truncate">{title}</h1>
            {subtitle && (
              <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
            )}
          </div>
          <EffortSelector />
        </header>


        <main
          key={activeTab}
          className="relative z-10 flex-1 overflow-hidden animate-rise-in"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
