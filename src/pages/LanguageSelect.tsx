import { useState } from 'react';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { Sparkles, Globe, Zap, Feather } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type Step = 'language' | 'build';

export default function LanguageSelect() {
  const { setLanguage, setBuildMode, t, language } = useThemeLanguage();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('language');
  const [selectedLang, setSelectedLang] = useState<'en' | 'ar' | null>(null);

  const handleSelectLanguage = (lang: 'en' | 'ar') => {
    setSelectedLang(lang);
    setLanguage(lang);
    setStep('build');
  };

  const handleSelectBuild = (mode: 'new' | 'old') => {
    setBuildMode(mode);
    localStorage.setItem('language-selected', 'true');
    navigate('/auth');
  };

  const isArabic = selectedLang === 'ar' || language === 'ar';

  if (step === 'build') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <div className="w-full max-w-sm animate-fade-in">
          {/* Logo */}
          <div className="flex flex-col items-center mb-10">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-5 glow-effect">
              <Sparkles className="w-10 h-10 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-bold">
              <span className="gradient-text">Study Bright AI</span>
            </h1>
          </div>

          {/* Build Selection */}
          <div className="flex flex-col items-center mb-8">
            <Zap className="w-6 h-6 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm mb-1">
              {isArabic ? 'اختر إصدار التطبيق' : 'Choose app version'}
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => handleSelectBuild('new')}
              className="w-full glass-effect rounded-2xl p-5 text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] flex items-center gap-4 group"
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-primary to-accent text-primary-foreground">
                <Zap className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-lg text-foreground">
                  {isArabic ? 'الإصدار الجديد' : 'New Build'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {isArabic ? 'تجربة كاملة مع الرسوم المتحركة والتأثيرات' : 'Full experience with animations & effects'}
                </p>
              </div>
            </button>

            <button
              onClick={() => handleSelectBuild('old')}
              className="w-full glass-effect rounded-2xl p-5 text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] flex items-center gap-4 group"
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-secondary border border-border">
                <Feather className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-lg text-foreground">
                  {isArabic ? 'الإصدار القديم' : 'Old Build'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {isArabic ? 'نسخة خفيفة للأجهزة القديمة - بدون رسوم متحركة' : 'Lightweight for older devices — no animations'}
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-5 glow-effect">
            <Sparkles className="w-10 h-10 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold">
            <span className="gradient-text">Study Bright AI</span>
          </h1>
        </div>

        {/* Language Selection */}
        <div className="flex flex-col items-center mb-8">
          <Globe className="w-6 h-6 text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm mb-1">Choose your language</p>
          <p className="text-muted-foreground text-sm font-arabic">اختر لغتك</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => handleSelectLanguage('en')}
            className="w-full glass-effect rounded-2xl p-5 text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] flex items-center gap-4 group"
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-blue-500/15 border border-blue-500/30 text-2xl">
              🇺🇸
            </div>
            <div>
              <h3 className="font-bold text-lg text-foreground">English</h3>
              <p className="text-sm text-muted-foreground">Continue in English</p>
            </div>
          </button>

          <button
            onClick={() => handleSelectLanguage('ar')}
            className="w-full glass-effect rounded-2xl p-5 text-right transition-all duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] flex items-center gap-4 group flex-row-reverse"
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-emerald-500/15 border border-emerald-500/30 text-2xl">
              🇸🇦
            </div>
            <div>
              <h3 className="font-bold text-lg text-foreground font-arabic">العربية</h3>
              <p className="text-sm text-muted-foreground font-arabic">المتابعة بالعربية</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
