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
      className="fixed bottom-0 left-0 right-0 z-50 cosmic-header"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Floating capsule container */}
      <div className="flex items-center justify-around h-16 max-w-sm mx-auto px-3 my-2">
        {bottomTabs.map((tab, index) => {
          const Icon = tab.icon;
          const isActive = activeBottomTab === tab.id;
          const isLiveTab = tab.id === 'live';
          const hasLive = isLiveTab && liveCount > 0;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-all duration-500',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
              style={{
                animation: `navPop 0.5s ${index * 0.08}s cubic-bezier(0.16,1,0.3,1) backwards`,
              }}
            >
              <div
                className={cn(
                  'relative w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-500',
                  isLiveTab && 'rounded-full',
                  isActive && !isLiveTab && 'bg-primary/15 border border-primary/30',
                  isActive && isLiveTab && 'bg-primary/20 border border-primary/40',
                  !isActive && 'border border-transparent',
                  hasLive && 'border-red-500/40 bg-red-500/5',
                )}
                style={
                  isActive
                    ? { boxShadow: '0 0 24px -4px hsl(187 92% 52% / 0.5), inset 0 0 12px -4px hsl(187 92% 52% / 0.15)' }
                    : undefined
                }
              >
                <Icon
                  size={20}
                  className={cn(
                    'transition-transform duration-500',
                    isActive && 'scale-110',
                    hasLive && 'text-red-500',
                  )}
                />
                {hasLive && (
                  <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-background animate-pulse" />
                )}
                {isActive && (
                  <span
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary"
                    style={{ boxShadow: '0 0 8px hsl(187 92% 52%)' }}
                  />
                )}
              </div>
              <span
                className={cn(
                  'text-[10px] font-semibold transition-all duration-300',
                  isActive && 'text-primary',
                  hasLive && 'text-red-500',
                )}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      <style>{`
        @keyframes navPop {
          from { opacity: 0; transform: translateY(8px) scale(0.9); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </nav>
  );
}
