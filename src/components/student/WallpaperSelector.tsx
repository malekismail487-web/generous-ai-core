import { useWallpaper } from '@/hooks/useWallpaper';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { WallpaperPreset } from '@/lib/wallpaperPresets';
import { Check, Sparkles } from 'lucide-react';
import { tr } from '@/lib/translations';

export function WallpaperSelector() {
  const { wallpaperId, setWallpaper, presets } = useWallpaper();
  const { theme, language } = useThemeLanguage();
  const tl = (key: Parameters<typeof tr>[0]) => tr(key, language);

  const darkPresets = presets.filter(p => p.category === 'dark');
  const lightPresets = presets.filter(p => p.category === 'light');

  const currentCategoryPresets = theme === 'dark' ? darkPresets : lightPresets;
  const otherCategoryPresets = theme === 'dark' ? lightPresets : darkPresets;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-lg">
          {language === 'ar' ? 'خلفيات' : 'Wallpapers'}
        </h3>
      </div>

      {/* Current theme presets */}
      <div>
        <p className="text-sm text-muted-foreground mb-3">
          {theme === 'dark'
            ? (language === 'ar' ? 'سمات داكنة' : 'Dark Themes')
            : (language === 'ar' ? 'سمات فاتحة' : 'Light Themes')
          }
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {currentCategoryPresets.map((preset) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              isActive={wallpaperId === preset.id}
              onSelect={() => setWallpaper(preset.id)}
              language={language}
            />
          ))}
        </div>
      </div>

      {/* Other theme presets (dimmed) */}
      <div>
        <p className="text-sm text-muted-foreground mb-3">
          {theme === 'dark'
            ? (language === 'ar' ? 'سمات فاتحة (تبديل الوضع للاستخدام)' : 'Light Themes (switch mode to use)')
            : (language === 'ar' ? 'سمات داكنة (تبديل الوضع للاستخدام)' : 'Dark Themes (switch mode to use)')
          }
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 opacity-50">
          {otherCategoryPresets.map((preset) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              isActive={false}
              onSelect={() => {}}
              language={language}
              disabled
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function PresetCard({
  preset,
  isActive,
  onSelect,
  language,
  disabled = false,
}: {
  preset: WallpaperPreset;
  isActive: boolean;
  onSelect: () => void;
  language: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={`relative group rounded-xl overflow-hidden aspect-[4/3] border-2 transition-all duration-200 ${
        isActive
          ? 'border-primary ring-2 ring-primary/30 scale-[1.02]'
          : 'border-border/50 hover:border-primary/50 hover:scale-[1.01]'
      } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {/* Preview gradient */}
      <div
        className="absolute inset-0"
        style={{ background: preset.preview }}
      />

      {/* Decorative particles */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full animate-pulse"
            style={{
              width: `${6 + i * 3}px`,
              height: `${6 + i * 3}px`,
              left: `${15 + i * 14}%`,
              top: `${20 + (i % 3) * 25}%`,
              background: i % 2 === 0
                ? `hsl(${preset.primaryH} ${preset.primaryS}% ${preset.primaryL}%)`
                : `hsl(${preset.accentH} ${preset.accentS}% ${preset.accentL}%)`,
              opacity: 0.5,
              animationDelay: `${i * 0.3}s`,
            }}
          />
        ))}
      </div>

      {/* Active check */}
      {isActive && (
        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
          <Check className="w-3.5 h-3.5 text-primary-foreground" />
        </div>
      )}

      {/* Name label */}
      <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
        <p className="text-white text-xs font-medium truncate">
          {language === 'ar' ? preset.nameAr : preset.name}
        </p>
      </div>
    </button>
  );
}
