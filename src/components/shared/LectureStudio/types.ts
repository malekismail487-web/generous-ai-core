export type DiagramKind = 'flow' | 'cycle' | 'compare' | 'anatomy' | 'chart';

export interface DiagramNode { id: string; label: string }
export interface DiagramEdge { from: string; to: string; label?: string }
export interface DiagramSpec {
  kind: DiagramKind;
  caption: string;
  nodes: DiagramNode[];
  edges?: DiagramEdge[];
}

/** Camera frame for the recurring hero subject on a given slide.
 *  All values are normalized 0..1 against the slide canvas (16:9). */
export interface HeroMotion {
  /** center X of the hero (0=left, 1=right) */
  x: number;
  /** center Y of the hero (0=top, 1=bottom) */
  y: number;
  /** size of the hero relative to slide height (0.2..1.6) */
  scale: number;
  /** clockwise degrees */
  rotate: number;
  /** opacity 0..1 (used for chapter dividers) */
  opacity?: number;
}

export type SlideLayout =
  | 'cover'
  | 'chapter'
  | 'ring_portrait'
  | 'quadrant'
  | 'half_bleed_left'
  | 'half_bleed_right'
  | 'stat_callout'
  | 'iso_cube'         // dedicated 3-D object slide
  | 'takeaways';

export interface Paragraph {
  heading: string;
  body: string;
  image_prompt: string;
  bullet_points: string[];
  diagram_spec?: DiagramSpec;
  slide_layout?: SlideLayout;
  hero_motion?: HeroMotion;
  /** Optional 2-3 word concept keyword used by quadrant/stat layouts */
  concept_keyword?: string;
}

export interface Palette {
  primary: string;
  secondary: string;
  accent: string;
  surface: string;
}

export type Aesthetic =
  | 'cinematic_editorial'
  | 'scholarly_serif'
  | 'modern_minimal'
  | 'scientific_grid'
  | 'humanist_warm'
  | 'editorial_magazine'
  | 'technical_blueprint'
  | 'classical_textbook'
  | 'vibrant_creative';

export type SlideTransition =
  | 'morph' | 'fade' | 'push' | 'wipe' | 'split'
  | 'reveal' | 'cover' | 'uncover' | 'cut';

export interface LessonPlan {
  objectives: string[];
  prerequisites: string[];
  materials: string[];
  warmup: string;
  guided_practice: string;
  independent_practice: string;
  closure: string;
  differentiation: { struggling: string; on_level: string; advanced: string };
  assessment: string;
  homework: string;
  teacher_notes: string;
}

export interface Outline {
  title: string;
  intro: string;
  paragraphs: Paragraph[];
  conclusion: string;
  key_takeaways: string[];
  aesthetic: Aesthetic;
  palette: Palette;
  transition: SlideTransition;
  /** Recurring transparent-cutout subject prompt that anchors the deck. */
  hero_subject_prompt?: string;
  /** Short label for the hero (e.g. "Apollo Belvedere") shown in chapter cards. */
  hero_subject_label?: string;
  /** Theme one-liner Lumina decided after reading its own draft. */
  theme_tagline?: string;
  lesson_plan?: LessonPlan;
}

export type Mode = 'student' | 'teacher';
export type Expertise = 'basic' | 'intermediate' | 'advanced' | 'expert';

export interface ImageState { status: 'pending' | 'loading' | 'done' | 'failed'; url?: string }

export interface AestheticTheme {
  headingFont: string;
  bodyFont: string;
  fontFace: string;        // pptx safe family for headings
  bodyFontFace: string;    // pptx safe family for body
  monoFont?: string;
  titleStyle: 'serif' | 'sans' | 'display';
  rule: 'thin' | 'block' | 'dotted' | 'double';
  /** Master background hex (without #). */
  bgHex: string;
  /** Text color on background (without #). */
  fgHex: string;
  /** Subtle vignette intensity 0..1. */
  vignette: number;
}

export const AESTHETIC_THEMES: Record<Aesthetic, AestheticTheme> = {
  cinematic_editorial: { headingFont: '"Cormorant Garamond", Georgia, serif', bodyFont: 'Inter, sans-serif',                    fontFace: 'Cormorant Garamond', bodyFontFace: 'Calibri',  titleStyle: 'serif',   rule: 'thin',   bgHex: '000000', fgHex: 'F5F1E8', vignette: 0.55 },
  scholarly_serif:     { headingFont: 'Source Serif 4, Georgia, serif',       bodyFont: 'Source Serif 4, Georgia, serif',       fontFace: 'Georgia',         bodyFontFace: 'Georgia',   titleStyle: 'serif',   rule: 'thin',   bgHex: 'FAF8F3', fgHex: '1A1A1A', vignette: 0   },
  modern_minimal:      { headingFont: 'Inter, system-ui, sans-serif',         bodyFont: 'Inter, system-ui, sans-serif',         fontFace: 'Calibri',         bodyFontFace: 'Calibri',   titleStyle: 'sans',    rule: 'thin',   bgHex: 'FFFFFF', fgHex: '111111', vignette: 0   },
  scientific_grid:     { headingFont: 'IBM Plex Sans, sans-serif',            bodyFont: 'IBM Plex Sans, sans-serif',            fontFace: 'Cambria',         bodyFontFace: 'Calibri',   titleStyle: 'sans',    rule: 'dotted', bgHex: 'F5F7FA', fgHex: '0B1F3A', vignette: 0   },
  humanist_warm:       { headingFont: 'Source Serif 4, Georgia, serif',       bodyFont: 'Inter, sans-serif',                    fontFace: 'Palatino',        bodyFontFace: 'Calibri',   titleStyle: 'serif',   rule: 'block',  bgHex: 'FAF4EA', fgHex: '2B1D10', vignette: 0   },
  editorial_magazine:  { headingFont: 'Playfair Display, Georgia, serif',     bodyFont: 'Inter, sans-serif',                    fontFace: 'Georgia',         bodyFontFace: 'Calibri',   titleStyle: 'display', rule: 'double', bgHex: 'F5F2EC', fgHex: '0A0A0A', vignette: 0   },
  technical_blueprint: { headingFont: 'JetBrains Mono, ui-monospace, monospace', bodyFont: 'Inter, sans-serif',                 fontFace: 'Consolas',        bodyFontFace: 'Calibri',   titleStyle: 'sans',    rule: 'dotted', bgHex: '0C1A2B', fgHex: 'D7E3F0', vignette: 0.3 },
  classical_textbook:  { headingFont: 'Source Serif 4, Georgia, serif',       bodyFont: 'Source Serif 4, Georgia, serif',       fontFace: 'Palatino',        bodyFontFace: 'Georgia',   titleStyle: 'serif',   rule: 'double', bgHex: 'FBF6EC', fgHex: '1B1208', vignette: 0   },
  vibrant_creative:    { headingFont: 'Inter, sans-serif',                    bodyFont: 'Inter, sans-serif',                    fontFace: 'Trebuchet MS',    bodyFontFace: 'Calibri',   titleStyle: 'display', rule: 'block',  bgHex: '111118', fgHex: 'FFFFFF', vignette: 0.2 },
};

export const DEFAULT_PALETTE: Palette = {
  primary: '#1f2937',
  secondary: '#475569',
  accent: '#6366f1',
  surface: '#f8fafc',
};
