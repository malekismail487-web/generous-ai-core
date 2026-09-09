import { createHash, randomUUID } from "node:crypto";
import { ReadOnlyRepositoryExecutor, validateExecutorTransaction } from "../executor/readOnlyExecutor";
import type { ExecutorTransaction } from "../executor/types";
import type { NyxAvailableEvidence, NyxEngineeringFileContext, NyxEvidenceRequest } from "../cognition/nyxNemotronEngineeringCognition";
import type { OmegaAcquiredRepairEvidence, OmegaRepairEvidenceProvider } from "../engine/r3BoundedRepairLoop";
import { canonicalRepositoryPath, compareText, parseStaticModule, resolveObservedModule,
  type ModuleResolution, type StaticModuleSummary } from "./staticModuleRelations";

export const GROUNDED_REPOSITORY_CONTEXT = Object.freeze({
  chunkId: "NYX-REPOSITORY-CONTEXT-001", version: "nyx-static-context/1", parserVersion: "typescript/5.8.3",
  scope: "EXPLICIT_MANIFEST_STATIC_RELATIVE_MODULE_CANDIDATES", authorityGranted: false,
  runtimeResolutionProved: false, atomicRepositorySnapshot: false, persistentMemory: false,
  planCoverage: { direct: ["USER-STUDY:PLAN-IX", "USER-STUDY:BASE-ITEM-12", "DRAFT-LAYER-1", "DRAFT-LAYER-2"],
    draftSha256: "9fcdb6eeb6d11e411d296dc08ad06e68a21ab9a92cfe5e2c05c4d15ab705c118",
    supporting: ["NO_OBSERVATION_WITHOUT_EVIDENCE", "SPECIFICATION_NOT_CAPABILITY", "DRAFT-LAYER-0"],
    deferred: ["RUNTIME_CAUSAL_MODEL", "LEARNED_RETRIEVAL", "SKILL_EVOLUTION", "WEIGHT_UPDATES"],
    coverage: "PARTIAL_JUST_IN_TIME" },
} as const);

interface ContextConfig {
  readonly sessionId: string;
  readonly candidateId: string;
  readonly environmentId: string;
  readonly executor: ReadOnlyRepositoryExecutor;
  readonly manifest: readonly string[];
  readonly maxSnapshotBytes: number;
  readonly maxReadOperations: number;
  readonly now: () => number;
}

interface ObservedFile extends NyxEngineeringFileContext {
  readonly evidenceId: string;
  readonly transactionSequence: number;
  readonly bytes: number;
  readonly module: StaticModuleSummary;
}

export interface GroundedModuleRelation {
  readonly source: string;
  readonly line: number;
  readonly specifier: string | null;
  readonly resolution: ModuleResolution;
  readonly evidenceIds: readonly string[];
  readonly freshnessDependencies: readonly { relativePath: string; contentSha256: string }[];
}

export interface RepositoryContextQuery {
  readonly objective: string;
  readonly seedPaths: readonly string[];
  readonly mode: "LEXICAL" | "DEPENDENCY_AUGMENTED";
  readonly maxFiles: number;
  readonly maxBytes: number;
  readonly maxDependencyDepth: number;
}

export interface GroundedContextPack {
  readonly candidateId: string;
  readonly environmentId: string;
  readonly snapshotDigest: string;
  readonly files: readonly NyxEngineeringFileContext[];
  readonly evidenceIds: readonly string[];
  readonly availableEvidence: readonly NyxAvailableEvidence[];
  readonly relations: readonly GroundedModuleRelation[];
  readonly bytes: number;
  readonly unselectedPaths: readonly string[];
  readonly parseStates: readonly { relativePath: string; state: StaticModuleSummary["parseState"] }[];
  readonly rankingState: "ORIGINAL_OBSERVED_SNAPSHOT";
  readonly observationState: "INDIVIDUALLY_REOBSERVED_NOT_ATOMIC";
  readonly authorityGranted: false;
}

