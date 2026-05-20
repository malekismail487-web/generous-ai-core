export type DiagramKind = 'flow' | 'cycle' | 'compare' | 'anatomy' | 'chart';

export interface DiagramNode { id: string; label: string }
export interface DiagramEdge { from: string; to: string; label?: string }
export interface DiagramSpec {
  kind: DiagramKind;
  caption: string;
  nodes: DiagramNode[];
  edges?: DiagramEdge[];
}

export interface Paragraph {
  heading: string;
  body: string;
  image_prompt: string;
  bullet_points: string[];
  diagram_spec?: DiagramSpec;
}

export interface Palette {
  primary: string;
  secondary: string;
  accent: string;
  surface: string;
}

export type Aesthetic =
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
  lesson_plan?: LessonPlan;
}

export type Mode = 'student' | 'teacher';
export type Expertise = 'basic' | 'intermediate' | 'advanced' | 'expert';

export interface ImageState { status: 'pending' | 'loading' | 'done' | 'failed'; url?: string }

export interface AestheticTheme {
  headingFont: string;
  bodyFont: string;
  fontFace: string;        // pptx safe family
  monoFont?: string;
  titleStyle: 'serif' | 'sans' | 'display';
  rule: 'thin' | 'block' | 'dotted' | 'double';
}

export const AESTHETIC_THEMES: Record<Aesthetic, AestheticTheme> = {
  scholarly_serif:     { headingFont: 'Source Serif 4, Georgia, serif',       bodyFont: 'Source Serif 4, Georgia, serif',       fontFace: 'Georgia',         titleStyle: 'serif',   rule: 'thin' },
  modern_minimal:      { headingFont: 'Inter, system-ui, sans-serif',         bodyFont: 'Inter, system-ui, sans-serif',         fontFace: 'Calibri',         titleStyle: 'sans',    rule: 'thin' },
  scientific_grid:     { headingFont: 'IBM Plex Sans, sans-serif',            bodyFont: 'IBM Plex Sans, sans-serif',            fontFace: 'Cambria',         titleStyle: 'sans',    rule: 'dotted' },
  humanist_warm:       { headingFont: 'Source Serif 4, Georgia, serif',       bodyFont: 'Inter, sans-serif',                    fontFace: 'Palatino',        titleStyle: 'serif',   rule: 'block' },
  editorial_magazine:  { headingFont: 'Playfair Display, Georgia, serif',     bodyFont: 'Inter, sans-serif',                    fontFace: 'Georgia',         titleStyle: 'display', rule: 'double' },
  technical_blueprint: { headingFont: 'JetBrains Mono, ui-monospace, monospace', bodyFont: 'Inter, sans-serif',                 fontFace: 'Consolas',        titleStyle: 'sans',    rule: 'dotted' },
  classical_textbook:  { headingFont: 'Source Serif 4, Georgia, serif',       bodyFont: 'Source Serif 4, Georgia, serif',       fontFace: 'Palatino',        titleStyle: 'serif',   rule: 'double' },
  vibrant_creative:    { headingFont: 'Inter, sans-serif',                    bodyFont: 'Inter, sans-serif',                    fontFace: 'Trebuchet MS',    titleStyle: 'display', rule: 'block' },
};

// Sanity-default palette used when AI omits it.
export const DEFAULT_PALETTE: Palette = {
  primary: '#1f2937',
  secondary: '#475569',
  accent: '#6366f1',
  surface: '#f8fafc',
};
