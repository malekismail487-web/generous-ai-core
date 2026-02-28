import { useState } from 'react';
import { useStreak } from '@/hooks/useStreak';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { LuminaMascot } from '@/components/LuminaMascot';
import {
  MessageSquare, Layers, BookOpen, FlipHorizontal, ClipboardList,
  FileText, GraduationCap, Flame, Calendar, Sparkles, Podcast,
  Target, Trophy, Timer, BookOpenCheck, Megaphone, MapPin,
} from 'lucide-react';

export type GridAction =
  | 'chat' | 'subjects' | 'examination' | 'flashcards' | 'notes' | 'sat'
  | 'assignments' | 'reports' | 'weeklyplan' | 'podcasts' | 'studybuddy'
  | 'goals' | 'leaderboard' | 'focustimer' | 'aiplans' | 'announcements'
  | 'trips' | 'settings';

interface StudentHomeGridProps {
  onNavigate: (action: GridAction) => void;
  hasSchool: boolean;
}

// Ring items: AI-powered features that surround Lumina
const RING_ITEMS: { id: GridAction; icon: typeof MessageSquare; label: string; labelAr: string; color: string; hoverAnim: string }[] = [
  { id: 'chat', icon: MessageSquare, label: 'AI Tutor', labelAr: 'المعلم الذكي', color: 'from-blue-500 to-cyan-500', hoverAnim: 'hover-chat' },
  { id: 'examination', icon: BookOpen, label: 'Exams', labelAr: 'الاختبارات', color: 'from-sky-500 to-blue-500', hoverAnim: 'hover-exam' },
  { id: 'subjects', icon: Layers, label: 'Subjects', labelAr: 'المواد', color: 'from-emerald-500 to-green-500', hoverAnim: 'hover-layers' },
  { id: 'sat', icon: GraduationCap, label: 'SAT', labelAr: 'SAT', color: 'from-violet-500 to-purple-500', hoverAnim: 'hover-bounce' },
  { id: 'flashcards', icon: FlipHorizontal, label: 'Cards', labelAr: 'بطاقات', color: 'from-amber-500 to-yellow-500', hoverAnim: 'hover-flip' },
  { id: 'podcasts', icon: Podcast, label: 'Podcasts', labelAr: 'بودكاست', color: 'from-fuchsia-500 to-pink-500', hoverAnim: 'hover-pulse-wave' },
  { id: 'aiplans', icon: BookOpenCheck, label: 'AI Plan', labelAr: 'خطة AI', color: 'from-indigo-500 to-violet-500', hoverAnim: 'hover-sparkle' },
  { id: 'notes', icon: ClipboardList, label: 'Notes', labelAr: 'ملاحظات', color: 'from-cyan-500 to-teal-500', hoverAnim: 'hover-write' },
];

// Branch items: School & progress features
const BRANCH_ITEMS: { id: GridAction; icon: typeof MessageSquare; label: string; labelAr: string; schoolOnly?: boolean; hoverAnim: string }[] = [
  { id: 'assignments', icon: FileText, label: 'Assignments', labelAr: 'الواجبات', schoolOnly: true, hoverAnim: 'hover-slide-paper' },
  { id: 'weeklyplan', icon: Calendar, label: 'Weekly Plan', labelAr: 'الخطة', schoolOnly: true, hoverAnim: 'hover-calendar' },
  { id: 'leaderboard', icon: Trophy, label: 'Ranking', labelAr: 'الترتيب', hoverAnim: 'hover-trophy' },
  { id: 'goals', icon: Target, label: 'Goals', labelAr: 'أهداف', hoverAnim: 'hover-target' },
  { id: 'announcements', icon: Megaphone, label: 'News', labelAr: 'إعلانات', schoolOnly: true, hoverAnim: 'hover-megaphone' },
  { id: 'trips', icon: MapPin, label: 'Trips', labelAr: 'رحلات', schoolOnly: true, hoverAnim: 'hover-pin' },
  { id: 'reports', icon: FileText, label: 'Reports', labelAr: 'تقارير', schoolOnly: true, hoverAnim: 'hover-chart' },
  { id: 'focustimer', icon: Timer, label: 'Timer', labelAr: 'مؤقت', hoverAnim: 'hover-tick' },
];

