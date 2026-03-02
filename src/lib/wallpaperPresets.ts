export interface WallpaperPreset {
  id: string;
  name: string;
  nameAr: string;
  category: 'dark' | 'light';
  /** CSS background value applied to the page */
  background: string;
  /** Preview swatch gradient for selector circles */
  preview: string;
}

export const wallpaperPresets: WallpaperPreset[] = [
  // ─── DARK THEMES ───
  {
    id: 'midnight-ocean',
    name: 'Midnight Ocean',
    nameAr: 'محيط منتصف الليل',
    category: 'dark',
    preview: 'linear-gradient(135deg, #0a1628, #1a2744)',
    background: 'radial-gradient(ellipse at 20% 50%, hsl(222 47% 8%) 0%, hsl(222 47% 6%) 100%)',
  },
  {
    id: 'neon-matrix',
    name: 'Neon Matrix',
    nameAr: 'مصفوفة نيون',
    category: 'dark',
    preview: 'linear-gradient(135deg, #0a1a0a, #0d2b0d)',
    background: 'radial-gradient(ellipse at 30% 70%, hsl(130 30% 6%) 0%, hsl(140 40% 3%) 100%)',
  },
  {
    id: 'cyber-purple',
    name: 'Cyber Purple',
    nameAr: 'بنفسجي سايبر',
    category: 'dark',
    preview: 'linear-gradient(135deg, #1a0a2e, #2d1b69)',
    background: 'radial-gradient(ellipse at 60% 40%, hsl(270 40% 8%) 0%, hsl(280 50% 4%) 100%)',
  },
  {
    id: 'deep-aurora',
    name: 'Deep Aurora',
    nameAr: 'شفق عميق',
    category: 'dark',
    preview: 'linear-gradient(135deg, #0a1a2e, #0d3b3b, #1a0a3d)',
    background: 'radial-gradient(ellipse at 40% 20%, hsl(180 25% 7%) 0%, hsl(260 35% 5%) 50%, hsl(200 30% 4%) 100%)',
  },
  {
    id: 'crimson-night',
    name: 'Crimson Night',
    nameAr: 'ليلة قرمزية',
    category: 'dark',
    preview: 'linear-gradient(135deg, #1a0a0a, #3b0d0d)',
    background: 'radial-gradient(ellipse at 70% 30%, hsl(0 30% 7%) 0%, hsl(350 40% 4%) 100%)',
  },
  {
    id: 'ocean-depth',
    name: 'Ocean Depth',
    nameAr: 'أعماق المحيط',
    category: 'dark',
    preview: 'linear-gradient(135deg, #0a0f28, #0d2744)',
    background: 'radial-gradient(ellipse at 50% 80%, hsl(210 40% 7%) 0%, hsl(220 50% 4%) 100%)',
  },
  {
    id: 'golden-ember',
    name: 'Golden Ember',
    nameAr: 'جمرة ذهبية',
    category: 'dark',
    preview: 'linear-gradient(135deg, #1a1208, #2e1f0a)',
    background: 'radial-gradient(ellipse at 30% 40%, hsl(35 30% 7%) 0%, hsl(25 40% 4%) 100%)',
  },
  {
    id: 'arctic-night',
    name: 'Arctic Night',
    nameAr: 'ليلة قطبية',
    category: 'dark',
    preview: 'linear-gradient(135deg, #0f1a24, #1a2e3d)',
    background: 'radial-gradient(ellipse at 50% 20%, hsl(200 30% 8%) 0%, hsl(210 40% 5%) 100%)',
  },

  // ─── LIGHT THEMES ───
  {
    id: 'sunrise-sand',
    name: 'Sunrise Sand',
    nameAr: 'رمال الشروق',
    category: 'light',
    preview: 'linear-gradient(135deg, #fef7ed, #fde8d0)',
    background: 'radial-gradient(ellipse at 50% 50%, hsl(30 30% 97%) 0%, hsl(25 20% 94%) 100%)',
  },
  {
    id: 'lavender-mist',
    name: 'Lavender Mist',
    nameAr: 'ضباب اللافندر',
    category: 'light',
    preview: 'linear-gradient(135deg, #e8d5f5, #d0b8e8)',
    background: 'radial-gradient(ellipse at 40% 30%, hsl(270 25% 95%) 0%, hsl(280 20% 92%) 100%)',
  },
  {
    id: 'mint-breeze',
    name: 'Mint Breeze',
    nameAr: 'نسيم النعناع',
    category: 'light',
    preview: 'linear-gradient(135deg, #c8f0dc, #a8e6c8)',
    background: 'radial-gradient(ellipse at 60% 60%, hsl(150 25% 95%) 0%, hsl(160 20% 92%) 100%)',
  },
  {
    id: 'rose-quartz',
    name: 'Rose Quartz',
    nameAr: 'كوارتز وردي',
    category: 'light',
    preview: 'linear-gradient(135deg, #f5d0d0, #e8b0b0)',
    background: 'radial-gradient(ellipse at 70% 40%, hsl(350 30% 95%) 0%, hsl(340 25% 92%) 100%)',
  },
  {
    id: 'sky-cotton',
    name: 'Sky Cotton',
    nameAr: 'قطن السماء',
    category: 'light',
    preview: 'linear-gradient(135deg, #c8ddf5, #a8c8e8)',
    background: 'radial-gradient(ellipse at 30% 50%, hsl(210 30% 95%) 0%, hsl(200 25% 92%) 100%)',
  },
  {
    id: 'honey-glow',
    name: 'Honey Glow',
    nameAr: 'توهج العسل',
    category: 'light',
    preview: 'linear-gradient(135deg, #f5e8c0, #e8d8a0)',
    background: 'radial-gradient(ellipse at 50% 70%, hsl(40 30% 95%) 0%, hsl(35 25% 92%) 100%)',
  },
];

export function getPresetById(id: string): WallpaperPreset | undefined {
  return wallpaperPresets.find(p => p.id === id);
}

export function getDefaultPreset(theme: 'dark' | 'light'): WallpaperPreset {
  return theme === 'dark'
    ? wallpaperPresets.find(p => p.id === 'midnight-ocean')!
    : wallpaperPresets.find(p => p.id === 'sunrise-sand')!;
}
