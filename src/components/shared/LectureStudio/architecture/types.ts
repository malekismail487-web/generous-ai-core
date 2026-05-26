/**
 * Architecture: persistent slide graph + semantic 3D objects + morph instructions.
 * These types are the contract between the outline, the GLB generator, the morph patcher
 * and the PPTX exporter. They are intentionally framework-free.
 */

import type { Outline, Paragraph, Palette, SlideTransition, HeroMotion } from '../types';

export interface TransformData {
  x: number;       // 0..1 slide-relative
  y: number;       // 0..1
  scale: number;   // relative to slide height
  rotateX: number; // degrees
  rotateY: number;
  rotateZ: number;
  opacity: number; // 0..1
}

export interface MorphStateData {
  /** Where the object should sit in this slide (camera frame). */
  transform: TransformData;
  /** Educational meaning of the state, e.g. "expanded shell", "translation step 2". */
  semantic?: string;
}

export interface AnimationKeyframe {
  /** 0..1 normalised time within the slide */
  t: number;
  transform: Partial<TransformData>;
}

export interface AnimationTimeline {
  /** Human-readable label, e.g. "rotate", "reveal_layer" */
  name: string;
  durationMs: number;
  loop: boolean;
  keyframes: AnimationKeyframe[];
}

export type ObjectKind = '3DObject' | 'Shape' | 'Image' | 'Text';

export interface PersistedObject3D {
  id: string;
  /** Stable role across the deck — drives morph continuity ("hero", "ring", "callout"). */
  role: 'hero' | 'ring' | 'figure' | 'accent' | 'text';
  type: ObjectKind;
  /** Base64 data URL of a .glb binary (when type === '3DObject'). */
  glbDataUrl?: string;
  /** Fallback 2D PNG data URL if GLB is unavailable. */
  imageDataUrl?: string;
  /** Inline text (when type === 'Text'). */
  text?: string;
  animations: AnimationTimeline[];
  transform: TransformData;
  morphState?: MorphStateData;
}

export interface SlideGraphNode {
  id: string;
  index: number;
  layout: LayoutIntent;
  objects: PersistedObject3D[];
  /** IDs of neighbouring slides this slide morphs into. */
  links: string[];
  paragraph?: Paragraph;
}

export type LayoutMode =
  | 'Immersive'   // hero dominates
  | 'Concept'     // big idea + figure right
  | 'Process'     // stepwise grid
  | 'Split'       // half-bleed
  | 'Minimal'     // text-forward
  | 'Diagram'     // diagram dominates
  | 'Recap';      // wrap-up grid

export interface LayoutIntent {
  mode: LayoutMode;
  focusObjectId?: string;
  /** Mapped to the existing SlideLayout used by the renderer. */
  rendererLayout: 'ring_portrait' | 'quadrant' | 'half_bleed_left' | 'half_bleed_right' | 'stat_callout' | 'iso_cube';
}

export interface StyleTokens {
  palette: Palette;
  bgTexture: 'flat' | 'parchment' | 'grid' | 'gradient' | 'starfield' | 'blueprint';
  accentZone: 'left' | 'right' | 'frame' | 'corner';
  sceneFog: number;          // 0..1 atmospheric density used by 3D scene
  signatureMotif: string;    // short label, e.g. "orbital_ring", "marble_arch"
}

export interface MorphInstruction {
  fromSlideId: string;
  toSlideId: string;
  objectId: string;
  from: MorphStateData;
  to: MorphStateData;
  /** Why this morph exists pedagogically. */
  semanticMeaning: string;
}

/** Spec returned by the AI for one slide's 3D object. Topic-driven, fully dynamic. */
export interface ThreeDObjectSpec {
  /** Geometry family the procedural builder understands. */
  geometry:
    | 'sphere_cluster'    // atoms, planets, cells
    | 'helix'             // DNA, springs, spirals
    | 'wave_mesh'         // physics waves, terrain
    | 'torus_ring'        // orbital rings, halos
    | 'lattice'           // crystals, molecules
    | 'column_stack'      // bar data, monuments
    | 'orbit_system'      // electron / planetary
    | 'arch'              // historical / architectural
    | 'bust'              // human / sculptural (proxy)
    | 'tree'              // hierarchy, decision, biology
    | 'gear_train'        // mechanics
    | 'flow_pipes';       // process / chemistry plant
  colorScheme: string[];        // hex strings, first = primary
  structureParams?: Record<string, number | string | boolean>;
  educationalBehavior?: string; // short human description
  animationParams?: { rotateY?: number; rotateX?: number; floatAmp?: number; loopMs?: number };
}

export interface SlideGraphBuildInput {
  outline: Outline;
  heroImageDataUrl?: string | null;
  perSlideImageDataUrls: (string | null)[]; // aligned with outline.paragraphs
  perSlideGlbDataUrls?: (string | null)[];  // aligned with outline.paragraphs
}

export interface ExportPayload {
  graph: SlideGraphNode[];
  morphPlan: MorphInstruction[];
  identity: StyleTokens;
  transition: SlideTransition;
  // Convenience flat lookups for the exporter
  heroImageDataUrl?: string | null;
  perSlideImageDataUrls: (string | null)[];
  perSlideGlbDataUrls: (string | null)[];
}

export type { HeroMotion };
