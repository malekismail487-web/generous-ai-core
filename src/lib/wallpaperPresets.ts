export interface WallpaperPreset {
  id: string;
  name: string;
  nameAr: string;
  category: 'dark' | 'light';
  /** Preview gradient for the selector card */
  preview: string;
  /** Particle primary color HSL */
  primaryH: number;
  primaryS: number;
  primaryL: number;
  /** Particle accent color HSL */
  accentH: number;
  accentS: number;
  accentL: number;
  /** Background gradient (applied as CSS) */
  bgGradient: string;
  /** Particle shape bias: which shapes appear more */
  shapeBias?: ('circle' | 'ring' | 'square')[];
  /** Line connection color override */
  lineAlpha?: number;
  /** Max particle opacity */
  maxOpacity?: number;
}

export const wallpaperPresets: WallpaperPreset[] = [
  // ─── DARK THEMES ───
  {
    id: 'midnight-ocean',
    name: 'Midnight Ocean',
    nameAr: 'محيط منتصف الليل',
    category: 'dark',
    preview: 'linear-gradient(135deg, #0a1628, #1a2744, #0d2137)',
    primaryH: 38, primaryS: 95, primaryL: 60,
    accentH: 175, accentS: 70, accentL: 45,
    bgGradient: 'radial-gradient(ellipse at 20% 50%, hsl(220 40% 8%) 0%, hsl(220 50% 4%) 100%)',
  },
  {
    id: 'neon-matrix',
    name: 'Neon Matrix',
    nameAr: 'مصفوفة نيون',
    category: 'dark',
    preview: 'linear-gradient(135deg, #0a0f0a, #0d2b0d, #001a00)',
    primaryH: 120, primaryS: 90, primaryL: 50,
    accentH: 150, accentS: 80, accentL: 40,
    bgGradient: 'radial-gradient(ellipse at 30% 70%, hsl(130 30% 6%) 0%, hsl(140 40% 3%) 100%)',
    maxOpacity: 0.12,
  },
  {
    id: 'cyber-purple',
    name: 'Cyber Purple',
    nameAr: 'بنفسجي سايبر',
    category: 'dark',
    preview: 'linear-gradient(135deg, #1a0a2e, #2d1b69, #16082a)',
    primaryH: 270, primaryS: 85, primaryL: 55,
    accentH: 300, accentS: 70, accentL: 50,
    bgGradient: 'radial-gradient(ellipse at 60% 40%, hsl(270 40% 8%) 0%, hsl(280 50% 4%) 100%)',
  },
  {
    id: 'deep-aurora',
    name: 'Deep Aurora',
    nameAr: 'شفق عميق',
    category: 'dark',
    preview: 'linear-gradient(135deg, #0a1a2e, #0d3b3b, #1a0a3d)',
    primaryH: 160, primaryS: 75, primaryL: 50,
    accentH: 280, accentS: 60, accentL: 55,
    bgGradient: 'radial-gradient(ellipse at 40% 60%, hsl(180 30% 6%) 0%, hsl(260 40% 4%) 100%)',
    lineAlpha: 0.06,
  },
  {
    id: 'crimson-night',
    name: 'Crimson Night',
    nameAr: 'ليلة قرمزية',
    category: 'dark',
    preview: 'linear-gradient(135deg, #1a0a0a, #3b0d0d, #2a0a1a)',
    primaryH: 0, primaryS: 85, primaryL: 50,
    accentH: 30, accentS: 90, accentL: 55,
    bgGradient: 'radial-gradient(ellipse at 70% 30%, hsl(0 30% 7%) 0%, hsl(350 40% 3%) 100%)',
  },
  {
    id: 'ocean-depth',
    name: 'Ocean Depth',
    nameAr: 'أعماق المحيط',
    category: 'dark',
    preview: 'linear-gradient(135deg, #0a0f28, #0d2744, #081e3a)',
    primaryH: 200, primaryS: 80, primaryL: 55,
    accentH: 180, accentS: 70, accentL: 45,
    bgGradient: 'radial-gradient(ellipse at 50% 80%, hsl(210 40% 7%) 0%, hsl(220 50% 3%) 100%)',
    shapeBias: ['circle', 'ring'],
  },
  {
    id: 'golden-ember',
    name: 'Golden Ember',
    nameAr: 'جمرة ذهبية',
    category: 'dark',
    preview: 'linear-gradient(135deg, #1a1208, #2e1f0a, #1a0f05)',
    primaryH: 40, primaryS: 90, primaryL: 55,
    accentH: 20, accentS: 85, accentL: 45,
    bgGradient: 'radial-gradient(ellipse at 30% 40%, hsl(35 30% 7%) 0%, hsl(25 40% 3%) 100%)',
    maxOpacity: 0.1,
  },
  {
    id: 'arctic-night',
    name: 'Arctic Night',
    nameAr: 'ليلة قطبية',
    category: 'dark',
    preview: 'linear-gradient(135deg, #0f1a24, #1a2e3d, #0a1520)',
    primaryH: 195, primaryS: 60, primaryL: 70,
    accentH: 210, accentS: 50, accentL: 80,
    bgGradient: 'radial-gradient(ellipse at 50% 20%, hsl(200 30% 8%) 0%, hsl(210 40% 4%) 100%)',
    maxOpacity: 0.08,
    shapeBias: ['ring', 'circle'],
  },

  // ─── LIGHT THEMES ───
  {
    id: 'sunrise-sand',
    name: 'Sunrise Sand',
    nameAr: 'رمال الشروق',
    category: 'light',
    preview: 'linear-gradient(135deg, #fef7ed, #fde8d0, #fdf2e4)',
    primaryH: 15, primaryS: 85, primaryL: 55,
    accentH: 175, accentS: 60, accentL: 38,
    bgGradient: 'radial-gradient(ellipse at 50% 50%, hsl(30 30% 97%) 0%, hsl(25 20% 94%) 100%)',
  },
  {
    id: 'lavender-mist',
    name: 'Lavender Mist',
    nameAr: 'ضباب اللافندر',
    category: 'light',
    preview: 'linear-gradient(135deg, #f3eef8, #e8dff0, #ede5f5)',
    primaryH: 270, primaryS: 50, primaryL: 60,
    accentH: 320, accentS: 40, accentL: 55,
    bgGradient: 'radial-gradient(ellipse at 40% 30%, hsl(270 20% 96%) 0%, hsl(280 15% 93%) 100%)',
  },
  {
    id: 'mint-breeze',
    name: 'Mint Breeze',
    nameAr: 'نسيم النعناع',
    category: 'light',
    preview: 'linear-gradient(135deg, #edf7f3, #d4f0e4, #e5f5ee)',
    primaryH: 150, primaryS: 60, primaryL: 45,
    accentH: 180, accentS: 50, accentL: 40,
    bgGradient: 'radial-gradient(ellipse at 60% 60%, hsl(150 20% 96%) 0%, hsl(160 15% 93%) 100%)',
  },
  {
    id: 'rose-quartz',
    name: 'Rose Quartz',
    nameAr: 'كوارتز وردي',
    category: 'light',
    preview: 'linear-gradient(135deg, #fdf0f0, #f5dede, #fae8e8)',
    primaryH: 350, primaryS: 60, primaryL: 60,
    accentH: 30, accentS: 70, accentL: 55,
    bgGradient: 'radial-gradient(ellipse at 70% 40%, hsl(350 25% 96%) 0%, hsl(340 20% 93%) 100%)',
  },
  {
    id: 'sky-cotton',
    name: 'Sky Cotton',
    nameAr: 'قطن السماء',
    category: 'light',
    preview: 'linear-gradient(135deg, #edf4fc, #d6e8f7, #e4eff9)',
    primaryH: 210, primaryS: 60, primaryL: 55,
    accentH: 190, accentS: 50, accentL: 45,
    bgGradient: 'radial-gradient(ellipse at 30% 50%, hsl(210 25% 96%) 0%, hsl(200 20% 93%) 100%)',
  },
  {
    id: 'honey-glow',
    name: 'Honey Glow',
    nameAr: 'توهج العسل',
    category: 'light',
    preview: 'linear-gradient(135deg, #fef9ed, #fcefd0, #fdf5e0)',
    primaryH: 40, primaryS: 80, primaryL: 50,
    accentH: 25, accentS: 70, accentL: 45,
    bgGradient: 'radial-gradient(ellipse at 50% 70%, hsl(40 25% 96%) 0%, hsl(35 20% 93%) 100%)',
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
