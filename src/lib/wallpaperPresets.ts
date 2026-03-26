export interface WallpaperPreset {
  id: string;
  name: string;
  nameAr: string;
  category: 'dark' | 'light';
  /** HSL values (without hsl() wrapper) to set as --background, e.g. "270 50% 12%" */
  backgroundHSL: string;
  /** Preview swatch color for selector circles */
  preview: string;
  /** Whether this is the default preset for its category */
  isDefault?: boolean;
}

export const wallpaperPresets: WallpaperPreset[] = [
  // ─── DARK THEMES ───
  {
    id: 'default-dark',
    name: 'Charcoal',
    nameAr: 'فحمي',
    category: 'dark',
    backgroundHSL: '0 0% 10%',
    preview: '#1a1a1a',
    isDefault: true,
  },
  {
    id: 'midnight-ocean',
    name: 'Midnight Ocean',
    nameAr: 'محيط منتصف الليل',
    category: 'dark',
    backgroundHSL: '200 35% 18%',
    preview: '#1e3a4a',
  },
  {
    id: 'neon-matrix',
    name: 'Neon Matrix',
    nameAr: 'مصفوفة نيون',
    category: 'dark',
    backgroundHSL: '150 40% 14%',
    preview: '#153d2b',
  },
  {
    id: 'cyber-purple',
    name: 'Cyber Purple',
    nameAr: 'بنفسجي سايبر',
    category: 'dark',
    backgroundHSL: '270 45% 18%',
    preview: '#2e1a54',
  },
  {
    id: 'deep-aurora',
    name: 'Deep Aurora',
    nameAr: 'شفق عميق',
    category: 'dark',
    backgroundHSL: '180 35% 16%',
    preview: '#1a3d3d',
  },
  {
    id: 'crimson-night',
    name: 'Crimson Night',
    nameAr: 'ليلة قرمزية',
    category: 'dark',
    backgroundHSL: '350 45% 18%',
    preview: '#4a1a24',
  },
  {
    id: 'ocean-depth',
    name: 'Ocean Depth',
    nameAr: 'أعماق المحيط',
    category: 'dark',
    backgroundHSL: '215 50% 20%',
    preview: '#1a3060',
  },
  {
    id: 'golden-ember',
    name: 'Golden Ember',
    nameAr: 'جمرة ذهبية',
    category: 'dark',
    backgroundHSL: '35 45% 16%',
    preview: '#3b2e12',
  },
  {
    id: 'arctic-night',
    name: 'Arctic Night',
    nameAr: 'ليلة قطبية',
    category: 'dark',
    backgroundHSL: '200 30% 22%',
    preview: '#2a4050',
  },

  // ─── LIGHT THEMES ───
  {
    id: 'default-light',
    name: 'Clean White',
    nameAr: 'أبيض نقي',
    category: 'light',
    backgroundHSL: '0 0% 96%',
    preview: '#f5f5f5',
    isDefault: true,
  },
  {
    id: 'sunrise-sand',
    name: 'Sunrise Sand',
    nameAr: 'رمال الشروق',
    category: 'light',
    backgroundHSL: '30 40% 92%',
    preview: '#f0e0c8',
  },
  {
    id: 'lavender-mist',
    name: 'Lavender Mist',
    nameAr: 'ضباب اللافندر',
    category: 'light',
    backgroundHSL: '270 30% 92%',
    preview: '#e0d0f0',
  },
  {
    id: 'mint-breeze',
    name: 'Mint Breeze',
    nameAr: 'نسيم النعناع',
    category: 'light',
    backgroundHSL: '155 30% 91%',
    preview: '#c8f0dc',
  },
  {
    id: 'rose-quartz',
    name: 'Rose Quartz',
    nameAr: 'كوارتز وردي',
    category: 'light',
    backgroundHSL: '345 35% 92%',
    preview: '#f0d0d8',
  },
  {
    id: 'sky-cotton',
    name: 'Sky Cotton',
    nameAr: 'قطن السماء',
    category: 'light',
    backgroundHSL: '210 35% 92%',
    preview: '#c8d8f0',
  },
  {
    id: 'honey-glow',
    name: 'Honey Glow',
    nameAr: 'توهج العسل',
    category: 'light',
    backgroundHSL: '42 40% 90%',
    preview: '#f0e0b8',
  },
];

export function getPresetById(id: string): WallpaperPreset | undefined {
  return wallpaperPresets.find(p => p.id === id);
}

export function getDefaultPreset(theme: 'dark' | 'light'): WallpaperPreset {
  return wallpaperPresets.find(p => p.category === theme && p.isDefault)!;
}
