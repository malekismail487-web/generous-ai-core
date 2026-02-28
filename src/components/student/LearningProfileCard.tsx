import { useEffect } from 'react';
import { useLearningStyle } from '@/hooks/useLearningStyle';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { Brain, Sparkles, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const styleColors: Record<string, string> = {
  visual: 'from-pink-500 to-rose-500',
  logical: 'from-blue-500 to-indigo-500',
  verbal: 'from-amber-500 to-orange-500',
  kinesthetic: 'from-emerald-500 to-green-500',
  conceptual: 'from-violet-500 to-purple-500',
  balanced: 'from-slate-400 to-gray-500',
};

const styleEmojis: Record<string, string> = {
  visual: '🎨',
  logical: '🧠',
  verbal: '💬',
  kinesthetic: '🖐️',
  conceptual: '💡',
  balanced: '⚖️',
};

export function LearningProfileCard() {
  const { profile, loading, recalculate } = useLearningStyle();
  const { t } = useThemeLanguage();

  useEffect(() => {
    if (!loading && !profile) {
      recalculate();
    }
  }, [loading, profile, recalculate]);

  if (loading || !profile) {
    return (
      <div className="glass-effect rounded-2xl p-5 space-y-3 animate-fade-in">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-slate-400 to-gray-500 text-white">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">{t('Learning Profile', 'ملف التعلم')}</h3>
            <p className="text-xs text-muted-foreground">
              {t('Keep using the app to build your profile...', 'استمر في استخدام التطبيق لبناء ملفك...')}
            </p>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t('Lumina needs at least 20 interactions to identify your learning patterns.', 'تحتاج لومينا إلى 20 تفاعل على الأقل لتحديد أنماط تعلمك.')}
        </p>
      </div>
    );
  }

  const bars = [
    { label: t('Visual', 'بصري'), score: profile.visual_score, key: 'visual' },
    { label: t('Logical', 'منطقي'), score: profile.logical_score, key: 'logical' },
    { label: t('Verbal', 'لفظي'), score: profile.verbal_score, key: 'verbal' },
    { label: t('Kinesthetic', 'حركي'), score: profile.kinesthetic_score, key: 'kinesthetic' },
    { label: t('Conceptual', 'مفاهيمي'), score: profile.conceptual_score, key: 'conceptual' },
  ];

  const dominant = profile.dominant_style;

  return (
    <div className="glass-effect rounded-2xl p-5 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br text-white",
            styleColors[dominant] || styleColors.balanced
          )}>
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">{t('Learning Profile', 'ملف التعلم')}</h3>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <span>{styleEmojis[dominant]}</span>
              <span className="capitalize">{dominant}</span>
              {t(' Learner', ' متعلم')}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={recalculate}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Confidence indicator */}
      <div className="flex items-center gap-2 text-[11px]">
        <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">{t('Confidence', 'الثقة')}:</span>
        <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-700"
            style={{ width: `${profile.confidence}%` }}
          />
        </div>
        <span className="font-medium">{profile.confidence}%</span>
      </div>

      <div className="space-y-2.5">
        {bars.map(bar => (
          <div key={bar.key} className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">{bar.label}</span>
              <span className="font-medium">{bar.score}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700 bg-gradient-to-r",
                  styleColors[bar.key]
                )}
                style={{ width: `${bar.score}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-2 bg-primary/5 rounded-xl p-3">
        <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <p className="text-[11px] text-muted-foreground">
          {dominant === 'visual' && t('You learn best through images, diagrams, and visual content.', 'تتعلم بشكل أفضل من خلال الصور والمخططات.')}
          {dominant === 'logical' && t('You excel with step-by-step reasoning and structured logic.', 'تتفوق في التفكير المنطقي والمنظم.')}
          {dominant === 'verbal' && t('You thrive with discussions, audio content, and explanations.', 'تتعلم من خلال المناقشات والمحتوى الصوتي.')}
          {dominant === 'kinesthetic' && t('You learn by doing — hands-on practice works best for you.', 'تتعلم بالممارسة العملية.')}
          {dominant === 'conceptual' && t('You grasp ideas by understanding the big picture first.', 'تفهم الأفكار من خلال الصورة الكبيرة أولاً.')}
          {dominant === 'balanced' && t('You have a well-rounded learning style. Keep exploring!', 'لديك أسلوب تعلم متوازن.')}
        </p>
      </div>

      <p className="text-[10px] text-muted-foreground text-center">
        {t(`Based on ${profile.total_interactions} behavioral signals`, `بناءً على ${profile.total_interactions} إشارة سلوكية`)}
      </p>
    </div>
  );
}
