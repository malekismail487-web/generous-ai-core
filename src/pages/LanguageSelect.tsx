import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { Sparkles, Globe } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function LanguageSelect() {
  const { setLanguage } = useThemeLanguage();
  const navigate = useNavigate();

  const handleSelect = (lang: 'en' | 'ar') => {
    setLanguage(lang);
    localStorage.setItem('language-selected', 'true');
    navigate('/auth');
  };

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
            onClick={() => handleSelect('en')}
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
            onClick={() => handleSelect('ar')}
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
