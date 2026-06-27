// ============================================================================
//  itemRepresentation.ts — Stage 12 · §8 (Future-proof item embedding adapter)
// ----------------------------------------------------------------------------
//  Item parameters today are scalar (a, b). Item embeddings (Q-matrix rows,
//  text-encoded vectors, etc.) are a forward-looking upgrade. To remain
//  open for that upgrade without redesigning the engine we define one
//  interface that the IRT, KT, and bandit subsystems can consume.
//
//  Current implementation: `scalarItemAdapter` exposes (a, b) as a
//  2-dimensional embedding ([a, b]) so callers can request a uniform shape.
//  A future `embeddingItemAdapter` may resolve a learned vector from a
//  pgvector column, with identical surface.
// ============================================================================

export interface ItemRepresentation {
  /** Stable item identifier. */
  id: string;
  /** Discrimination parameter (a). */
  discrimination: number;
  /** Difficulty parameter (b). */
  difficulty: number;
  /** Optional embedding vector. May be empty when only scalars exist. */
  embedding: number[];
  /** Backend identifier for provenance. */
  backend: string;
}

export interface ItemAdapter {
  readonly id: string;
  toRepresentation(item: { id: string; a: number; b: number; embedding?: number[] | null }): ItemRepresentation;
}

export const scalarItemAdapter: ItemAdapter = {
  id: "scalar-2pl-v1",
  toRepresentation(item) {
    const a = Number.isFinite(item.a) ? item.a : 1.0;
    const b = Number.isFinite(item.b) ? item.b : 0.0;
    return {
      id: item.id,
      discrimination: a,
      difficulty: b,
      embedding: Array.isArray(item.embedding) && item.embedding.length > 0
        ? item.embedding.slice()
        : [a, b],
      backend: this.id,
    };
  },
};

export function getActiveItemAdapter(_flag?: string): ItemAdapter {
  return scalarItemAdapter;
}