export function StudentHomeGrid({ onNavigate, hasSchool }: StudentHomeGridProps) {
  const { currentStreak, streakPercentage, MAX_STREAK, loading: streakLoading } = useStreak();
  const { profile } = useRoleGuard();
  const { t } = useThemeLanguage();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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


      {/* === CIRCULAR MIND-MAP LAYOUT === */}
      <div className="px-4 mb-6">
        <div className="relative w-full" style={{ paddingBottom: '100%' }}>
          <div className="absolute inset-0">
            {/* SVG connection lines */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="28" fill="none" stroke="hsl(var(--border))" strokeWidth="0.3" strokeDasharray="2 1" opacity="0.5" />
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

            {/* CENTER: Lumina - big circle with mascot */}
            <button
              onClick={() => onNavigate('studybuddy')}
              onMouseEnter={() => setHoveredId('studybuddy')}
              onMouseLeave={() => setHoveredId(null)}
              className="absolute z-20 flex flex-col items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 shadow-xl hover:shadow-2xl transition-all duration-300 active:scale-95 opacity-0 animate-[slideUpFade_0.5s_ease-out_forwards] group"
              style={{
                width: '22%', height: '22%',
                left: '39%', top: '39%',
              }}
            >
              <div className={`transition-transform duration-500 ${hoveredId === 'studybuddy' ? 'scale-110 rotate-[10deg]' : ''}`}>
                <LuminaMascot size={32} className="text-white" />
              </div>
              <span className="text-[9px] font-bold text-white leading-tight text-center" style={{ fontFamily: 'Caveat, cursive' }}>
                {t('Lumina', 'لومينا')}
              </span>
            </button>

            {/* RING: AI features arranged in a circle */}
            {RING_ITEMS.map((item, idx) => {
              const total = RING_ITEMS.length;
              const angle = (idx / total) * 360 - 90;
              const rad = (angle * Math.PI) / 180;
              const radius = 28;
              const cx = 50 + radius * Math.cos(rad);
              const cy = 50 + radius * Math.sin(rad);
              const Icon = item.icon;
              const isHovered = hoveredId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  onMouseEnter={() => setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className="absolute z-10 flex flex-col items-center justify-center rounded-full border border-border/50 bg-card shadow-md hover:shadow-lg hover:border-primary/40 transition-all duration-300 active:scale-95 opacity-0 animate-[slideUpFade_0.5s_ease-out_forwards] group overflow-visible"
                  style={{
                    width: '14%', height: '14%',
                    left: `${cx - 7}%`, top: `${cy - 7}%`,
                    animationDelay: `${idx * 60 + 200}ms`,
                  }}
                >
                  <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center mb-0.5 transition-transform duration-300 ${isHovered ? 'scale-125' : ''}`}>
                    <Icon className={`w-3 h-3 text-white transition-transform duration-300 ${isHovered ? getIconAnimation(item.id) : ''}`} />
                  </div>
                  <span className="text-[7px] font-semibold text-foreground leading-tight text-center">
                    {t(item.label, item.labelAr)}
                  </span>
                  {/* Hover overlay decorations */}
                  {isHovered && <HoverDecoration itemId={item.id} />}
                </button>
              );
            })}

            {/* BRANCHES: School & progress features */}
            {filteredBranches.map((item, idx) => {
              const total = filteredBranches.length;
              const angle = (idx / total) * 360 - 90;
              const rad = (angle * Math.PI) / 180;
              const radius = 44;
              const cx = 50 + radius * Math.cos(rad);
              const cy = 50 + radius * Math.sin(rad);
              const Icon = item.icon;
              const isHovered = hoveredId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  onMouseEnter={() => setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className="absolute z-10 flex flex-col items-center justify-center rounded-full border border-border/30 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-300 active:scale-95 opacity-0 animate-[slideUpFade_0.5s_ease-out_forwards] group overflow-visible"
                  style={{
                    width: '11%', height: '11%',
                    left: `${cx - 5.5}%`, top: `${cy - 5.5}%`,
                    animationDelay: `${idx * 50 + 700}ms`,
                  }}
                >
                  <Icon className={`w-3.5 h-3.5 text-foreground mb-0.5 transition-transform duration-300 ${isHovered ? getIconAnimation(item.id) : ''}`} />
                  <span className="text-[6px] font-semibold text-foreground leading-tight text-center">
                    {t(item.label, item.labelAr)}
                  </span>
                  {isHovered && <HoverDecoration itemId={item.id} />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Returns a CSS animation class per icon on hover
function getIconAnimation(id: string): string {
  switch (id) {
    case 'chat': return 'animate-[wiggle_0.4s_ease-in-out]';
    case 'examination': return 'animate-[bounceOnce_0.5s_ease]';
    case 'subjects': return 'animate-[stackUp_0.4s_ease]';
    case 'sat': return 'animate-[bounceOnce_0.5s_ease]';
    case 'flashcards': return 'animate-[flipOnce_0.6s_ease]';
    case 'podcasts': return 'animate-[pulseOnce_0.5s_ease]';
    case 'aiplans': return 'animate-[sparkleRotate_0.6s_ease]';
    case 'notes': return 'animate-[wiggle_0.4s_ease-in-out]';
    case 'assignments': return 'animate-[slideDown_0.4s_ease]';
    case 'weeklyplan': return 'animate-[flipOnce_0.6s_ease]';
    case 'leaderboard': return 'animate-[bounceOnce_0.5s_ease]';
    case 'goals': return 'animate-[pulseOnce_0.5s_ease]';
    case 'announcements': return 'animate-[wiggle_0.4s_ease-in-out]';
    case 'trips': return 'animate-[bounceOnce_0.5s_ease]';
    case 'reports': return 'animate-[stackUp_0.4s_ease]';
    case 'focustimer': return 'animate-[sparkleRotate_0.6s_ease]';
    default: return '';
  }
}

// Small decorative elements that appear on hover per tab
function HoverDecoration({ itemId }: { itemId: string }) {
  const base = "absolute pointer-events-none animate-[popIn_0.3s_ease-out_forwards]";

  switch (itemId) {
    case 'flashcards':
      return (
        <>
          <div className={`${base} -top-2 -left-2 w-3 h-4 rounded-sm bg-amber-400/60 rotate-[-15deg] border border-amber-300/40`} />
          <div className={`${base} -top-1 -right-2 w-3 h-4 rounded-sm bg-yellow-400/60 rotate-[10deg] border border-yellow-300/40`} />
        </>
      );
    case 'chat':
      return (
        <>
          <div className={`${base} -top-2 -right-1 w-2 h-2 rounded-full bg-blue-400/70`} />
          <div className={`${base} -top-3 left-1 w-1.5 h-1.5 rounded-full bg-cyan-400/70`} />
          <div className={`${base} -top-1 -left-2 w-1 h-1 rounded-full bg-blue-300/70`} />
        </>
      );
    case 'examination':
      return (
        <div className={`${base} -top-2 right-0 text-[8px]`}>✓</div>
      );
    case 'podcasts':
      return (
        <>
          <div className={`${base} -right-2 top-1 w-1 h-3 rounded-full bg-fuchsia-400/50`} />
          <div className={`${base} -right-3 top-0 w-0.5 h-4 rounded-full bg-pink-400/40`} />
        </>
      );
    case 'leaderboard':
      return (
        <div className={`${base} -top-2 left-1/2 -translate-x-1/2 text-[8px]`}>⭐</div>
      );
    case 'goals':
      return (
        <div className={`${base} -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400/70 animate-ping`} />
      );
    case 'focustimer':
      return (
        <div className={`${base} -top-2 left-1/2 -translate-x-1/2 text-[8px] animate-[tick_1s_steps(2)_infinite]`}>⏱</div>
      );
    default:
      return null;
  }
}
