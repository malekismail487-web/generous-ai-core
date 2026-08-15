import { useState } from 'react';
import {
  Brain, Layers, BookOpen, FlipHorizontal, ClipboardList, FileText,
  GraduationCap, Calendar, Podcast, Target, Trophy, Timer, BookOpenCheck,
  Megaphone, MapPin, LineChart, Flame, ArrowUpRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStreak } from '@/hooks/useStreak';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { LuminaLogo } from '@/components/LuminaLogo';
import { BriefingDock } from '@/components/student/BriefingDock';
import { CognitiveMirrorGauge } from '@/components/student/CognitiveMirrorCard';
import type { GridAction } from '@/components/StudentHomeGrid';

interface Tile {
  id: GridAction;
  icon: typeof Brain;
  label: string;
  labelAr: string;
  note: string;
  noteAr: string;
  span: string;
  schoolOnly?: boolean;
}

/** Deliberately uneven — the grid reads like a printed contact sheet, not a dashboard. */
const TILES: Tile[] = [
  { id: 'mindmaps', icon: Brain, label: 'Mind maps', labelAr: 'خرائط ذهنية', note: 'Structure a topic', noteAr: 'ابنِ بنية الموضوع', span: 'col-span-2 row-span-2' },
  { id: 'subjects', icon: Layers, label: 'Subjects', labelAr: 'المواد', note: 'Your shelves', noteAr: 'رفوفك', span: 'col-span-2 row-span-1' },
  { id: 'examination', icon: BookOpen, label: 'Exams', labelAr: 'الاختبارات', note: 'Sit one now', noteAr: 'ابدأ اختباراً', span: 'col-span-1 row-span-1' },
  { id: 'sat', icon: GraduationCap, label: 'SAT', labelAr: 'SAT', note: 'Timed drills', noteAr: 'تدريب موقوت', span: 'col-span-1 row-span-1' },
  { id: 'flashcards', icon: FlipHorizontal, label: 'Cards', labelAr: 'بطاقات', note: 'Spaced recall', noteAr: 'استرجاع متباعد', span: 'col-span-1 row-span-1' },
  { id: 'podcasts', icon: Podcast, label: 'Podcasts', labelAr: 'بودكاست', note: 'Listen instead', noteAr: 'استمع بدلاً', span: 'col-span-1 row-span-1' },
  { id: 'aiplans', icon: BookOpenCheck, label: 'Study plan', labelAr: 'خطة الدراسة', note: 'Built around you', noteAr: 'مبنية حولك', span: 'col-span-2 row-span-1' },
  { id: 'notes', icon: ClipboardList, label: 'Notes', labelAr: 'ملاحظات', note: 'Everything kept', noteAr: 'كل ما حفظته', span: 'col-span-1 row-span-1' },
  { id: 'graphcalc', icon: LineChart, label: 'Graphs', labelAr: 'رسوم', note: 'Plot it out', noteAr: 'ارسمها', span: 'col-span-1 row-span-1' },
  { id: 'assignments', icon: FileText, label: 'Assignments', labelAr: 'الواجبات', note: 'From your teachers', noteAr: 'من معلميك', span: 'col-span-2 row-span-1', schoolOnly: true },
  { id: 'weeklyplan', icon: Calendar, label: 'Weekly plan', labelAr: 'الخطة', note: 'Sunday to Thursday', noteAr: 'الأحد إلى الخميس', span: 'col-span-1 row-span-1', schoolOnly: true },
  { id: 'leaderboard', icon: Trophy, label: 'Ranking', labelAr: 'الترتيب', note: 'Your school only', noteAr: 'مدرستك فقط', span: 'col-span-1 row-span-1' },
  { id: 'goals', icon: Target, label: 'Goals', labelAr: 'أهداف', note: 'Small, daily', noteAr: 'صغيرة ويومية', span: 'col-span-1 row-span-1' },
  { id: 'focustimer', icon: Timer, label: 'Focus', labelAr: 'تركيز', note: 'One block at a time', noteAr: 'كتلة واحدة', span: 'col-span-1 row-span-1' },
  { id: 'announcements', icon: Megaphone, label: 'News', labelAr: 'إعلانات', note: 'School notices', noteAr: 'إشعارات المدرسة', span: 'col-span-1 row-span-1', schoolOnly: true },
  { id: 'trips', icon: MapPin, label: 'Trips', labelAr: 'رحلات', note: 'Sign-ups', noteAr: 'التسجيل', span: 'col-span-1 row-span-1', schoolOnly: true },
  { id: 'reports', icon: FileText, label: 'Reports', labelAr: 'تقارير', note: 'Term grades', noteAr: 'درجات الفصل', span: 'col-span-2 row-span-1', schoolOnly: true },
];

