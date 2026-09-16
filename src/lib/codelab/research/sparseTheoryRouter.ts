import { immutableTheoryValue, theoryDigest } from "./theoryContracts";
import { researchObjectiveDigest, type ResearchPartyObjective, type TheoryPerspectiveAssignment,
  type TheoryPerspectiveId, type TheoryPerspectiveRoute } from "./researchPartyContracts";

export interface TheoryPerspectiveRouter {
  readonly route: (objective: ResearchPartyObjective, investigatorCount: number) => TheoryPerspectiveRoute;
}

interface PerspectiveDefinition {
  readonly perspectiveId: TheoryPerspectiveId;
  readonly instruction: string;
  readonly cues: readonly string[];
  readonly domainPriors: Readonly<Record<ResearchPartyObjective["domain"], number>>;
}

const perspective = (perspectiveId: TheoryPerspectiveId, instruction: string, cues: readonly string[],
  software = 0, mathematics = 0, science = 0): PerspectiveDefinition => Object.freeze({
  perspectiveId, instruction, cues: Object.freeze([...cues]),
  domainPriors: Object.freeze({ SOFTWARE: software, MATHEMATICS: mathematics, SCIENCE: science }),
});

/**
 * These are reasoning lenses, not agents and not authorities. The pool is deliberately
 * broader than the active party. A small deterministic subset is activated per objective.
 *
 * Biological inspiration is limited to a computational motif: sparse combinatorial
 * activation and compartment-local specialization, as observed in the Drosophila
 * mushroom body. This module makes no claim of biological fidelity or brain emulation.
 */
const PERSPECTIVES: readonly PerspectiveDefinition[] = Object.freeze([
  perspective("STATE_TRANSITION", "Trace legal and illegal state transitions, terminal states, and transition invariants.",
    ["state", "transition", "status", "terminal", "phase", "dispatch", "workflow", "lifecycle"], 3, 1, 1),
  perspective("BOUNDARY_ADVERSARY", "Attack boundary conditions, malformed inputs, empty/extreme values, and scope escapes.",
    ["boundary", "malformed", "invalid", "empty", "maximum", "minimum", "overflow", "escape", "scope", "edge"], 3, 2, 1),
  perspective("DATA_CONTROL_FLOW", "Trace data provenance and control flow from inputs through decisions to outputs.",
    ["data", "control", "flow", "branch", "provenance", "input", "output", "dependency", "dispatch", "pipeline"], 3, 1, 2),
  perspective("INTEGRATION_EFFECT", "Inspect interfaces, callers, downstream effects, compatibility, and subsystem coupling.",
    ["integration", "interface", "caller", "downstream", "compatibility", "dependency", "service", "module", "api"], 3, 0, 2),
  perspective("CONCURRENCY_ORDERING", "Model interleavings, races, atomicity, ordering, locks, and lost updates.",
    ["concurrent", "concurrency", "race", "atomic", "ordering", "interleaving", "lock", "deadlock", "parallel", "lost"], 3, 1, 2),
  perspective("RESOURCE_LIFECYCLE", "Trace acquisition, ownership, release, cleanup, quotas, and leak behavior.",
    ["resource", "acquire", "release", "cleanup", "leak", "handle", "memory", "quota", "dispose", "ownership"], 3, 1, 2),
  perspective("IDENTITY_AUTHORIZATION", "Separate identity, authentication, authorization, capability scope, and revocation.",
    ["identity", "authentication", "authorization", "credential", "capability", "permission", "scope", "revoke", "token", "access"], 3, 0, 1),
  perspective("TEMPORAL_EXPIRY", "Reason about clocks, deadlines, expiry, retries, freshness, and time-of-check/time-of-use.",
    ["time", "clock", "deadline", "expiry", "expired", "retry", "fresh", "stale", "timeout", "toctou"], 3, 1, 2),
  perspective("NUMERICAL_INVARIANT", "Derive dimensional, algebraic, conservation, stability, precision, and range invariants.",
    ["numeric", "number", "algebra", "equation", "precision", "range", "conservation", "stability", "dimension", "overflow"], 1, 4, 3),
  perspective("CAUSAL_INTERVENTION", "Distinguish correlation from mechanism and choose interventions that separate rival causes.",
    ["causal", "cause", "mechanism", "intervention", "experiment", "confound", "counterfactual", "treatment", "effect", "hypothesis"], 1, 3, 4),
  perspective("REPRESENTATION_ENCODING", "Inspect schemas, parsing, serialization, normalization, units, and information loss.",
    ["representation", "encoding", "parse", "parser", "serialize", "schema", "unicode", "normalization", "unit", "format"], 3, 2, 2),
  perspective("ENVIRONMENT_VARIANCE", "Compare runtime, platform, filesystem, dependency, configuration, and hardware differences.",
    ["environment", "runtime", "platform", "filesystem", "configuration", "dependency", "version", "hardware", "operating", "host"], 3, 0, 3),
]);

