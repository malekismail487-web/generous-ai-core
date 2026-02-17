import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'dark' | 'light';
type Language = 'en' | 'ar';
type BuildMode = 'new' | 'old';

interface ThemeLanguageContextType {
  theme: Theme;
  language: Language;
  buildMode: BuildMode;
  isLiteMode: boolean;
  setTheme: (theme: Theme) => void;
  setLanguage: (language: Language) => void;
  setBuildMode: (mode: BuildMode) => void;
  t: (en: string, ar: string) => string;
}

const ThemeLanguageContext = createContext<ThemeLanguageContextType | undefined>(undefined);

export function ThemeLanguageProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('app-theme');
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });

  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('app-language');
    return (saved === 'en' || saved === 'ar') ? saved : 'en';
  });

  const [buildMode, setBuildModeState] = useState<BuildMode>(() => {
    const saved = localStorage.getItem('app-build-mode');
    return (saved === 'new' || saved === 'old') ? saved : 'new';
  });

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem('app-theme', t);
  };

  const setLanguage = (l: Language) => {
    setLanguageState(l);
    localStorage.setItem('app-language', l);
  };

  const setBuildMode = (mode: BuildMode) => {
    setBuildModeState(mode);
    localStorage.setItem('app-build-mode', mode);
  };

  const t = (en: string, ar: string) => language === 'ar' ? ar : en;

  const isLiteMode = buildMode === 'old';

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  // Add/remove lite-mode class for CSS-level animation disabling
  useEffect(() => {
    const root = document.documentElement;
    if (isLiteMode) {
      root.classList.add('lite-mode');
    } else {
      root.classList.remove('lite-mode');
    }
  }, [isLiteMode]);

  return (
    <ThemeLanguageContext.Provider value={{ theme, language, buildMode, isLiteMode, setTheme, setLanguage, setBuildMode, t }}>
      {children}
    </ThemeLanguageContext.Provider>
  );
}

export function useThemeLanguage() {
  const context = useContext(ThemeLanguageContext);
  if (!context) throw new Error('useThemeLanguage must be used within ThemeLanguageProvider');
  return context;
}
