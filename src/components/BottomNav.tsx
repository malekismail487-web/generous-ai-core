import { Home, Calendar, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TabType = 'home' | 'weeklyplan' | 'profile' | 'chat' | 'subjects' | 'notes' | 'flashcards' | 'examination' | 'sat' | 'assignments' | 'reports';

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  hasSchool?: boolean;
}

const bottomTabs = [
  { id: 'home' as const, icon: Home, label: 'Home' },
  { id: 'weeklyplan' as const, icon: Calendar, label: 'Weekly Plan' },
  { id: 'profile' as const, icon: User, label: 'Profile' },
];

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  // Only highlight Home, Weekly Plan, Profile in the bottom bar
  const activeBottomTab = ['home', 'weeklyplan', 'profile'].includes(activeTab) ? activeTab : 'home';

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass-effect-strong border-t border-border/30 pb-safe">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {bottomTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeBottomTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-all duration-200",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <div className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200",
                isActive && "bg-primary/20"
              )}>
                <Icon size={18} className={cn(isActive && "scale-110")} />
              </div>
              <span className={cn(
                "text-[10px] font-medium transition-all",
                isActive && "text-primary"
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