const BASELINE_IDS: readonly TheoryPerspectiveId[] = Object.freeze([
  "STATE_TRANSITION", "BOUNDARY_ADVERSARY", "DATA_CONTROL_FLOW", "INTEGRATION_EFFECT",
]);

const DEFINITION_BY_ID = new Map(PERSPECTIVES.map((item) => [item.perspectiveId, item]));
const ROUTE_KEYS = ["schemaVersion", "algorithmId", "objectiveDigest", "inputFeatureDigest", "inputFeatureCount",
  "candidatePerspectiveCount", "assignments", "sparseActivationRatio", "grantsAuthority"] as const;
const ASSIGNMENT_KEYS = ["perspectiveId", "ordinal", "instruction", "relevantCues", "relevanceScore", "noveltyScore"] as const;

function exactKeys(value: unknown, expected: readonly string[]): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === expected.length
    && expected.every((key) => Object.prototype.hasOwnProperty.call(value, key)));
}

function tokens(value: string): readonly string[] {
  return Object.freeze([...new Set(value.toLowerCase().normalize("NFKC")
    .replace(/[^a-z0-9]+/g, " ").split(" ").map((item) => item.trim()).filter((item) => item.length >= 3))].sort());
}

function objectiveText(objective: ResearchPartyObjective): string {
  return [objective.objective, ...objective.scope, ...objective.successCriteria,
    ...objective.mechanismCatalog.flatMap((item) => [item.mechanismId, item.description]),
    ...objective.admittedEvidence.map((item) => item.summary),
    ...objective.experimentCatalog.flatMap((item) => [item.question, item.toolId, ...item.possibleOutcomes])].join(" ");
}

function cueHits(inputTokens: ReadonlySet<string>, definition: PerspectiveDefinition): readonly string[] {
  return Object.freeze(definition.cues.filter((cue) => {
    const normalized = cue.toLowerCase();
    return inputTokens.has(normalized) || [...inputTokens].some((token) => token.startsWith(normalized)
      || normalized.startsWith(token));
  }).sort());
}

function jaccardDistance(left: readonly string[], right: readonly string[]): number {
  const a = new Set(left); const b = new Set(right);
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 1;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return (union.size - intersection) / union.size;
}

function assignment(definition: PerspectiveDefinition, ordinal: number, relevantCues: readonly string[],
  relevanceScore: number, noveltyScore: number): TheoryPerspectiveAssignment {
  return immutableTheoryValue({ perspectiveId: definition.perspectiveId, ordinal,
    instruction: definition.instruction, relevantCues, relevanceScore, noveltyScore });
}

function validCount(investigatorCount: number): void {
  if (!Number.isSafeInteger(investigatorCount) || investigatorCount < 2 || investigatorCount > 62) {
    throw new Error("theory_perspective_count_invalid");
  }
}

export function validTheoryPerspectiveRoute(route: TheoryPerspectiveRoute, objective: ResearchPartyObjective,
  investigatorCount: number): boolean {
  if (!route || !exactKeys(route, ROUTE_KEYS) || route.schemaVersion !== 1
    || !["FIXED_ROTATION_V1", "SPARSE_RELEVANCE_DIVERSITY_V1"].includes(route.algorithmId)
    || route.objectiveDigest !== researchObjectiveDigest(objective)
    || !/^[a-f0-9]{64}$/.test(route.inputFeatureDigest)
    || !Number.isSafeInteger(route.inputFeatureCount) || route.inputFeatureCount < 1
    || !Number.isSafeInteger(route.candidatePerspectiveCount) || route.candidatePerspectiveCount < 2
    || route.candidatePerspectiveCount > PERSPECTIVES.length
    || !Array.isArray(route.assignments) || route.assignments.length !== investigatorCount
    || typeof route.sparseActivationRatio !== "number" || !Number.isFinite(route.sparseActivationRatio)
    || route.sparseActivationRatio <= 0 || route.sparseActivationRatio > 1 || route.grantsAuthority !== false) return false;
  const ordinals = new Set<number>();
  for (const item of route.assignments) {
    if (!exactKeys(item, ASSIGNMENT_KEYS) || !DEFINITION_BY_ID.has(item.perspectiveId)
      || !Number.isSafeInteger(item.ordinal) || item.ordinal < 0 || item.ordinal >= investigatorCount
      || ordinals.has(item.ordinal) || typeof item.instruction !== "string" || item.instruction.length < 10
      || item.instruction.length > 1_000 || !Array.isArray(item.relevantCues) || item.relevantCues.length > 32
      || item.relevantCues.some((cue) => typeof cue !== "string" || cue.length < 1 || cue.length > 100)
      || !Number.isFinite(item.relevanceScore) || item.relevanceScore < 0
      || !Number.isFinite(item.noveltyScore) || item.noveltyScore < 0 || item.noveltyScore > 1) return false;
    ordinals.add(item.ordinal);
  }
  return ordinals.size === investigatorCount;
}

