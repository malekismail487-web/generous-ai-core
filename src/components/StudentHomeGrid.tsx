import { useStreak } from '@/hooks/useStreak';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { Progress } from '@/components/ui/progress';
import { LearningProfileCard } from '@/components/student/LearningProfileCard';
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

// Organized grid: Primary actions first row (full-width featured), then categorized sections
export function StudentHomeGrid({ onNavigate, hasSchool }: StudentHomeGridProps) {
  const { currentStreak, streakPercentage, MAX_STREAK, loading: streakLoading } = useStreak();
  const { profile } = useRoleGuard();
  const { t } = useThemeLanguage();

  // Featured items (shown as larger cards at top)
  const featuredItems: { id: GridAction; icon: typeof MessageSquare; label: string; description: string; color: string; iconBg: string }[] = [
    { id: 'chat', icon: MessageSquare, label: t('AI Tutor', 'المعلم الذكي'), description: t('Ask anything', 'اسأل أي شيء'), color: 'from-primary to-accent', iconBg: 'bg-primary/15 border-primary/30' },
    { id: 'studybuddy', icon: Brain, label: t('Study Buddy', 'رفيق الدراسة'), description: t('Study together', 'ادرس معاً'), color: 'from-violet-500 to-purple-600', iconBg: 'bg-violet-500/15 border-violet-500/30' },
  ];

  // Study tools section
  const studyTools: { id: GridAction; icon: typeof MessageSquare; label: string; iconBg: string; schoolOnly?: boolean }[] = [
    { id: 'subjects', icon: Layers, label: t('Subjects', 'المواد'), iconBg: 'bg-emerald-500/15 border-emerald-500/30' },
    { id: 'examination', icon: BookOpen, label: t('Exams', 'الاختبارات'), iconBg: 'bg-sky-500/15 border-sky-500/30' },
    { id: 'flashcards', icon: FlipHorizontal, label: t('Flashcards', 'البطاقات'), iconBg: 'bg-amber-500/15 border-amber-500/30' },
    { id: 'notes', icon: ClipboardList, label: t('Notes', 'الملاحظات'), iconBg: 'bg-cyan-500/15 border-cyan-500/30' },
    { id: 'sat', icon: GraduationCap, label: t('SAT Prep', 'SAT'), iconBg: 'bg-violet-500/15 border-violet-500/30' },
    { id: 'podcasts', icon: Podcast, label: t('Podcasts', 'بودكاست'), iconBg: 'bg-fuchsia-500/15 border-fuchsia-500/30' },
  ];

  // Progress & Goals section
  const progressItems: { id: GridAction; icon: typeof MessageSquare; label: string; iconBg: string }[] = [
    { id: 'goals', icon: Target, label: t('My Goals', 'أهدافي'), iconBg: 'bg-emerald-500/15 border-emerald-500/30' },
    { id: 'aiplans', icon: BookOpenCheck, label: t('AI Plan', 'خطة AI'), iconBg: 'bg-violet-500/15 border-violet-500/30' },
    { id: 'focustimer', icon: Timer, label: t('Focus', 'تركيز'), iconBg: 'bg-red-500/15 border-red-500/30' },
    { id: 'leaderboard', icon: Trophy, label: t('Ranking', 'الترتيب'), iconBg: 'bg-yellow-500/15 border-yellow-500/30' },
  ];

  // School section (only when user has a school)
  const schoolItems: { id: GridAction; icon: typeof MessageSquare; label: string; iconBg: string }[] = [
    { id: 'assignments', icon: FileText, label: t('Assignments', 'الواجبات'), iconBg: 'bg-orange-500/15 border-orange-500/30' },
    { id: 'weeklyplan', icon: Calendar, label: t('Weekly Plan', 'الخطة'), iconBg: 'bg-indigo-500/15 border-indigo-500/30' },
    { id: 'reports', icon: FileText, label: t('Reports', 'الدرجات'), iconBg: 'bg-rose-500/15 border-rose-500/30' },
    { id: 'announcements', icon: Megaphone, label: t('News', 'الإعلانات'), iconBg: 'bg-amber-500/15 border-amber-500/30' },
    { id: 'trips', icon: MapPin, label: t('Trips', 'الرحلات'), iconBg: 'bg-teal-500/15 border-teal-500/30' },
  ];

  const firstName = profile?.full_name?.split(' ')[0] || t('Student', 'طالب');

  return (
    <div className="min-h-0 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-24">
      {/* Hero greeting */}
      <div className="mx-3 mb-5 rounded-3xl overflow-hidden opacity-0 animate-[slideUpFade_0.6s_ease-out_forwards]" style={{ background: 'var(--gradient-hero)' }}>
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

      {/* Learning Profile Card */}
      <div className="px-4 mb-4">
        <LearningProfileCard />
      </div>

      {/* Featured AI Tools - 2 large cards */}
      <div className="px-4 grid grid-cols-2 gap-3 mb-5">
        {featuredItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="group flex flex-col items-start gap-2 p-4 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5 hover:from-primary/10 hover:to-accent/10 hover:shadow-lg transition-all duration-300 active:scale-[0.97] opacity-0 animate-[slideUpFade_0.5s_ease-out_forwards]"
              style={{ animationDelay: `${index * 60 + 200}ms` }}
            >
              <div className={`w-12 h-12 rounded-2xl border ${item.iconBg} flex items-center justify-center transition-transform duration-300 group-hover:scale-110`}>
                <Icon className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <span className="text-sm font-bold text-foreground block">{item.label}</span>
                <span className="text-[11px] text-muted-foreground">{item.description}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Study Tools Section */}
      <div className="px-4 mb-5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
          {t('📚 Study Tools', '📚 أدوات الدراسة')}
        </h3>
        <div className="grid grid-cols-3 gap-2.5">
          {studyTools.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className="group flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-card border border-border/50 hover:border-primary/40 hover:shadow-md transition-all duration-300 active:scale-[0.97] opacity-0 animate-[slideUpFade_0.5s_ease-out_forwards]"
                style={{ animationDelay: `${index * 50 + 400}ms` }}
              >
                <div className={`w-11 h-11 rounded-xl border ${item.iconBg} flex items-center justify-center transition-transform duration-300 group-hover:scale-110`}>
                  <Icon className="w-5 h-5 text-foreground" />
                </div>
                <span className="text-xs font-semibold text-foreground text-center">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Progress & Goals Section */}
      <div className="px-4 mb-5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
          {t('🎯 Progress & Goals', '🎯 التقدم والأهداف')}
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {progressItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className="group flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-card border border-border/50 hover:border-primary/40 hover:shadow-md transition-all duration-300 active:scale-[0.97] opacity-0 animate-[slideUpFade_0.5s_ease-out_forwards]"
                style={{ animationDelay: `${index * 50 + 600}ms` }}
              >
                <div className={`w-9 h-9 rounded-lg border ${item.iconBg} flex items-center justify-center transition-transform duration-300 group-hover:scale-110`}>
                  <Icon className="w-4 h-4 text-foreground" />
                </div>
                <span className="text-[10px] font-semibold text-foreground text-center leading-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* School Section */}
      {hasSchool && (
        <div className="px-4 mb-5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
            {t('🏫 School', '🏫 المدرسة')}
          </h3>
          <div className="grid grid-cols-3 gap-2.5">
            {schoolItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className="group flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl bg-card border border-border/50 hover:border-primary/40 hover:shadow-md transition-all duration-300 active:scale-[0.97] opacity-0 animate-[slideUpFade_0.5s_ease-out_forwards]"
                  style={{ animationDelay: `${index * 50 + 800}ms` }}
                >
                  <div className={`w-10 h-10 rounded-xl border ${item.iconBg} flex items-center justify-center transition-transform duration-300 group-hover:scale-110`}>
                    <Icon className="w-4.5 h-4.5 text-foreground" />
                  </div>
                  <span className="text-xs font-semibold text-foreground text-center">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Settings - standalone at bottom */}
      <div className="px-4 mb-6">
        <button
          onClick={() => onNavigate('settings')}
          className="w-full group flex items-center gap-3 p-4 rounded-2xl bg-card border border-border/50 hover:border-primary/40 hover:shadow-md transition-all duration-300 active:scale-[0.97] opacity-0 animate-[slideUpFade_0.5s_ease-out_forwards]"
          style={{ animationDelay: '1000ms' }}
        >
          <div className="w-10 h-10 rounded-xl border bg-slate-500/15 border-slate-500/30 flex items-center justify-center">
            <Settings className="w-5 h-5 text-foreground" />
          </div>
          <span className="text-sm font-semibold text-foreground">{t('Settings', 'الإعدادات')}</span>
        </button>
      </div>
    </div>
  );
}
