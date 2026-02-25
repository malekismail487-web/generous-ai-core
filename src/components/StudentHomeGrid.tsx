import { useStreak } from '@/hooks/useStreak';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
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

// Ring items: AI-powered features that surround Study Buddy
const RING_ITEMS: { id: GridAction; icon: typeof MessageSquare; label: string; labelAr: string; color: string }[] = [
  { id: 'chat', icon: MessageSquare, label: 'AI Tutor', labelAr: 'المعلم الذكي', color: 'from-blue-500 to-cyan-500' },
  { id: 'examination', icon: BookOpen, label: 'Exams', labelAr: 'الاختبارات', color: 'from-sky-500 to-blue-500' },
  { id: 'subjects', icon: Layers, label: 'Subjects', labelAr: 'المواد', color: 'from-emerald-500 to-green-500' },
  { id: 'sat', icon: GraduationCap, label: 'SAT', labelAr: 'SAT', color: 'from-violet-500 to-purple-500' },
  { id: 'flashcards', icon: FlipHorizontal, label: 'Cards', labelAr: 'بطاقات', color: 'from-amber-500 to-yellow-500' },
  { id: 'podcasts', icon: Podcast, label: 'Podcasts', labelAr: 'بودكاست', color: 'from-fuchsia-500 to-pink-500' },
  { id: 'aiplans', icon: BookOpenCheck, label: 'AI Plan', labelAr: 'خطة AI', color: 'from-indigo-500 to-violet-500' },
  { id: 'notes', icon: ClipboardList, label: 'Notes', labelAr: 'ملاحظات', color: 'from-cyan-500 to-teal-500' },
];

// Branch items: School & progress features
const BRANCH_ITEMS: { id: GridAction; icon: typeof MessageSquare; label: string; labelAr: string; schoolOnly?: boolean }[] = [
  { id: 'assignments', icon: FileText, label: 'Assignments', labelAr: 'الواجبات', schoolOnly: true },
  { id: 'weeklyplan', icon: Calendar, label: 'Weekly Plan', labelAr: 'الخطة', schoolOnly: true },
  { id: 'leaderboard', icon: Trophy, label: 'Ranking', labelAr: 'الترتيب' },
  { id: 'goals', icon: Target, label: 'Goals', labelAr: 'أهداف' },
  { id: 'announcements', icon: Megaphone, label: 'News', labelAr: 'إعلانات', schoolOnly: true },
  { id: 'trips', icon: MapPin, label: 'Trips', labelAr: 'رحلات', schoolOnly: true },
  { id: 'reports', icon: FileText, label: 'Reports', labelAr: 'تقارير', schoolOnly: true },
  { id: 'focustimer', icon: Timer, label: 'Timer', labelAr: 'مؤقت' },
];

export function StudentHomeGrid({ onNavigate, hasSchool }: StudentHomeGridProps) {
  const { currentStreak, streakPercentage, MAX_STREAK, loading: streakLoading } = useStreak();
  const { profile } = useRoleGuard();
  const { t } = useThemeLanguage();

  const firstName = profile?.full_name?.split(' ')[0] || t('Student', 'طالب');

  const filteredBranches = BRANCH_ITEMS.filter(item => !item.schoolOnly || hasSchool);

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
                style={{ width: `${streakPercentage}%`, background: 'linear-gradient(90deg, #4ade80, #facc15, #f97316, #ef4444)' }}
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

      {/* === CIRCULAR MIND-MAP LAYOUT === */}
      <div className="px-4 mb-6">
        <div className="relative w-full" style={{ paddingBottom: '100%' }}>
          <div className="absolute inset-0">
            {/* SVG connection lines */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 100 100">
              {/* Ring circle */}
              <circle cx="50" cy="50" r="28" fill="none" stroke="hsl(var(--border))" strokeWidth="0.3" strokeDasharray="2 1" opacity="0.5" />
              {/* Branch lines from ring to outer items */}
              {filteredBranches.map((_, idx) => {
                const total = filteredBranches.length;
                const angle = (idx / total) * 360 - 90;
                const rad = (angle * Math.PI) / 180;
                const innerX = 50 + 28 * Math.cos(rad);
                const innerY = 50 + 28 * Math.sin(rad);
                const outerX = 50 + 44 * Math.cos(rad);
                const outerY = 50 + 44 * Math.sin(rad);
                return (
                  <line key={idx} x1={innerX} y1={innerY} x2={outerX} y2={outerY}
                    stroke="hsl(var(--border))" strokeWidth="0.25" opacity="0.4" />
                );
              })}
            </svg>

            {/* CENTER: Study Buddy - big circle */}
            <button
              onClick={() => onNavigate('studybuddy')}
              className="absolute z-20 flex flex-col items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 shadow-xl hover:shadow-2xl transition-all duration-300 active:scale-95 opacity-0 animate-[slideUpFade_0.5s_ease-out_forwards]"
              style={{
                width: '22%', height: '22%',
                left: '39%', top: '39%',
              }}
            >
              <Brain className="w-7 h-7 text-white mb-0.5" />
              <span className="text-[8px] font-bold text-white leading-tight text-center">
                {t('Study', 'رفيق')}
                <br />
                {t('Buddy', 'الدراسة')}
              </span>
            </button>

            {/* RING: AI features arranged in a circle around Study Buddy */}
            {RING_ITEMS.map((item, idx) => {
              const total = RING_ITEMS.length;
              const angle = (idx / total) * 360 - 90;
              const rad = (angle * Math.PI) / 180;
              const radius = 28; // % of container
              const cx = 50 + radius * Math.cos(rad);
              const cy = 50 + radius * Math.sin(rad);
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className="absolute z-10 flex flex-col items-center justify-center rounded-full border border-border/50 bg-card shadow-md hover:shadow-lg hover:border-primary/40 transition-all duration-300 active:scale-95 opacity-0 animate-[slideUpFade_0.5s_ease-out_forwards]"
                  style={{
                    width: '14%', height: '14%',
                    left: `${cx - 7}%`, top: `${cy - 7}%`,
                    animationDelay: `${idx * 60 + 200}ms`,
                  }}
                >
                  <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center mb-0.5`}>
                    <Icon className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-[7px] font-semibold text-foreground leading-tight text-center">
                    {t(item.label, item.labelAr)}
                  </span>
                </button>
              );
            })}

            {/* BRANCHES: School & progress features around the outer edge */}
            {filteredBranches.map((item, idx) => {
              const total = filteredBranches.length;
              const angle = (idx / total) * 360 - 90;
              const rad = (angle * Math.PI) / 180;
              const radius = 44; // % of container
              const cx = 50 + radius * Math.cos(rad);
              const cy = 50 + radius * Math.sin(rad);
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className="absolute z-10 flex flex-col items-center justify-center rounded-full border border-border/30 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-300 active:scale-95 opacity-0 animate-[slideUpFade_0.5s_ease-out_forwards]"
                  style={{
                    width: '11%', height: '11%',
                    left: `${cx - 5.5}%`, top: `${cy - 5.5}%`,
                    animationDelay: `${idx * 50 + 700}ms`,
                  }}
                >
                  <Icon className="w-3.5 h-3.5 text-foreground mb-0.5" />
                  <span className="text-[6px] font-semibold text-foreground leading-tight text-center">
                    {t(item.label, item.labelAr)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
