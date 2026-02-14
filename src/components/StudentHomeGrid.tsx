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

const gridItems: { id: GridAction; icon: typeof MessageSquare; label: string; color: string; borderColor: string; schoolOnly?: boolean }[] = [
  { id: 'subjects', icon: Layers, label: 'Subjects', color: 'from-emerald-500 to-emerald-600', borderColor: 'border-emerald-500' },
  { id: 'sat', icon: GraduationCap, label: 'SAT Prep', color: 'from-purple-500 to-purple-600', borderColor: 'border-purple-500' },
  { id: 'examination', icon: BookOpen, label: 'Exams', color: 'from-green-500 to-green-600', borderColor: 'border-green-500' },
  { id: 'assignments', icon: FileText, label: 'Assignments', color: 'from-orange-500 to-orange-600', borderColor: 'border-orange-500', schoolOnly: true },
  { id: 'flashcards', icon: FlipHorizontal, label: 'Flashcards', color: 'from-amber-500 to-amber-600', borderColor: 'border-amber-500' },
  { id: 'notes', icon: ClipboardList, label: 'Notes', color: 'from-cyan-500 to-cyan-600', borderColor: 'border-cyan-500' },
  { id: 'reports', icon: FileText, label: 'Report Cards', color: 'from-rose-500 to-rose-600', borderColor: 'border-rose-500', schoolOnly: true },
  { id: 'weeklyplan', icon: Calendar, label: 'Weekly Plan', color: 'from-indigo-500 to-indigo-600', borderColor: 'border-indigo-500', schoolOnly: true },
  
  { id: 'chat', icon: MessageSquare, label: 'AI Tutor', color: 'from-blue-500 to-blue-600', borderColor: 'border-blue-500' },
  { id: 'settings', icon: Settings, label: 'Settings', color: 'from-gray-500 to-gray-600', borderColor: 'border-gray-500' },
];

export function StudentHomeGrid({ onNavigate, hasSchool }: StudentHomeGridProps) {
  const { currentStreak, streakPercentage, MAX_STREAK, loading: streakLoading } = useStreak();
  const { profile } = useRoleGuard();

  const visibleItems = gridItems.filter(item => !item.schoolOnly || hasSchool);

  const firstName = profile?.full_name?.split(' ')[0] || 'Student';

  return (
    <div className="min-h-0 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-24">
      {/* Hero greeting header */}
      <div className="px-4 pt-4 pb-6 bg-gradient-to-br from-blue-600 to-blue-700 rounded-b-3xl mx-2 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-extrabold text-white">Hello {firstName} 👋</h1>
            <p className="text-blue-100 text-sm mt-1">Ready to learn something new today?</p>
          </div>
          <div className="flex items-center gap-2 bg-white/20 rounded-xl px-3 py-2">
            <Flame className="w-5 h-5 text-amber-300" />
            <span className="text-white font-bold text-lg">{streakLoading ? '...' : currentStreak}</span>
          </div>
        </div>

        {/* Streak progress bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-blue-100">
            <span>Daily Streak</span>
            <span>{currentStreak} / {MAX_STREAK} days</span>
          </div>
          <div className="w-full bg-white/20 rounded-full h-3 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${streakPercentage}%`,
                background: 'linear-gradient(90deg, #4ade80, #facc15, #f97316, #ef4444)',
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-blue-200">
            <span>Start</span>
            <span>Diamond</span>
          </div>
        </div>
      </div>

      {/* Grid of features */}
      <div className="px-4 grid grid-cols-2 gap-4">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/30 hover:shadow-lg transition-all duration-200 active:scale-95"
            >
              <div className={`w-16 h-16 rounded-full border-[3px] ${item.borderColor} flex items-center justify-center`}>
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </div>
              <span className="text-sm font-semibold text-foreground">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
