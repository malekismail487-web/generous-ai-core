import { useStreak } from '@/hooks/useStreak';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Progress } from '@/components/ui/progress';
import {
  MessageSquare,
  Layers,
  BookOpen,
  FlipHorizontal,
  ClipboardList,
  FileText,
  GraduationCap,
  Flame,
  Calendar,
  Settings,
  Sparkles,
} from 'lucide-react';

export type GridAction =
  | 'chat'
  | 'subjects'
  | 'examination'
  | 'flashcards'
  | 'notes'
  | 'sat'
  | 'assignments'
  | 'reports'
  | 'weeklyplan'
  | 'settings';

interface StudentHomeGridProps {
  onNavigate: (action: GridAction) => void;
  hasSchool: boolean;
}

const gridItems: { id: GridAction; icon: typeof MessageSquare; label: string; color: string; iconBg: string; schoolOnly?: boolean }[] = [
  { id: 'subjects', icon: Layers, label: 'Subjects', color: 'from-emerald-500 to-teal-600', iconBg: 'bg-emerald-500/15 border-emerald-500/30' },
  { id: 'sat', icon: GraduationCap, label: 'SAT Prep', color: 'from-violet-500 to-purple-600', iconBg: 'bg-violet-500/15 border-violet-500/30' },
  { id: 'examination', icon: BookOpen, label: 'Exams', color: 'from-sky-500 to-blue-600', iconBg: 'bg-sky-500/15 border-sky-500/30' },
  { id: 'assignments', icon: FileText, label: 'Assignments', color: 'from-orange-500 to-amber-600', iconBg: 'bg-orange-500/15 border-orange-500/30', schoolOnly: true },
  { id: 'flashcards', icon: FlipHorizontal, label: 'Flashcards', color: 'from-amber-500 to-yellow-600', iconBg: 'bg-amber-500/15 border-amber-500/30' },
  { id: 'notes', icon: ClipboardList, label: 'Notes', color: 'from-cyan-500 to-teal-600', iconBg: 'bg-cyan-500/15 border-cyan-500/30' },
  { id: 'reports', icon: FileText, label: 'Report Cards', color: 'from-rose-500 to-pink-600', iconBg: 'bg-rose-500/15 border-rose-500/30', schoolOnly: true },
  { id: 'weeklyplan', icon: Calendar, label: 'Weekly Plan', color: 'from-indigo-500 to-blue-600', iconBg: 'bg-indigo-500/15 border-indigo-500/30', schoolOnly: true },
  { id: 'chat', icon: MessageSquare, label: 'AI Tutor', color: 'from-primary to-accent', iconBg: 'bg-primary/15 border-primary/30' },
  { id: 'settings', icon: Settings, label: 'Settings', color: 'from-slate-500 to-gray-600', iconBg: 'bg-slate-500/15 border-slate-500/30' },
];

export function StudentHomeGrid({ onNavigate, hasSchool }: StudentHomeGridProps) {
  const { currentStreak, streakPercentage, MAX_STREAK, loading: streakLoading } = useStreak();
  const { profile } = useRoleGuard();

  const visibleItems = gridItems.filter(item => !item.schoolOnly || hasSchool);

  const firstName = profile?.full_name?.split(' ')[0] || 'Student';

  return (
    <div className="min-h-0 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-24">
      {/* Hero greeting — uses gradient-hero token */}
      <div className="mx-3 mb-6 rounded-3xl overflow-hidden" style={{ background: 'var(--gradient-hero)' }}>
        <div className="px-5 pt-5 pb-6 relative">
          {/* Decorative sparkle */}
          <div className="absolute top-4 right-4 opacity-20">
            <Sparkles className="w-20 h-20 text-primary-foreground" />
          </div>

          <div className="flex items-center justify-between mb-5 relative z-10">
            <div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight">Hello {firstName} 👋</h1>
              <p className="text-white/70 text-sm mt-1">Ready to learn something new today?</p>
            </div>
            <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-2xl px-3.5 py-2.5 border border-white/10">
              <Flame className="w-5 h-5 text-amber-400" />
              <span className="text-white font-bold text-lg">{streakLoading ? '...' : currentStreak}</span>
            </div>
          </div>

          {/* Streak progress bar */}
          <div className="space-y-2 relative z-10">
            <div className="flex justify-between text-xs text-white/70">
              <span>Daily Streak</span>
              <span>{currentStreak} / {MAX_STREAK} days</span>
            </div>
            <div className="w-full bg-white/10 backdrop-blur-sm rounded-full h-3.5 overflow-hidden border border-white/5">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${streakPercentage}%`,
                  background: 'linear-gradient(90deg, #4ade80, #facc15, #f97316, #ef4444)',
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-white/50">
              <span>Start</span>
              <span>Diamond</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid of features */}
      <div className="px-4 grid grid-cols-2 gap-3">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="group flex flex-col items-center justify-center gap-3 p-5 rounded-2xl bg-card border border-border/50 hover:border-primary/40 hover:shadow-lg transition-all duration-300 active:scale-[0.97]"
            >
              <div className={`w-14 h-14 rounded-2xl border ${item.iconBg} flex items-center justify-center transition-transform duration-300 group-hover:scale-110`}>
                <Icon className="w-6 h-6 text-foreground" />
              </div>
              <span className="text-sm font-semibold text-foreground">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}