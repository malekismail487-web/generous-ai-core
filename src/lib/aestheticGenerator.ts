/**
 * PHASE 1: Aesthetic Generation Engine
 * 
 * Lumina intelligently analyzes lecture content (subject, topic, grade level)
 * and generates a coherent visual identity including:
 * - Aesthetic style (cinematic, scholarly, modern, etc.)
 * - Color palette (primary, secondary, accent, surface)
 * - Slide transition type (morph, fade, etc.)
 * - Hero subject prompt (recurring visual anchor)
 * - Theme tagline
 * 
 * This ensures every lecture has a unique, meaningful visual language tied to its content.
 */

import type { Aesthetic, Palette, SlideTransition } from '@/components/shared/LectureStudio/types';

export interface SubjectFamily {
  id: string;
  name: string;
  aestheticTendency: Aesthetic;
  paletteTone: 'warm' | 'cool' | 'neutral' | 'vibrant';
  transitionStyle: SlideTransition;
  heroMotifFamily: string;
  keywords: string[];
}

export interface GeneratedAesthetic {
  aesthetic: Aesthetic;
  palette: Palette;
  transition: SlideTransition;
  heroSubjectPrompt: string;
  heroSubjectLabel: string;
  themeTagline: string;
  motifDescription: string;
  subjectFamily: string;
}

/**
 * Subject classification mapping.
 * Used to lock aesthetic decisions to subject matter.
 */
const SUBJECT_FAMILIES: Record<string, SubjectFamily> = {
  art_history: {
    id: 'art_history',
    name: 'Art History',
    aestheticTendency: 'editorial_magazine',
    paletteTone: 'warm',
    transitionStyle: 'morph',
    heroMotifFamily: 'sculptures_busts_artifacts',
    keywords: ['art', 'history', 'painting', 'sculpture', 'renaissance', 'baroque', 'modernism', 'artist', 'gallery', 'museum'],
  },
  physics: {
    id: 'physics',
    name: 'Physics',
    aestheticTendency: 'scientific_grid',
    paletteTone: 'cool',
    transitionStyle: 'reveal',
    heroMotifFamily: 'particles_waves_orbits',
    keywords: ['physics', 'quantum', 'relativity', 'force', 'energy', 'motion', 'wave', 'particle', 'mechanics', 'light'],
  },
  chemistry: {
    id: 'chemistry',
    name: 'Chemistry',
    aestheticTendency: 'technical_blueprint',
    paletteTone: 'cool',
    transitionStyle: 'morph',
    heroMotifFamily: 'molecules_atoms_reactions',
    keywords: ['chemistry', 'molecule', 'atom', 'reaction', 'bonding', 'periodic', 'element', 'compound', 'catalyst', 'oxidation'],
  },
  biology: {
    id: 'biology',
    name: 'Biology',
    aestheticTendency: 'humanist_warm',
    paletteTone: 'warm',
    transitionStyle: 'morph',
    heroMotifFamily: 'organisms_cells_dna',
    keywords: ['biology', 'cell', 'organism', 'dna', 'genetics', 'evolution', 'ecosystem', 'photosynthesis', 'protein', 'enzyme'],
  },
  mathematics: {
    id: 'mathematics',
    name: 'Mathematics',
    aestheticTendency: 'modern_minimal',
    paletteTone: 'neutral',
    transitionStyle: 'cut',
    heroMotifFamily: 'geometric_graphs_fractals',
    keywords: ['math', 'algebra', 'geometry', 'calculus', 'theorem', 'proof', 'equation', 'graph', 'fractal', 'pattern'],
  },
  history: {
    id: 'history',
    name: 'History',
    aestheticTendency: 'classical_textbook',
    paletteTone: 'warm',
    transitionStyle: 'push',
    heroMotifFamily: 'historical_artifacts_timelines',
    keywords: ['history', 'historical', 'century', 'era', 'civilization', 'ancient', 'medieval', 'revolution', 'empire', 'war'],
  },
  literature: {
    id: 'literature',
    name: 'Literature',
    aestheticTendency: 'scholarly_serif',
    paletteTone: 'warm',
    transitionStyle: 'fade',
    heroMotifFamily: 'manuscripts_books_literary_objects',
    keywords: ['literature', 'novel', 'poetry', 'author', 'character', 'narrative', 'theme', 'symbolism', 'drama', 'sonnet'],
  },
  business: {
    id: 'business',
    name: 'Business',
    aestheticTendency: 'modern_minimal',
    paletteTone: 'cool',
    transitionStyle: 'wipe',
    heroMotifFamily: 'charts_analytics_commerce',
    keywords: ['business', 'economics', 'market', 'finance', 'strategy', 'management', 'trade', 'profit', 'analytics', 'corporate'],
  },
  computer_science: {
    id: 'computer_science',
    name: 'Computer Science',
    aestheticTendency: 'technical_blueprint',
    paletteTone: 'cool',
    transitionStyle: 'reveal',
    heroMotifFamily: 'code_circuits_algorithms',
    keywords: ['computer', 'code', 'programming', 'algorithm', 'data', 'network', 'system', 'software', 'database', 'ai'],
  },
  geography: {
    id: 'geography',
    name: 'Geography',
    aestheticTendency: 'cinematic_editorial',
    paletteTone: 'warm',
    transitionStyle: 'morph',
    heroMotifFamily: 'maps_terrain_landscapes',
    keywords: ['geography', 'map', 'terrain', 'climate', 'region', 'country', 'ocean', 'mountain', 'city', 'landscape'],
  },
  religion: {
    id: 'religion',
    name: 'Religion & Philosophy',
    aestheticTendency: 'classical_textbook',
    paletteTone: 'neutral',
    transitionStyle: 'fade',
    heroMotifFamily: 'sacred_symbols_artifacts',
    keywords: ['religion', 'philosophy', 'theology', 'faith', 'spiritual', 'sacred', 'doctrine', 'ethics', 'belief', 'tradition'],
  },
  other: {
    id: 'other',
    name: 'General / Other',
    aestheticTendency: 'modern_minimal',
    paletteTone: 'neutral',
    transitionStyle: 'fade',
    heroMotifFamily: 'abstract_concepts',
    keywords: [],
  },
};

