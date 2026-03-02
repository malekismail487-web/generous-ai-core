import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { WallpaperPreset, getPresetById, getDefaultPreset, wallpaperPresets } from '@/lib/wallpaperPresets';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';

interface WallpaperContextType {
  wallpaper: WallpaperPreset;
  wallpaperId: string;
  setWallpaper: (id: string) => void;
  presets: WallpaperPreset[];
}

const WallpaperContext = createContext<WallpaperContextType | undefined>(undefined);

export function WallpaperProvider({ children }: { children: ReactNode }) {
  const { theme } = useThemeLanguage();

  const [wallpaperId, setWallpaperIdState] = useState<string>(() => {
    const saved = localStorage.getItem('app-wallpaper');
    if (saved && getPresetById(saved)) return saved;
    return theme === 'dark' ? 'midnight-ocean' : 'sunrise-sand';
  });

  const wallpaper = getPresetById(wallpaperId) ?? getDefaultPreset(theme);

  const setWallpaper = (id: string) => {
    setWallpaperIdState(id);
    localStorage.setItem('app-wallpaper', id);
  };

  // Apply background gradient as CSS variable
  useEffect(() => {
    document.documentElement.style.setProperty('--wallpaper-bg', wallpaper.bgGradient);
  }, [wallpaper]);

  return (
    <WallpaperContext.Provider value={{ wallpaper, wallpaperId, setWallpaper, presets: wallpaperPresets }}>
      {children}
    </WallpaperContext.Provider>
  );
}

export function useWallpaper() {
  const context = useContext(WallpaperContext);
  if (!context) throw new Error('useWallpaper must be used within WallpaperProvider');
  return context;
}
