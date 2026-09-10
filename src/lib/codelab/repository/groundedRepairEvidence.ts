import type { NyxEvidenceRequest } from "../cognition/nyxNemotronEngineeringCognition";
import type { OmegaAcquiredRepairEvidence, OmegaRepairEvidenceProvider } from "../engine/r3BoundedRepairLoop";
import { GroundedRepositoryContext, type GroundedContextPack, type RepositoryContextQuery } from "./groundedRepositoryContext";

type ContextConfig = Parameters<typeof GroundedRepositoryContext.create>[0];

interface RepairEvidenceConfig {
  readonly providerIdentity: string;
  readonly manifest: readonly string[];
  readonly query: RepositoryContextQuery;
  readonly maxSnapshots: number;
  /** Trusted Omega host supplies an already scoped R1 executor, never model-generated configuration. */
  readonly observeCurrentCandidate: () => Promise<ContextConfig>;
}

export interface RepairContextObservation {
  readonly cognitionCycle: number;
  readonly candidateId: string;
  readonly environmentId: string;
  readonly snapshotDigest: string;
  readonly paths: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly bytes: number;
  readonly readOperations: number;
  readonly relationCount: number;
  readonly authorityGranted: false;
}

/** Composes existing R1 retrieval with R3 repair. It cannot issue or enlarge a capability. */
export class GroundedRepairEvidence implements OmegaRepairEvidenceProvider {
  readonly providerIdentity: string;
  readonly initial: GroundedContextPack;
  readonly #config: RepairEvidenceConfig;
  readonly #remainingRefs: Map<string, string>;
  readonly #observations: RepairContextObservation[] = [];
  #snapshots = 1;
  #busy = false;
  #closed = false;

  private constructor(config: RepairEvidenceConfig, initial: GroundedContextPack, reads: number) {
    this.#config = config;
    this.providerIdentity = config.providerIdentity;
    this.initial = initial;
    this.#remainingRefs = new Map(initial.availableEvidence.map((item) => [item.evidenceRef, item.relativePath]));
    this.#record(initial, 0, reads);
  }

  static async create(input: RepairEvidenceConfig): Promise<GroundedRepairEvidence> {
    if (!input || typeof input.providerIdentity !== "string" || !input.providerIdentity.trim()
      || !Number.isSafeInteger(input.maxSnapshots) || input.maxSnapshots < 1 || input.maxSnapshots > 9
      || typeof input.observeCurrentCandidate !== "function" || !Array.isArray(input.manifest)
      || !input.manifest.length || !input.query || !Array.isArray(input.query.seedPaths)) {
      throw new Error("repair_context_invalid_configuration");
    }
    const config = Object.freeze({ ...input, manifest: Object.freeze([...input.manifest]),
      query: Object.freeze({ ...input.query, seedPaths: Object.freeze([...input.query.seedPaths]) }) });
    const observed = await config.observeCurrentCandidate();
    GroundedRepairEvidence.#validateManifest(config.manifest, observed.manifest);
    const context = await GroundedRepositoryContext.create(observed);
    const initial = await context.retrieve(config.query);
    return new GroundedRepairEvidence(config, initial, context.readOperations);
  }

  get snapshotAttempts(): number { return this.#snapshots; }
  observations(): readonly RepairContextObservation[] { return structuredClone(this.#observations); }
  close(): void { this.#closed = true; this.#remainingRefs.clear(); }

  async acquire(request: NyxEvidenceRequest, cognitionCycle: number): Promise<OmegaAcquiredRepairEvidence> {
    if (this.#closed) throw new Error("repair_context_closed");
    if (this.#busy) throw new Error("repair_context_concurrent_request");
    const refs = request?.requestedEvidenceRefs;
    if (!Number.isSafeInteger(cognitionCycle) || cognitionCycle < 1 || !Array.isArray(refs) || refs.length < 1
      || refs.length > 10 || new Set(refs).size !== refs.length || refs.some((ref) => !this.#remainingRefs.has(ref))) {
      throw new Error("repair_context_unissued_reference");
    }
    if (this.#snapshots >= this.#config.maxSnapshots) throw new Error("repair_context_snapshot_budget");
    // Capture caller-owned arrays before the first asynchronous boundary.
    const requestedRefs = [...refs];
    const paths = requestedRefs.map((ref) => this.#remainingRefs.get(ref)!);
    this.#snapshots += 1; // Failed attempts consume the same finite refresh allowance.
    this.#busy = true;
    try {
      const observed = await this.#config.observeCurrentCandidate();
      if (this.#closed) throw new Error("repair_context_closed");
      GroundedRepairEvidence.#validateManifest(this.#config.manifest, observed.manifest);
      if (observed.environmentId !== this.initial.environmentId) throw new Error("repair_context_environment_changed");
      const context = await GroundedRepositoryContext.create(observed);
      // Old references identify requested paths, not old contents or authorization for another root.
      // Re-index and re-observe using the trusted host's current candidate and current R1 capability.
      const fresh = await context.retrieve({ ...this.#config.query, seedPaths: paths,
        mode: "LEXICAL", maxFiles: paths.length, maxDependencyDepth: 0 });
      if (this.#closed) throw new Error("repair_context_closed");
      this.#record(fresh, cognitionCycle, context.readOperations);
      requestedRefs.forEach((ref) => this.#remainingRefs.delete(ref));
      return { requestedEvidenceRefs: requestedRefs, evidenceIds: fresh.evidenceIds, files: fresh.files,
        omegaAuthorityBoundary: "R1_ADMITTED_READ_ONLY_EVIDENCE", authorityGranted: false };
    } finally { this.#busy = false; }
  }

  #record(pack: GroundedContextPack, cognitionCycle: number, readOperations: number): void {
    this.#observations.push(Object.freeze({ cognitionCycle, candidateId: pack.candidateId,
      environmentId: pack.environmentId, snapshotDigest: pack.snapshotDigest,
      paths: Object.freeze(pack.files.map((file) => file.relativePath)), evidenceIds: Object.freeze([...pack.evidenceIds]),
      bytes: pack.bytes, readOperations, relationCount: pack.relations.length, authorityGranted: false }));
  }

  static #validateManifest(expected: readonly string[], observed: readonly string[]): void {
    if (!Array.isArray(observed) || new Set(expected).size !== expected.length || observed.length !== expected.length
      || new Set(observed).size !== observed.length || observed.some((path) => !expected.includes(path))) {
      throw new Error("repair_context_manifest_changed");
    }
  }
}