/**
 * Palette definitions by tone and intensity.
 * Each subject family uses a tone-appropriate palette.
 */
const PALETTE_BY_TONE: Record<string, Record<'conservative' | 'balanced' | 'vibrant', Palette>> = {
  warm: {
    conservative: {
      primary: '#6B4423',
      secondary: '#A0826D',
      accent: '#D4A574',
      surface: '#FBF8F3',
    },
    balanced: {
      primary: '#8B5A3C',
      secondary: '#CD9B6F',
      accent: '#F4A460',
      surface: '#FEF5E7',
    },
    vibrant: {
      primary: '#C85A17',
      secondary: '#E89659',
      accent: '#FF6B35',
      surface: '#FFF4E6',
    },
  },
  cool: {
    conservative: {
      primary: '#2C3E50',
      secondary: '#34495E',
      accent: '#3498DB',
      surface: '#ECF0F1',
    },
    balanced: {
      primary: '#1F4788',
      secondary: '#3A5A8A',
      accent: '#2E86DE',
      surface: '#E8F1F9',
    },
    vibrant: {
      primary: '#0B3D91',
      secondary: '#1E5F9E',
      accent: '#00D4FF',
      surface: '#E0F7FF',
    },
  },
  neutral: {
    conservative: {
      primary: '#2F2F2F',
      secondary: '#555555',
      accent: '#808080',
      surface: '#F5F5F5',
    },
    balanced: {
      primary: '#1F2937',
      secondary: '#475569',
      accent: '#6366F1',
      surface: '#F8FAFC',
    },
    vibrant: {
      primary: '#000000',
      secondary: '#404040',
      accent: '#7C3AED',
      surface: '#FAFAFA',
    },
  },
  vibrant: {
    conservative: {
      primary: '#D63031',
      secondary: '#E17055',
      accent: '#FF7675',
      surface: '#FFF5F5',
    },
    balanced: {
      primary: '#E91E63',
      secondary: '#F06292',
      accent: '#FF1744',
      surface: '#FCE4EC',
    },
    vibrant: {
      primary: '#FF4081',
      secondary: '#FF6B9D',
      accent: '#FF1E44',
      surface: '#FFE0F0',
    },
  },
};