/** Existing fixed rotation, retained as an explicit ablation rather than silently deleted. */
export function routeFixedTheoryPerspectives(objective: ResearchPartyObjective,
  investigatorCount: number): TheoryPerspectiveRoute {
  validCount(investigatorCount);
  const input = tokens(objectiveText(objective));
  const assignments = Array.from({ length: investigatorCount }, (_, ordinal) => {
    const definition = DEFINITION_BY_ID.get(BASELINE_IDS[ordinal % BASELINE_IDS.length])!;
    return assignment(definition, ordinal, [], 0, 0);
  });
  return immutableTheoryValue({ schemaVersion: 1, algorithmId: "FIXED_ROTATION_V1",
    objectiveDigest: researchObjectiveDigest(objective), inputFeatureDigest: theoryDigest(input),
    inputFeatureCount: input.length, candidatePerspectiveCount: BASELINE_IDS.length,
    assignments, sparseActivationRatio: Math.min(assignments.length, BASELINE_IDS.length) / BASELINE_IDS.length,
    grantsAuthority: false as const });
}

/**
 * Greedy sparse routing. Relevance activates task-linked compartments; marginal
 * cue distance prevents all slots collapsing onto near-identical lenses. It is
 * deterministic, bounded, authority-neutral, and has no model or tool access.
 */
export function routeSparseTheoryPerspectives(objective: ResearchPartyObjective,
  investigatorCount: number): TheoryPerspectiveRoute {
  validCount(investigatorCount);
  const input = tokens(objectiveText(objective));
  const inputSet = new Set(input);
  const candidates = PERSPECTIVES.map((definition) => {
    const relevantCues = cueHits(inputSet, definition);
    return { definition, relevantCues,
      relevanceScore: relevantCues.length * 100 + definition.domainPriors[objective.domain] };
  });
  const selected: Array<{ definition: PerspectiveDefinition; relevantCues: readonly string[];
    relevanceScore: number; noveltyScore: number }> = [];
  while (selected.length < Math.min(investigatorCount, candidates.length)) {
    const remaining = candidates.filter((candidate) => !selected.some((item) =>
      item.definition.perspectiveId === candidate.definition.perspectiveId));
    const ranked = remaining.map((candidate) => {
      const noveltyScore = selected.length === 0 ? 1 : Math.min(...selected.map((prior) =>
        jaccardDistance(candidate.definition.cues, prior.definition.cues)));
      const marginalScore = candidate.relevanceScore * 10 + Math.round(noveltyScore * 100);
      return { ...candidate, noveltyScore, marginalScore };
    }).sort((left, right) => right.marginalScore - left.marginalScore
      || right.relevanceScore - left.relevanceScore
      || left.definition.perspectiveId.localeCompare(right.definition.perspectiveId));
    selected.push(ranked[0]);
  }
  const assignments: TheoryPerspectiveAssignment[] = selected.map((item, ordinal) => assignment(item.definition,
    ordinal, item.relevantCues, item.relevanceScore, item.noveltyScore));
  for (let ordinal = assignments.length; ordinal < investigatorCount; ordinal += 1) {
    const source = selected[ordinal % selected.length];
    assignments.push(assignment(source.definition, ordinal, source.relevantCues,
      source.relevanceScore, source.noveltyScore));
  }
  return immutableTheoryValue({ schemaVersion: 1, algorithmId: "SPARSE_RELEVANCE_DIVERSITY_V1",
    objectiveDigest: researchObjectiveDigest(objective), inputFeatureDigest: theoryDigest(input),
    inputFeatureCount: input.length, candidatePerspectiveCount: PERSPECTIVES.length, assignments,
    sparseActivationRatio: Math.min(investigatorCount, PERSPECTIVES.length) / PERSPECTIVES.length,
    grantsAuthority: false as const });
}

export const sparseTheoryPerspectiveRouter: TheoryPerspectiveRouter = Object.freeze({ route: routeSparseTheoryPerspectives });
export const fixedTheoryPerspectiveRouter: TheoryPerspectiveRouter = Object.freeze({ route: routeFixedTheoryPerspectives });
