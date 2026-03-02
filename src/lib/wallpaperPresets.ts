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
    preview: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
    background: 'linear-gradient(135deg, hsl(195 40% 10%) 0%, hsl(200 30% 18%) 50%, hsl(200 25% 25%) 100%)',
  },
  {
    id: 'neon-matrix',
    name: 'Neon Matrix',
    nameAr: 'مصفوفة نيون',
    category: 'dark',
    preview: 'linear-gradient(135deg, #0a2a1b, #0d3b2a, #114a30)',
    background: 'linear-gradient(160deg, hsl(150 40% 8%) 0%, hsl(155 45% 15%) 50%, hsl(140 35% 20%) 100%)',
  },
  {
    id: 'cyber-purple',
    name: 'Cyber Purple',
    nameAr: 'بنفسجي سايبر',
    category: 'dark',
    preview: 'linear-gradient(135deg, #1a0533, #2d1b69, #4a1a8a)',
    background: 'linear-gradient(135deg, hsl(270 50% 12%) 0%, hsl(265 55% 22%) 50%, hsl(275 45% 30%) 100%)',
  },
  {
    id: 'deep-aurora',
    name: 'Deep Aurora',
    nameAr: 'شفق عميق',
    category: 'dark',
    preview: 'linear-gradient(135deg, #0a2e3d, #1a4a3d, #2a1a5d)',
    background: 'linear-gradient(135deg, hsl(195 50% 14%) 0%, hsl(160 40% 20%) 40%, hsl(270 45% 22%) 100%)',
  },
  {
    id: 'crimson-night',
    name: 'Crimson Night',
    nameAr: 'ليلة قرمزية',
    category: 'dark',
    preview: 'linear-gradient(135deg, #2a0a0a, #5c1a1a, #8b2020)',
    background: 'linear-gradient(145deg, hsl(0 40% 10%) 0%, hsl(355 50% 18%) 50%, hsl(350 45% 26%) 100%)',
  },
  {
    id: 'ocean-depth',
    name: 'Ocean Depth',
    nameAr: 'أعماق المحيط',
    category: 'dark',
    preview: 'linear-gradient(135deg, #0a1a3d, #1a3060, #2a4580)',
    background: 'linear-gradient(170deg, hsl(220 55% 12%) 0%, hsl(215 50% 20%) 50%, hsl(210 45% 28%) 100%)',
  },
  {
    id: 'golden-ember',
    name: 'Golden Ember',
    nameAr: 'جمرة ذهبية',
    category: 'dark',
    preview: 'linear-gradient(135deg, #2a1a08, #4a3010, #6b4520)',
    background: 'linear-gradient(135deg, hsl(30 55% 10%) 0%, hsl(35 50% 18%) 50%, hsl(32 45% 26%) 100%)',
  },
  {
    id: 'arctic-night',
    name: 'Arctic Night',
    nameAr: 'ليلة قطبية',
    category: 'dark',
    preview: 'linear-gradient(135deg, #1a2a3a, #2a4050, #3a5565)',
    background: 'linear-gradient(150deg, hsl(205 35% 14%) 0%, hsl(200 30% 22%) 50%, hsl(195 28% 28%) 100%)',
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
