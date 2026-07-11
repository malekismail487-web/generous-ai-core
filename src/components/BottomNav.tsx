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
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass-effect-strong border-t border-border/30" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {bottomTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeBottomTab === tab.id;
          const isLiveTab = tab.id === 'live';
          const hasLive = isLiveTab && liveCount > 0;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-all duration-300",
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className={cn(
                "relative w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300",
                !isLiveTab && "rounded-xl",
                isActive && "bg-muted shadow-sm",
                isLiveTab && "border border-border/50",
                hasLive && "border-red-500/50 bg-red-500/5"
              )}>
                <Icon size={18} className={cn(
                  "transition-transform duration-300",
                  isActive && "scale-110",
                  hasLive && "text-red-500"
                )} />
                {hasLive && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-background animate-pulse" />
                )}
              </div>
              <span className={cn(
                "text-[10px] font-semibold transition-all",
                isActive && "text-foreground",
                hasLive && "text-red-500"
              )}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