/**
 * Hero subject prompt templates by motif family.
 * These are filled in with specific concepts from the lecture topic.
 */
const HERO_PROMPTS_BY_MOTIF: Record<string, string> = {
  sculptures_busts_artifacts:
    'A museum-quality marble sculpture or ancient artifact on a pedestal, studio-lit with dramatic side lighting, transparent background, premium cutout style, cinematic museum piece',
  particles_waves_orbits:
    'A 3D visualization of atomic orbits, particle waves, or quantum structures, glowing with energy, transparent background, premium scientific visualization, sleek and modern',
  molecules_atoms_reactions:
    'A complex molecular structure or chemical compound with visible atoms and bonds, glowing with orbital energy, transparent background, premium 3D chemistry visualization, laboratory-grade',
  organisms_cells_dna:
    'A detailed biological organism, cell structure, or DNA double helix, rendered as a premium 3D cutout, transparent background, bioluminescent, museum-quality scientific illustration',
  geometric_graphs_fractals:
    'An elegant geometric object, mathematical graph, or fractal pattern, rendered as a premium 3D wireframe, transparent background, minimalist and precise, mathematical beauty',
  historical_artifacts_timelines:
    'A significant historical artifact, monument, or period object, rendered as a museum piece, studio-lit, transparent background, premium cutout, dramatic historical gravity',
  manuscripts_books_literary_objects:
    'An elegant, aged manuscript, antique book, or literary object, rendered with rich detail, transparent background, premium cutout, scholarly and warm',
  charts_analytics_commerce:
    'A sleek business analytics dashboard, ascending graph, or commerce-related 3D object, rendered in corporate modern style, transparent background, premium cutout, dynamic and professional',
  code_circuits_algorithms:
    'A futuristic circuit board, flowing code visualization, or digital algorithm visualization, rendered with glowing neon accents, transparent background, premium tech aesthetic',
  maps_terrain_landscapes:
    'A topographic terrain map, geographic landscape, or cultural landmark rendered as a 3D model, transparent background, premium cutout, cinematic geographic scale',
  sacred_symbols_artifacts:
    'A sacred symbol, religious artifact, or philosophical emblem, rendered with dignity and reverence, transparent background, premium cutout, contemplative',
  abstract_concepts:
    'A creative abstract 3D shape or concept visualization, rendered in premium style, transparent background, elegant and modern, conceptual beauty',
};

/**
 * Classify a lecture topic into a subject family by keyword matching.
 */
export function classifySubject(
  subject: string,
  topic: string,
  designHint?: string
): SubjectFamily {
  const combined = `${subject} ${topic} ${designHint || ''}`.toLowerCase();
  
  // Score each family by keyword matches
  const scores: Record<string, number> = {};
  for (const [key, family] of Object.entries(SUBJECT_FAMILIES)) {
    scores[key] = family.keywords.filter(kw => combined.includes(kw)).length;
  }
  
  // Pick the family with the highest score (or 'other' if all 0)
  const bestFamily = Object.entries(scores).reduce((a, b) => (b[1] > a[1] ? b : a));
  
  return SUBJECT_FAMILIES[bestFamily[0] || 'other'];
}

/**
 * Determine palette intensity based on expertise level and subject.
 */
export function determinePaletteIntensity(
  expertise: 'basic' | 'intermediate' | 'advanced' | 'expert',
  gradeLevel?: string
): 'conservative' | 'balanced' | 'vibrant' {
  if (expertise === 'basic' || gradeLevel?.includes('Grade [1-6]')) return 'conservative';
  if (expertise === 'intermediate' || gradeLevel?.includes('Grade [7-9]')) return 'balanced';
  return 'vibrant'; // advanced / expert / grades 10-12
}

