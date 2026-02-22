import { useStreak } from '@/hooks/useStreak';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
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
  Podcast,
  Brain,
  Target,
  Trophy,
  Timer,
  BookOpenCheck,
  Megaphone,
  MapPin,
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
  | 'podcasts'
  | 'studybuddy'
  | 'goals'
  | 'leaderboard'
  | 'focustimer'
  | 'aiplans'
  | 'announcements'
  | 'trips'
  | 'settings';

interface StudentHomeGridProps {
  onNavigate: (action: GridAction) => void;
  hasSchool: boolean;
}

export function StudentHomeGrid({ onNavigate, hasSchool }: StudentHomeGridProps) {
  const { currentStreak, streakPercentage, MAX_STREAK, loading: streakLoading } = useStreak();
  const { profile } = useRoleGuard();
  const { t } = useThemeLanguage();

  const gridItems: { id: GridAction; icon: typeof MessageSquare; label: string; color: string; iconBg: string; schoolOnly?: boolean }[] = [
    { id: 'studybuddy', icon: Brain, label: t('Study Buddy', 'رفيق الدراسة'), color: 'from-violet-500 to-purple-600', iconBg: 'bg-violet-500/15 border-violet-500/30' },
    { id: 'goals', icon: Target, label: t('My Goals', 'أهدافي'), color: 'from-emerald-500 to-green-600', iconBg: 'bg-emerald-500/15 border-emerald-500/30' },
    { id: 'leaderboard', icon: Trophy, label: t('Leaderboard', 'المتصدرين'), color: 'from-yellow-500 to-amber-600', iconBg: 'bg-yellow-500/15 border-yellow-500/30', schoolOnly: true },
    { id: 'focustimer', icon: Timer, label: t('Focus Timer', 'مؤقت التركيز'), color: 'from-red-500 to-orange-600', iconBg: 'bg-red-500/15 border-red-500/30' },
    { id: 'aiplans', icon: BookOpenCheck, label: t('AI Study Plan', 'خطة دراسة AI'), color: 'from-violet-500 to-indigo-600', iconBg: 'bg-violet-500/15 border-violet-500/30' },
    { id: 'subjects', icon: Layers, label: t('Subjects', 'المواد'), color: 'from-emerald-500 to-teal-600', iconBg: 'bg-emerald-500/15 border-emerald-500/30' },
    { id: 'sat', icon: GraduationCap, label: t('SAT Prep', 'تحضير SAT'), color: 'from-violet-500 to-purple-600', iconBg: 'bg-violet-500/15 border-violet-500/30' },
    { id: 'examination', icon: BookOpen, label: t('Exams', 'الاختبارات'), color: 'from-sky-500 to-blue-600', iconBg: 'bg-sky-500/15 border-sky-500/30' },
    { id: 'assignments', icon: FileText, label: t('Assignments', 'الواجبات'), color: 'from-orange-500 to-amber-600', iconBg: 'bg-orange-500/15 border-orange-500/30', schoolOnly: true },
    { id: 'flashcards', icon: FlipHorizontal, label: t('Flashcards', 'البطاقات التعليمية'), color: 'from-amber-500 to-yellow-600', iconBg: 'bg-amber-500/15 border-amber-500/30' },
    { id: 'notes', icon: ClipboardList, label: t('Notes', 'الملاحظات'), color: 'from-cyan-500 to-teal-600', iconBg: 'bg-cyan-500/15 border-cyan-500/30' },
    { id: 'reports', icon: FileText, label: t('Report Cards', 'كشوف الدرجات'), color: 'from-rose-500 to-pink-600', iconBg: 'bg-rose-500/15 border-rose-500/30', schoolOnly: true },
    { id: 'weeklyplan', icon: Calendar, label: t('Weekly Plan', 'الخطة الأسبوعية'), color: 'from-indigo-500 to-blue-600', iconBg: 'bg-indigo-500/15 border-indigo-500/30', schoolOnly: true },
    { id: 'chat', icon: MessageSquare, label: t('AI Tutor', 'المعلم الذكي'), color: 'from-primary to-accent', iconBg: 'bg-primary/15 border-primary/30' },
    { id: 'podcasts', icon: Podcast, label: t('AI Podcasts', 'بودكاست AI'), color: 'from-fuchsia-500/15 to-pink-600', iconBg: 'bg-fuchsia-500/15 border-fuchsia-500/30' },
    { id: 'announcements', icon: Megaphone, label: t('Announcements', 'الإعلانات'), color: 'from-amber-500 to-orange-600', iconBg: 'bg-amber-500/15 border-amber-500/30', schoolOnly: true },
    { id: 'trips', icon: MapPin, label: t('Trips', 'الرحلات'), color: 'from-teal-500 to-emerald-600', iconBg: 'bg-teal-500/15 border-teal-500/30', schoolOnly: true },
    { id: 'settings', icon: Settings, label: t('Settings', 'الإعدادات'), color: 'from-slate-500 to-gray-600', iconBg: 'bg-slate-500/15 border-slate-500/30' },
  ];

  const visibleItems = gridItems.filter(item => !item.schoolOnly || hasSchool);

  const firstName = profile?.full_name?.split(' ')[0] || t('Student', 'طالب');

  return (
    <div className="min-h-0 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-24">
      {/* Hero greeting */}
      <div className="mx-3 mb-6 rounded-3xl overflow-hidden opacity-0 animate-[slideUpFade_0.6s_ease-out_forwards]" style={{ background: 'var(--gradient-hero)' }}>
        <div className="px-5 pt-5 pb-6 relative">
          <div className="absolute top-4 right-4 opacity-20">
            <Sparkles className="w-20 h-20 text-primary-foreground" />
          </div>

          <div className="flex items-center justify-between mb-5 relative z-10">
            <div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight">
                {t(`Hello ${firstName} 👋`, `مرحباً ${firstName} 👋`)}
              </h1>
              <p className="text-white/70 text-sm mt-1">
                {t('Ready to learn something new today?', 'مستعد لتعلم شيء جديد اليوم؟')}
              </p>
            </div>
            <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-2xl px-3.5 py-2.5 border border-white/10">
              <Flame className="w-5 h-5 text-amber-400" />
              <span className="text-white font-bold text-lg">{streakLoading ? '...' : currentStreak}</span>
            </div>
          </div>

          <div className="space-y-2 relative z-10">
            <div className="flex justify-between text-xs text-white/70">
              <span>{t('Daily Streak', 'السلسلة اليومية')}</span>
              <span>{currentStreak} / {MAX_STREAK} {t('days', 'يوم')}</span>
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
              <span>{t('Start', 'البداية')}</span>
              <span>{t('Diamond', 'الماسي')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid of features */}
      <div className="px-4 grid grid-cols-2 gap-3">
        {visibleItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="group flex flex-col items-center justify-center gap-3 p-5 rounded-2xl bg-card border border-border/50 hover:border-primary/40 hover:shadow-lg transition-all duration-300 active:scale-[0.97] opacity-0 animate-[slideUpFade_0.5s_ease-out_forwards]"
              style={{ animationDelay: `${index * 60 + 200}ms` }}
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
