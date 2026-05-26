/**
 * PersistentSlideGraph + morph-instruction synthesis.
 * The graph wires the outline + visual identity + generated 3D/figure assets into
 * a single export-ready structure. Object identity (role + id) is what gives
 * PowerPoint Morph something to interpolate between.
 */
import type {
  ExportPayload, MorphInstruction, MorphStateData, PersistedObject3D,
  SlideGraphBuildInput, SlideGraphNode, StyleTokens, TransformData,
} from './types';
import type { HeroMotion, SlideTransition } from '../types';
import { evolveVisualIdentity } from './visualIdentity';
import { generateAdaptiveLayout } from './layoutIntent';

function motionToTransform(m: HeroMotion | undefined, fallback: TransformData): TransformData {
  if (!m) return fallback;
  return {
    x: m.x, y: m.y, scale: m.scale, rotateX: 0, rotateY: 0, rotateZ: m.rotate || 0,
    opacity: typeof m.opacity === 'number' ? m.opacity : 1,
  };
}

const DEFAULT_TRANSFORM: TransformData = { x: 0.5, y: 0.5, scale: 0.6, rotateX: 0, rotateY: 0, rotateZ: 0, opacity: 1 };

export class PersistentSlideGraph {
  private nodes: SlideGraphNode[] = [];
  identity!: StyleTokens;
  transition: SlideTransition = 'morph';

  addSlide(node: SlideGraphNode) { this.nodes.push(node); }
  getSlides() { return this.nodes; }

  /** Wire each recurring object (same role+id) across slides into morph instructions. */
  buildMorphPlan(): MorphInstruction[] {
    const plan: MorphInstruction[] = [];
    for (let i = 1; i < this.nodes.length; i++) {
      const prev = this.nodes[i - 1];
      const cur = this.nodes[i];
      for (const obj of cur.objects) {
        const match = prev.objects.find((o) => o.id === obj.id || (o.role === obj.role && o.role !== 'text'));
        if (!match) continue;
        plan.push({
          fromSlideId: prev.id,
          toSlideId: cur.id,
          objectId: obj.id,
          from: match.morphState ?? { transform: match.transform },
          to: obj.morphState ?? { transform: obj.transform },
          semanticMeaning: obj.morphState?.semantic
            ?? `${obj.role} continuity from slide ${prev.index + 1} to ${cur.index + 1}`,
        });
      }
    }
    return plan;
  }
}

/** Build a complete graph from the outline + already-generated assets. */
export function buildSlideGraph(input: SlideGraphBuildInput): ExportPayload {
  const { outline, heroImageDataUrl, perSlideImageDataUrls, perSlideGlbDataUrls = [] } = input;
  const graph = new PersistentSlideGraph();
  graph.identity = evolveVisualIdentity(outline);
  graph.transition = outline.transition || 'morph';

  outline.paragraphs.forEach((p, i) => {
    const objects: PersistedObject3D[] = [];

    // Hero — shared across all slides (id stable). Drives Morph.
    if (heroImageDataUrl) {
      objects.push({
        id: 'hero',
        role: 'hero',
        type: 'Image',
        imageDataUrl: heroImageDataUrl,
        animations: [],
        transform: motionToTransform(p.hero_motion, { ...DEFAULT_TRANSFORM, x: 0.85, y: 0.5, scale: 0.55 }),
      });
    }

    // Ring — shared accent
    objects.push({
      id: 'ring',
      role: 'ring',
      type: 'Shape',
      animations: [],
      transform: { ...DEFAULT_TRANSFORM, scale: 0.4 },
    });

    // Per-slide figure: prefer GLB, else PNG.
    const glb = perSlideGlbDataUrls[i] || null;
    const fig = perSlideImageDataUrls[i] || null;
    if (glb || fig) {
      objects.push({
        id: `figure_${i}`,
        role: 'figure',
        type: glb ? '3DObject' : 'Image',
        glbDataUrl: glb || undefined,
        imageDataUrl: fig || undefined,
        animations: glb ? [{
          name: 'idle_rotation', durationMs: 6000, loop: true,
          keyframes: [
            { t: 0, transform: { rotateY: 0 } },
            { t: 1, transform: { rotateY: 360 } },
          ],
        }] : [],
        transform: { ...DEFAULT_TRANSFORM, x: 0.5, y: 0.5, scale: 0.7 },
      });
    }

    const layout = generateAdaptiveLayout(p, i, objects);

    graph.addSlide({
      id: `slide_${i}`,
      index: i,
      objects,
      links: [],
      paragraph: p,
      layout,
    });
  });

  // Link sequential neighbours.
  const nodes = graph.getSlides();
  for (let i = 0; i < nodes.length; i++) {
    if (i > 0) nodes[i].links.push(nodes[i - 1].id);
    if (i < nodes.length - 1) nodes[i].links.push(nodes[i + 1].id);
  }

  const morphPlan = graph.buildMorphPlan();

  return {
    graph: nodes,
    morphPlan,
    identity: graph.identity,
    transition: graph.transition,
    heroImageDataUrl,
    perSlideImageDataUrls,
    perSlideGlbDataUrls,
  };
}
