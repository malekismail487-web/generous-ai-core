import { Home, Calendar, User, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { useLiveMeetings } from '@/hooks/useLiveMeetings';

export type TabType = 'home' | 'weeklyplan' | 'profile' | 'mindmaps' | 'subjects' | 'notes' | 'flashcards' | 'examination' | 'sat' | 'assignments' | 'reports' | 'podcasts' | 'studybuddy' | 'goals' | 'leaderboard' | 'focustimer' | 'aiplans' | 'announcements' | 'trips' | 'graphcalc' | 'live';

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  hasSchool?: boolean;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const { t } = useThemeLanguage();
  const { liveCount } = useLiveMeetings();
  const activeBottomTab = ['home', 'weeklyplan', 'profile', 'live'].includes(activeTab) ? activeTab : 'home';

  const bottomTabs = [
    { id: 'weeklyplan' as const, icon: Calendar, label: t('Weekly Plan', 'الخطة الأسبوعية') },
    { id: 'home' as const, icon: Home, label: t('Home', 'الرئيسية') },
    { id: 'live' as const, icon: Radio, label: t('Live', 'مباشر') },
    { id: 'profile' as const, icon: User, label: t('Profile', 'الملف الشخصي') },
  ];

  return (
    <nav
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-3"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Primary"
    >
      <div className="dock">
        {bottomTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeBottomTab === tab.id;
          const isLiveTab = tab.id === 'live';
          const hasLive = isLiveTab && liveCount > 0;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              data-active={isActive}
              aria-current={isActive ? 'page' : undefined}
              className="dock-item flex-col !gap-0.5 !px-4 !py-1.5"
            >
              <span className="relative flex items-center justify-center">
                <Icon
                  size={19}
                  className={cn(
                    'transition-transform duration-300',
                    isActive && 'scale-110',
                    hasLive && '!text-red-500',
                  )}
                />
                {hasLive && (
                  <span className="absolute -top-1 -right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-background animate-pulse" />
                )}
              </span>
              <span className={cn('text-[10px] font-semibold leading-none', hasLive && '!text-red-500')}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