/**
 * Generate a hero subject-specific prompt by topic keyword.
 */
export function generateHeroPrompt(
  topic: string,
  motifFamily: string,
  heroLabel: string
): string {
  const basePrompt = HERO_PROMPTS_BY_MOTIF[motifFamily] || HERO_PROMPTS_BY_MOTIF.abstract_concepts;
  
  // Inject topic context
  return `${basePrompt}\n\nRepresenting the concept of "${heroLabel}" from the lecture topic "${topic}". Make it a singular, iconic, recognizable object that will anchor every slide visually. No text, just the object.`;
}

/**
 * Generate a theme tagline based on subject and aesthetic.
 */
export function generateThemeTagline(
  family: SubjectFamily,
  topic: string,
  aesthetic: Aesthetic
): string {
  const aestheticNoun = aesthetic.replace(/_/g, ' ');
  const sample = [
    `${family.name} through a ${aestheticNoun} lens`,
    `Exploring ${topic.toLowerCase()} with ${aesthetic === 'cinematic_editorial' ? 'cinematic precision' : 'thoughtful design'}`,
    `${family.name}: ${topic} reimagined`,
  ];
  return sample[Math.floor(Math.random() * sample.length)];
}

/**
 * MAIN: Generate complete aesthetic system for a lecture.
 */
export function generateAesthetic(
  subject: string,
  topic: string,
  expertise: 'basic' | 'intermediate' | 'advanced' | 'expert',
  gradeLevel?: string,
  designHint?: string
): GeneratedAesthetic {
  // 1. Classify subject
  const family = classifySubject(subject, topic, designHint);
  
  // 2. Determine palette intensity
  const intensity = determinePaletteIntensity(expertise, gradeLevel);
  const palette = PALETTE_BY_TONE[family.paletteTone][intensity];
  
  // 3. Extract hero label (first 2-3 words of topic)
  const words = topic.split(' ');
  const heroLabel = words.slice(0, Math.min(3, words.length)).join(' ');
  
  // 4. Generate hero subject prompt
  const heroSubjectPrompt = generateHeroPrompt(topic, family.heroMotifFamily, heroLabel);
  
  // 5. Generate theme tagline
  const themeTagline = generateThemeTagline(family, topic, family.aestheticTendency);
  
  return {
    aesthetic: family.aestheticTendency,
    palette,
    transition: family.transitionStyle,
    heroSubjectPrompt,
    heroSubjectLabel: heroLabel,
    themeTagline,
    motifDescription: family.heroMotifFamily,
    subjectFamily: family.id,
  };
}

/**
 * OPTIONAL: Allow manual aesthetic override by design hint.
 * If user provides a strong hint like "blueprint" or "editorial", lock to that aesthetic.
 */
export function parseDesignHint(hint: string): Aesthetic | null {
  if (!hint) return null;
  
  const lower = hint.toLowerCase();
  const hints: Record<string, Aesthetic> = {
    'cinematic': 'cinematic_editorial',
    'editorial': 'cinematic_editorial',
    'magazine': 'editorial_magazine',
    'scholarly': 'scholarly_serif',
    'serif': 'scholarly_serif',
    'textbook': 'classical_textbook',
    'minimal': 'modern_minimal',
    'clean': 'modern_minimal',
    'modern': 'modern_minimal',
    'scientific': 'scientific_grid',
    'grid': 'scientific_grid',
    'blueprint': 'technical_blueprint',
    'technical': 'technical_blueprint',
    'warm': 'humanist_warm',
    'humanist': 'humanist_warm',
    'vibrant': 'vibrant_creative',
    'creative': 'vibrant_creative',
  };
  
  for (const [hint, aesthetic] of Object.entries(hints)) {
    if (lower.includes(hint)) return aesthetic;
  }
  
  return null;
}