function TileButton({ tile, index, onNavigate }: { tile: Tile; index: number; onNavigate: (a: GridAction) => void }) {
  const { t } = useThemeLanguage();
  const Icon = tile.icon;
  return (
    <button
      onClick={() => onNavigate(tile.id)}
      style={{ animationDelay: `${index * 35 + 120}ms` }}
      className={cn(
        tile.span,
        'group relative overflow-hidden rounded-[1.4rem] border border-foreground/12 bg-foreground/[0.03] backdrop-blur-2xl backdrop-saturate-150',
        'p-4 text-left opacity-0 animate-[slideUpFade_0.6s_cubic-bezier(0.16,1,0.3,1)_forwards]',
        'transition-[transform,border-color,background-color] duration-500',
        'hover:-translate-y-1 hover:border-foreground/25 hover:bg-foreground/[0.05]',
      )}
    >
      {/* diagonal hairline field — the abstraction */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05] transition-opacity duration-700 group-hover:opacity-[0.14]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(135deg, hsl(var(--foreground)) 0 1px, transparent 1px 9px)',
        }}
      />
      <span className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full border border-foreground/10 transition-transform duration-700 group-hover:scale-125" />
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/25 to-transparent" />

      <span className="relative flex h-full flex-col justify-between">
        <span className="flex items-start justify-between">
          <Icon size={18} className="text-foreground transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110" />
          <ArrowUpRight size={13} className="text-muted-foreground opacity-0 transition-all duration-500 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </span>
        <span className="mt-6 block">
          <span className="block font-display text-sm font-bold tracking-tight text-foreground">
            {t(tile.label, tile.labelAr)}
          </span>
          <span className="mt-0.5 block text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {t(tile.note, tile.noteAr)}
          </span>
        </span>
      </span>
    </button>
  );
}