function hash(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function integer(value: number, min: number, max: number): boolean {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}
function identity(value: string): boolean { return typeof value === "string" && /^[a-zA-Z0-9_.:/-]{1,160}$/.test(value); }
function terms(value: string): Set<string> {
  return new Set(value.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []);
}

/** Process-local, authority-neutral repository context backed exclusively by Omega R1 observations. */
export class GroundedRepositoryContext implements OmegaRepairEvidenceProvider {
  readonly providerIdentity: string;
  readonly #config: ContextConfig;
  readonly #files = new Map<string, ObservedFile>();
  readonly #requestNamespace = randomUUID();
  readonly #issuedRefs = new Map<string, string>();
  #relations: GroundedModuleRelation[] = [];
  #reads = 0;
  #busy = false;
  #snapshotDigest = "";

  private constructor(config: ContextConfig) {
    this.#config = { ...config, manifest: [...config.manifest] };
    this.providerIdentity = `OMEGA-R1-CONTEXT:${config.sessionId}`;
  }

  static async create(config: ContextConfig): Promise<GroundedRepositoryContext> {
    if (!identity(config.sessionId) || !identity(config.candidateId) || !identity(config.environmentId)
      || !(config.executor instanceof ReadOnlyRepositoryExecutor) || typeof config.now !== "function"
      || !Array.isArray(config.manifest) || !integer(config.manifest.length, 1, 128)
      || new Set(config.manifest).size !== config.manifest.length || !config.manifest.every(canonicalRepositoryPath)
      || !integer(config.maxSnapshotBytes, 1, 8_000_000) || !integer(config.maxReadOperations, config.manifest.length, 2048)) {
      throw new Error("context_invalid_configuration");
    }
    const session = new GroundedRepositoryContext(config);
    let totalBytes = 0;
    for (const path of [...config.manifest].sort(compareText)) {
      const observed = await session.#read(path);
      totalBytes += observed.bytes;
      if (totalBytes > config.maxSnapshotBytes) throw new Error("context_snapshot_byte_budget");
      session.#files.set(path, observed);
    }
    session.#snapshotDigest = hash(JSON.stringify({ candidateId: config.candidateId, environmentId: config.environmentId,
      files: [...session.#files.values()].map((file) => [file.relativePath, file.contentSha256]),
      version: GROUNDED_REPOSITORY_CONTEXT.version }));
    session.#relations = session.#buildRelations();
    return session;
  }

  get readOperations(): number { return this.#reads; }

  async #read(path: string): Promise<ObservedFile> {
    if (this.#reads >= this.#config.maxReadOperations) throw new Error("context_read_budget_exhausted");
    this.#reads += 1;
    const transaction = await this.#config.executor.execute({
      requestId: `${this.#requestNamespace}:${this.#reads}`, tokenId: this.#config.executor.token.tokenId,
      action: "READ_FILE", resourcePath: path, observedAtEpochMs: this.#config.now(),
    });
    // Authorization can be withdrawn while an already-admitted R1 read is in flight.
    const finishedAt = this.#config.now();
    const token = this.#config.executor.token;
    if (!Number.isFinite(finishedAt) || finishedAt < token.issuedAtEpochMs || finishedAt >= token.expiresAtEpochMs
      || this.#config.executor.revocationLog().length > 0) {
      throw new Error(`context_authority_no_longer_live:${transaction.authorization.code}`);
    }
    return this.#admitRead(path, transaction);
  }

  #admitRead(path: string, transaction: ExecutorTransaction): ObservedFile {
    const observation = transaction.observation;
    if (!validateExecutorTransaction(transaction).ok || !transaction.authorization.allowed
      || observation.status !== "OBSERVED" || observation.resourceKind !== "FILE" || observation.content === null
      || observation.contentSha256 !== hash(observation.content) || observation.resourcePath !== path) {
      throw new Error(`context_read_rejected:${transaction.authorization.code}:${observation.status}`);
    }
    const bytes = Buffer.byteLength(observation.content, "utf8");
    // Recheck after read: R1's pre-read stat cannot guarantee that the file did not grow during the read.
    if (bytes > this.#config.executor.token.constraints.maxFileBytes || bytes > this.#config.maxSnapshotBytes) {
      throw new Error("context_observed_byte_budget");
    }
    return { relativePath: path, content: observation.content, contentSha256: observation.contentSha256,
      evidenceId: `${this.#config.executor.executorId}:${this.#config.executor.token.tokenId}:${transaction.evidence.evidenceId}`,
      transactionSequence: transaction.sequence, bytes, module: parseStaticModule(path, observation.content) };
  }

  #buildRelations(): GroundedModuleRelation[] {
    const observedPaths = new Set(this.#files.keys());
    return [...this.#files.values()].flatMap((file) => file.module.references.map((reference) => {
      const resolution = resolveObservedModule(file.relativePath, reference, observedPaths);
      const target = resolution.target ? this.#files.get(resolution.target) : undefined;
      const dependencies = target && target !== file ? [file, target] : [file];
      return { source: file.relativePath, line: reference.line, specifier: reference.specifier, resolution,
        evidenceIds: dependencies.map((item) => item.evidenceId),
        freshnessDependencies: dependencies.map((item) => ({ relativePath: item.relativePath,
          contentSha256: item.contentSha256 })) };
    }));
  }

  async #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#busy) throw new Error("context_concurrent_operation_rejected");
    this.#busy = true;
    try { return await operation(); } finally { this.#busy = false; }
  }

  #rank(query: RepositoryContextQuery): ObservedFile[] {
    if (typeof query.objective !== "string" || !query.objective.trim() || query.objective.length > 8000
      || !Array.isArray(query.seedPaths) || new Set(query.seedPaths).size !== query.seedPaths.length
      || query.seedPaths.some((path) => !this.#files.has(path))
      || !["LEXICAL", "DEPENDENCY_AUGMENTED"].includes(query.mode)
      || !integer(query.maxFiles, 1, this.#files.size) || !integer(query.maxBytes, 1, this.#config.maxSnapshotBytes)
      || !integer(query.maxDependencyDepth, 0, 8) || query.seedPaths.length > query.maxFiles) {
      throw new Error("context_invalid_query");
    }
    const distances = new Map(query.seedPaths.map((path) => [path, 0]));
    if (query.mode === "DEPENDENCY_AUGMENTED") {
      for (let depth = 0; depth < query.maxDependencyDepth; depth += 1) {
        for (const relation of this.#relations) {
          const target = relation.resolution.target;
          if (distances.get(relation.source) === depth && target && !distances.has(target)) {
            distances.set(target, depth + 1);
          }
        }
      }
    }
    const objectiveTerms = terms(query.objective);
    const score = (file: ObservedFile): number => {
      const fileTerms = terms(`${file.relativePath} ${file.content}`);
      return [...objectiveTerms].filter((term) => fileTerms.has(term)).length;
    };
    const scores = new Map([...this.#files.values()].map((file) => [file.relativePath, score(file)]));
    return [...this.#files.values()].sort((left, right) =>
      (distances.get(left.relativePath) ?? 999) - (distances.get(right.relativePath) ?? 999)
      || scores.get(right.relativePath)! - scores.get(left.relativePath)!
      || compareText(left.relativePath, right.relativePath));
  }

  async #fresh(paths: readonly string[]): Promise<ObservedFile[]> {
    const result: ObservedFile[] = [];
    for (const path of paths) {
      const fresh = await this.#read(path);
      if (fresh.contentSha256 !== this.#files.get(path)?.contentSha256) {
        throw new Error(`context_requires_revalidation:${path}`);
      }
      result.push(fresh);
    }
    return result;
  }

  async retrieve(query: RepositoryContextQuery): Promise<GroundedContextPack> {
    return this.#exclusive(async () => {
      const ranked = this.#rank(query);
      const selected: ObservedFile[] = [];
      let bytes = 0;
      for (const file of ranked) {
        if (selected.length < query.maxFiles && bytes + file.bytes <= query.maxBytes) {
          selected.push(file);
          bytes += file.bytes;
        }
      }
      if (!selected.length || query.seedPaths.some((path) => !selected.some((file) => file.relativePath === path))) {
        throw new Error("context_seed_or_file_exceeds_output_budget");
      }
      const fresh = await this.#fresh(selected.map((file) => file.relativePath));
      const selectedPaths = new Set(fresh.map((file) => file.relativePath));
      const unselected = ranked.filter((file) => !selectedPaths.has(file.relativePath));
      const availableEvidence = unselected.map((file): NyxAvailableEvidence => {
        const ref = `AVAILABLE:${hash(`${this.#requestNamespace}:${this.#snapshotDigest}:${file.relativePath}`)}`;
        this.#issuedRefs.set(ref, file.relativePath);
        return { evidenceRef: ref, kind: "FILE", relativePath: file.relativePath,
          description: `Snapshot source; must be reobserved before use. Parser: ${file.module.parseState}.` };
      });
      // Edges are emitted only when every supporting file was reobserved in this retrieval.
      const relations = this.#relations.filter((item) =>
        item.freshnessDependencies.every((dependency) => selectedPaths.has(dependency.relativePath)))
        .map((item) => ({ ...item, evidenceIds: item.freshnessDependencies.map((dependency) =>
          fresh.find((file) => file.relativePath === dependency.relativePath)!.evidenceId) }));
      return structuredClone({ candidateId: this.#config.candidateId, environmentId: this.#config.environmentId,
        snapshotDigest: this.#snapshotDigest, files: fresh.map(({ relativePath, content, contentSha256 }) =>
          ({ relativePath, content, contentSha256 })), evidenceIds: fresh.map((file) => file.evidenceId),
        availableEvidence, relations, bytes, unselectedPaths: unselected.map((file) => file.relativePath),
        parseStates: fresh.map((file) => ({ relativePath: file.relativePath, state: file.module.parseState })),
        rankingState: "ORIGINAL_OBSERVED_SNAPSHOT" as const,
        observationState: "INDIVIDUALLY_REOBSERVED_NOT_ATOMIC" as const, authorityGranted: false as const });
    });
  }

  // This is the existing R3-E evidence-provider interface, not a new cognition/controller protocol.
  async acquire(request: NyxEvidenceRequest, cognitionCycle: number): Promise<OmegaAcquiredRepairEvidence> {
    return this.#exclusive(async () => {
      const rawRefs = request.requestedEvidenceRefs;
      if (request.authorityGranted !== false || !integer(cognitionCycle, 1, 2048) || !Array.isArray(rawRefs)
        || !integer(rawRefs.length, 1, 10) || new Set(rawRefs).size !== rawRefs.length
        || rawRefs.some((ref) => !this.#issuedRefs.has(ref))) throw new Error("context_unissued_evidence_request");
      const refs = [...rawRefs];
      const paths = refs.map((ref) => this.#issuedRefs.get(ref)!);
      const files = await this.#fresh(paths);
      for (const ref of refs) this.#issuedRefs.delete(ref);
      return { requestedEvidenceRefs: [...refs], evidenceIds: files.map((file) => file.evidenceId),
        files: files.map(({ relativePath, content, contentSha256 }) => ({ relativePath, content, contentSha256 })),
        omegaAuthorityBoundary: "R1_ADMITTED_READ_ONLY_EVIDENCE", authorityGranted: false };
    });
  }
}