export function DesktopHome({ onNavigate, hasSchool }: { onNavigate: (a: GridAction) => void; hasSchool: boolean }) {
  const { t } = useThemeLanguage();
  const { profile } = useRoleGuard();
  const { currentStreak, streakPercentage, MAX_STREAK, loading } = useStreak();
  const [hoverAsk, setHoverAsk] = useState(false);

  const firstName = profile?.full_name?.split(' ')[0] || t('Student', 'طالب');
  const tiles = TILES.filter((x) => !x.schoolOnly || hasSchool);

  return (
    <div className="h-full overflow-y-auto px-8 pb-24 pt-6">
      <div className="mx-auto max-w-[1400px]">
        <BriefingDock onNavigate={onNavigate as (a: string & {}) => void} />

        {/* Masthead */}
        <div className="relative mb-8 overflow-hidden rounded-[2rem] border border-foreground/12 bg-foreground/[0.025] backdrop-blur-2xl backdrop-saturate-150">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{ backgroundImage: 'repeating-linear-gradient(90deg, hsl(var(--foreground)) 0 1px, transparent 1px 26px)' }}
          />
          <span className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full border border-foreground/10" />
          <span className="pointer-events-none absolute -left-10 -top-32 h-96 w-96 rounded-full border border-foreground/5" />

          <div className="relative grid grid-cols-12 gap-8 px-10 py-10">
            <div className="col-span-7">
              <p className="text-[9px] uppercase tracking-[0.42em] text-muted-foreground">
                {t('One engine · many surfaces', 'محرك واحد · واجهات كثيرة')}
              </p>
              <h1 className="mt-4 font-display text-5xl font-extrabold leading-[0.95] tracking-tight text-foreground">
                {t('Hello, ', 'مرحباً، ')}
                <span className="text-muted-foreground">{firstName}</span>
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
                {t(
                  'Lumina keeps a model of how you think — what you missed, how long you hesitated, which explanation finally landed. Every tile below writes into that same model.',
                  'تحتفظ لومينا بنموذج لطريقة تفكيرك — ما أخطأت فيه، ومدة ترددك، والشرح الذي نجح أخيراً. كل بطاقة أدناه تكتب في هذا النموذج نفسه.',
                )}
              </p>

              <button
                onMouseEnter={() => setHoverAsk(true)}
                onMouseLeave={() => setHoverAsk(false)}
                onClick={() => onNavigate('studybuddy')}
                className="group relative mt-7 inline-flex items-center gap-3 overflow-hidden rounded-full border border-foreground/20 bg-foreground px-6 py-3 text-background transition-transform duration-300 hover:scale-[1.02] active:scale-[0.99]"
              >
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-background/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                <LuminaLogo size={18} className={cn('transition-transform duration-500', hoverAsk && 'rotate-90')} />
                <span className="relative font-display text-sm font-bold tracking-tight">
                  {t('Ask Lumina anything', 'اسأل لومينا أي شيء')}
                </span>
              </button>
            </div>

            {/* Streak dial */}
            <div className="col-span-5 flex items-center justify-end">
              <div className="relative h-52 w-52">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                  <circle cx="50" cy="50" r="44" fill="none" stroke="hsl(var(--border))" strokeWidth="0.6" />
                  <circle cx="50" cy="50" r="38" fill="none" stroke="hsl(var(--border))" strokeWidth="0.3" strokeDasharray="1 3" />
                  <circle
                    cx="50" cy="50" r="44" fill="none"
                    stroke="hsl(var(--foreground))" strokeWidth="1.6" strokeLinecap="round"
                    strokeDasharray={`${(streakPercentage / 100) * 276.5} 276.5`}
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <Flame size={16} className="text-muted-foreground" />
                  <span className="mt-1 font-display text-4xl font-extrabold tracking-tight">
                    {loading ? '—' : currentStreak}
                  </span>
                  <span className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
                    {t('day streak', 'يوم متتالي')}
                  </span>
                  <span className="mt-1 text-[9px] text-muted-foreground/70">/ {MAX_STREAK}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-12 gap-6">
          <div className="col-span-4">
            <CognitiveMirrorGauge />
          </div>
          <div className="col-span-8 relative overflow-hidden rounded-[1.4rem] border border-foreground/12 bg-foreground/[0.03] backdrop-blur-2xl backdrop-saturate-150 p-6">
            <div className="relative mb-4 h-px w-full overflow-hidden bg-border/60">
              <span className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-foreground/40 to-transparent animate-sheen" />
            </div>
            <p className="text-[9px] uppercase tracking-[0.34em] text-muted-foreground">
              {t('How to read this board', 'كيف تقرأ هذه اللوحة')}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {t(
                'The large tiles are where thinking happens — maps, subjects, plans. The small ones are quick passes: a card set, a timer, a graph. Nothing here is a separate app; they are angles on one tutor that has been watching your work since the first question you answered.',
                'البطاقات الكبيرة هي حيث يحدث التفكير — الخرائط والمواد والخطط. الصغيرة تمريرات سريعة: مجموعة بطاقات، مؤقت، رسم بياني. لا شيء هنا تطبيق منفصل؛ كلها زوايا لمعلّم واحد يراقب عملك منذ أول سؤال أجبت عنه.',
              )}
            </p>
          </div>
        </div>

        {/* Abstract bento */}
        <div className="grid auto-rows-[128px] grid-cols-6 gap-4">
          {tiles.map((tile, i) => (
            <TileButton key={tile.id} tile={tile} index={i} onNavigate={onNavigate} />
          ))}
        </div>
      </div>
    </div>
  );
}
