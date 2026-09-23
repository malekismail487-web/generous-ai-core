import { createHash } from "node:crypto";

export const BIOLOGICAL_CIRCUIT_SCHEMA_VERSION = 1 as const;
export const BIOLOGICAL_CIRCUIT_AUTHORITY = "RESEARCH_PRIOR_NOT_EXECUTION_AUTHORITY" as const;

export type BiologicalEvidenceClass = "E1" | "E2" | "E3" | "E4" | "E5";
export type BiologicalNodeRole = "INPUT" | "INTERNAL" | "OUTPUT" | "UNKNOWN";
export type BiologicalEdgeModality = "CHEMICAL" | "ELECTRICAL" | "MODULATORY" | "UNKNOWN";
export type BiologicalEdgeSign = "EXCITATORY" | "INHIBITORY" | "MIXED" | "UNKNOWN";

export interface BiologicalSourceProvenance {
  readonly datasetId: string;
  readonly organism: string;
  readonly nervousSystemRegion: string;
  readonly sourceRepository: string;
  readonly sourceCommit: string;
  readonly artifactPath: string;
  readonly artifactSha256: string;
  readonly licenseId: string;
  readonly evidenceClass: BiologicalEvidenceClass;
  readonly sourceConfidence: number;
  readonly retrievedAt: string;
}

export interface BiologicalCircuitNode {
  readonly nodeId: string;
  readonly sourceLabel: string;
  readonly role: BiologicalNodeRole;
  readonly tags: readonly string[];
}

export interface BiologicalCircuitEdge {
  readonly edgeId: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly modality: BiologicalEdgeModality;
  readonly sign: BiologicalEdgeSign;
  readonly rawWeight: number;
  readonly normalizedWeight: number;
  readonly sourceReferences: readonly string[];
}

export interface BiologicalCircuitIR {
  readonly schemaVersion: typeof BIOLOGICAL_CIRCUIT_SCHEMA_VERSION;
  readonly circuitId: string;
  readonly provenance: BiologicalSourceProvenance;
  readonly nodes: readonly BiologicalCircuitNode[];
  readonly edges: readonly BiologicalCircuitEdge[];
  readonly circuitDigest: string;
  readonly authority: typeof BIOLOGICAL_CIRCUIT_AUTHORITY;
  readonly grantsAuthority: false;
}

export interface BiologicalTopologyMetrics {
  readonly nodes: number;
  readonly edges: number;
  readonly density: number;
  readonly sparsity: number;
  readonly inputFraction: number;
  readonly outputFraction: number;
  readonly inhibitoryEdgeFraction: number;
  readonly electricalEdgeFraction: number;
  readonly reciprocalEdgeFraction: number;
  readonly recurrentCoreFraction: number;
  readonly meanNormalizedWeight: number;
  readonly outDegreeCoefficientOfVariation: number;
  readonly inDegreeCoefficientOfVariation: number;
  readonly hubOutflowConcentration: number;
  readonly maximumOutDegree: number;
  readonly maximumInDegree: number;
}

export type BiologicalMotifKind = "SPARSE_DISTRIBUTED_ROUTING" | "RECURRENT_CORE"
  | "RECIPROCAL_COUPLING" | "LATERAL_INHIBITION" | "CONVERGENT_INTEGRATION"
  | "HUB_MEDIATED_BROADCAST" | "MULTI_MODAL_COUPLING";

export interface BiologicalMotif {
  readonly motifId: string;
  readonly kind: BiologicalMotifKind;
  readonly strength: number;
  readonly support: readonly Readonly<{ datasetId: string; metric: keyof BiologicalTopologyMetrics; value: number }>[];
  readonly intendedComputationalUse: string;
  readonly falsificationCondition: string;
  readonly limitations: readonly string[];
  readonly grantsAuthority: false;
}

export interface HybridBiologicalPrior {
  readonly schemaVersion: typeof BIOLOGICAL_CIRCUIT_SCHEMA_VERSION;
  readonly priorId: string;
  readonly sourceCircuitDigests: readonly string[];
  readonly sourceDatasetIds: readonly string[];
  readonly sourceOrganisms: readonly string[];
  readonly aggregateMetrics: BiologicalTopologyMetrics;
  readonly motifs: readonly BiologicalMotif[];
  readonly priorDigest: string;
  readonly authority: typeof BIOLOGICAL_CIRCUIT_AUTHORITY;
  readonly grantsAuthority: false;
}

export interface EpistemicArchitectureProfile {
  readonly schemaVersion: typeof BIOLOGICAL_CIRCUIT_SCHEMA_VERSION;
  readonly profileId: string;
  readonly sourcePriorDigest: string;
  readonly evidenceCopiesMultiplier: number;
  readonly hypothesisCopiesMultiplier: number;
  readonly falsifierCopiesMultiplier: number;
  readonly integratorCopiesMultiplier: number;
  readonly inhibitoryCopiesMultiplier: number;
  readonly uncertaintyCopiesMultiplier: number;
  readonly actionCopiesMultiplier: number;
  readonly routingFanoutMultiplier: number;
  readonly recurrenceCyclesMultiplier: number;
  readonly profileDigest: string;
  readonly authority: typeof BIOLOGICAL_CIRCUIT_AUTHORITY;
  readonly modelCallsAdded: 0;
  readonly toolsAdded: 0;
  readonly grantsAuthority: false;
}

export type EpistemicArchitectureProfileDraft = Omit<EpistemicArchitectureProfile, "profileDigest">;

interface FlyVisNodeInput {
  readonly name?: unknown;
}
interface FlyVisEdgeInput {
  readonly src?: unknown;
  readonly tar?: unknown;
  readonly offsets?: unknown;
  readonly alpha?: unknown;
  readonly alpha_references?: unknown;
  readonly edge_type?: unknown;
}
export interface FlyVisConnectomeInput {
  readonly nodes?: unknown;
  readonly edges?: unknown;
  readonly input_units?: unknown;
  readonly output_units?: unknown;
}
export interface OpenWormConnectomeInput {
  readonly nodes?: unknown;
  readonly connections?: unknown;
}

function immutable<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
}

function bounded(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 1e12) / 1e12;
}

function rounded(value: number): number {
  return Math.round((value + Number.EPSILON) * 1e12) / 1e12;
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 240
    && /^[A-Za-z0-9][A-Za-z0-9:._/-]*$/.test(value);
}

function sourceId(label: string): string {
  const normalized = label.normalize("NFKC").replace(/[^A-Za-z0-9:._/-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!normalized) throw new Error("biological_source_label_invalid");
  return normalized.slice(0, 160);
}

function validSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function validateProvenance(provenance: BiologicalSourceProvenance): void {
  if (!provenance || !validId(provenance.datasetId) || typeof provenance.organism !== "string"
    || provenance.organism.trim().length < 3 || typeof provenance.nervousSystemRegion !== "string"
    || provenance.nervousSystemRegion.trim().length < 3 || !/^https:\/\//.test(provenance.sourceRepository)
    || !/^[a-f0-9]{40}$/i.test(provenance.sourceCommit) || typeof provenance.artifactPath !== "string"
    || provenance.artifactPath.includes("..") || !validSha256(provenance.artifactSha256)
    || typeof provenance.licenseId !== "string" || provenance.licenseId.trim().length < 2
    || !["E1", "E2", "E3", "E4", "E5"].includes(provenance.evidenceClass)
    || !Number.isFinite(provenance.sourceConfidence) || provenance.sourceConfidence < 0
    || provenance.sourceConfidence > 1 || Number.isNaN(Date.parse(provenance.retrievedAt))) {
    throw new Error("biological_source_provenance_invalid");
  }
}

function normalizeEdges(edges: readonly Omit<BiologicalCircuitEdge, "normalizedWeight">[]): readonly BiologicalCircuitEdge[] {
  const maximum = Math.max(0, ...edges.map((edge) => edge.rawWeight));
  const denominator = Math.log1p(maximum);
  return immutable(edges.map((edge) => ({ ...edge,
    normalizedWeight: denominator === 0 ? 0 : rounded(Math.log1p(edge.rawWeight) / denominator),
  })).sort((left, right) => left.edgeId.localeCompare(right.edgeId)));
}

function finalizeCircuit(circuitId: string, provenance: BiologicalSourceProvenance,
  nodes: readonly BiologicalCircuitNode[], rawEdges: readonly Omit<BiologicalCircuitEdge, "normalizedWeight">[]): BiologicalCircuitIR {
  validateProvenance(provenance);
  if (!validId(circuitId) || nodes.length < 2 || rawEdges.length < 1) throw new Error("biological_circuit_invalid");
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (!validId(node.nodeId) || typeof node.sourceLabel !== "string" || node.sourceLabel.length < 1
      || !["INPUT", "INTERNAL", "OUTPUT", "UNKNOWN"].includes(node.role)
      || !Array.isArray(node.tags) || node.tags.some((tag) => !validId(tag)) || nodeIds.has(node.nodeId)) {
      throw new Error("biological_circuit_node_invalid");
    }
    nodeIds.add(node.nodeId);
  }
  const edgeIds = new Set<string>();
  for (const edge of rawEdges) {
    if (!validId(edge.edgeId) || edgeIds.has(edge.edgeId) || !nodeIds.has(edge.sourceNodeId)
      || !nodeIds.has(edge.targetNodeId) || !["CHEMICAL", "ELECTRICAL", "MODULATORY", "UNKNOWN"].includes(edge.modality)
      || !["EXCITATORY", "INHIBITORY", "MIXED", "UNKNOWN"].includes(edge.sign)
      || !Number.isFinite(edge.rawWeight) || edge.rawWeight <= 0 || edge.sourceReferences.some((ref) => !validId(ref))) {
      throw new Error("biological_circuit_edge_invalid");
    }
    edgeIds.add(edge.edgeId);
  }
  const sortedNodes = immutable([...nodes].sort((left, right) => left.nodeId.localeCompare(right.nodeId)));
  const edges = normalizeEdges(rawEdges);
  const body = { schemaVersion: BIOLOGICAL_CIRCUIT_SCHEMA_VERSION, circuitId, provenance,
    nodes: sortedNodes, edges, authority: BIOLOGICAL_CIRCUIT_AUTHORITY, grantsAuthority: false as const };
  return immutable({ ...body, circuitDigest: sha256(body) });
}

function stringSet(value: unknown): ReadonlySet<string> {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("biological_connectome_units_invalid");
  }
  return new Set(value as string[]);
}

function offsetWeight(value: unknown): number {
  if (!Array.isArray(value)) throw new Error("flyvis_offsets_invalid");
  let total = 0;
  for (const offset of value) {
    if (!Array.isArray(offset) || offset.length !== 2 || !Array.isArray(offset[0])
      || typeof offset[1] !== "number" || !Number.isFinite(offset[1]) || offset[1] < 0) {
      throw new Error("flyvis_offsets_invalid");
    }
    total += offset[1];
  }
  return total;
}

export function importFlyVisConnectome(raw: FlyVisConnectomeInput,
  provenance: BiologicalSourceProvenance): BiologicalCircuitIR {
  if (!raw || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) throw new Error("flyvis_connectome_invalid");
  const inputs = stringSet(raw.input_units);
  const outputs = stringSet(raw.output_units);
  const labels = (raw.nodes as FlyVisNodeInput[]).map((node) => {
    if (typeof node?.name !== "string" || node.name.length < 1) throw new Error("flyvis_node_invalid");
    return node.name;
  });
  if (new Set(labels).size !== labels.length) throw new Error("flyvis_node_duplicate");
  const nodes = labels.map((label): BiologicalCircuitNode => immutable({ nodeId: sourceId(label), sourceLabel: label,
    role: inputs.has(label) ? "INPUT" : outputs.has(label) ? "OUTPUT" : "INTERNAL",
    tags: immutable(["organism:drosophila", "source:flyvis"]),
  }));
  const knownLabels = new Set(labels);
  const grouped = new Map<string, Omit<BiologicalCircuitEdge, "normalizedWeight">>();
  for (const edge of raw.edges as FlyVisEdgeInput[]) {
    if (typeof edge?.src !== "string" || typeof edge.tar !== "string" || !knownLabels.has(edge.src)
      || !knownLabels.has(edge.tar) || typeof edge.alpha !== "number" || !Number.isFinite(edge.alpha)) {
      throw new Error("flyvis_edge_invalid");
    }
    const weight = offsetWeight(edge.offsets);
    if (weight <= 0) continue;
    const modality: BiologicalEdgeModality = edge.edge_type === "chem" ? "CHEMICAL"
      : edge.edge_type === "elec" ? "ELECTRICAL" : "UNKNOWN";
    const sign: BiologicalEdgeSign = edge.alpha < 0 ? "INHIBITORY"
      : edge.alpha > 0 ? "EXCITATORY" : "UNKNOWN";
    const key = `${sourceId(edge.src)}:${sourceId(edge.tar)}:${modality}:${sign}`;
    const references = Array.isArray(edge.alpha_references)
      ? edge.alpha_references.filter((item): item is string => typeof item === "string").map(sourceId) : [];
    const previous = grouped.get(key);
    grouped.set(key, immutable({ edgeId: `${provenance.datasetId}:${key}`,
      sourceNodeId: sourceId(edge.src), targetNodeId: sourceId(edge.tar), modality, sign,
      rawWeight: (previous?.rawWeight ?? 0) + weight,
      sourceReferences: immutable([...new Set([...(previous?.sourceReferences ?? []), ...references])].sort()),
    }));
  }
  return finalizeCircuit(`${provenance.datasetId}:circuit`, provenance, nodes, [...grouped.values()]);
}

function numericMatrix(value: unknown, size: number): readonly (readonly number[])[] {
  if (!Array.isArray(value) || value.length !== size) throw new Error("openworm_matrix_invalid");
  const matrix = value as unknown[];
  if (matrix.some((row) => !Array.isArray(row) || row.length !== size
    || row.some((cell) => typeof cell !== "number" || !Number.isFinite(cell) || cell < 0))) {
    throw new Error("openworm_matrix_invalid");
  }
  return matrix as readonly (readonly number[])[];
}

export function importOpenWormConnectome(raw: OpenWormConnectomeInput,
  provenance: BiologicalSourceProvenance): BiologicalCircuitIR {
  if (!raw || !Array.isArray(raw.nodes) || raw.nodes.some((node) => typeof node !== "string")
    || typeof raw.connections !== "object" || raw.connections === null || Array.isArray(raw.connections)) {
    throw new Error("openworm_connectome_invalid");
  }
  const labels = raw.nodes as string[];
  if (labels.length < 2 || new Set(labels).size !== labels.length) throw new Error("openworm_node_invalid");
  const connections = raw.connections as Record<string, unknown>;
  const supported = Object.entries(connections).filter(([kind]) => ["Generic_GJ", "Generic_CS"].includes(kind));
  if (supported.length === 0) throw new Error("openworm_connection_layer_missing");
  const nodes = labels.map((label): BiologicalCircuitNode => immutable({ nodeId: sourceId(label), sourceLabel: label,
    role: "UNKNOWN", tags: immutable(["organism:caenorhabditis-elegans", "source:openworm"]),
  }));
  const edges: Omit<BiologicalCircuitEdge, "normalizedWeight">[] = [];
  for (const [kind, rawMatrix] of supported) {
    const matrix = numericMatrix(rawMatrix, labels.length);
    const modality: BiologicalEdgeModality = kind === "Generic_GJ" ? "ELECTRICAL" : "CHEMICAL";
    for (let source = 0; source < labels.length; source += 1) {
      for (let target = 0; target < labels.length; target += 1) {
        const weight = matrix[source][target];
        if (weight <= 0) continue;
        const sourceNodeId = sourceId(labels[source]);
        const targetNodeId = sourceId(labels[target]);
        edges.push(immutable({ edgeId: `${provenance.datasetId}:${kind}:${sourceNodeId}:${targetNodeId}`,
          sourceNodeId, targetNodeId, modality, sign: "UNKNOWN", rawWeight: weight,
          sourceReferences: immutable([sourceId(kind)]),
        }));
      }
    }
  }
  return finalizeCircuit(`${provenance.datasetId}:circuit`, provenance, nodes, edges);
}

function coefficientOfVariation(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return rounded(Math.sqrt(variance) / mean);
}

function largestStronglyConnectedFraction(circuit: BiologicalCircuitIR): number {
  const outgoing = new Map(circuit.nodes.map((node) => [node.nodeId, [] as string[]]));
  for (const edge of circuit.edges) outgoing.get(edge.sourceNodeId)?.push(edge.targetNodeId);
  for (const targets of outgoing.values()) targets.sort();
  let nextIndex = 0;
  const indices = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  let largest = 0;
  const visit = (node: string): void => {
    indices.set(node, nextIndex); low.set(node, nextIndex); nextIndex += 1;
    stack.push(node); onStack.add(node);
    for (const target of outgoing.get(node) ?? []) {
      if (!indices.has(target)) { visit(target); low.set(node, Math.min(low.get(node)!, low.get(target)!)); }
      else if (onStack.has(target)) low.set(node, Math.min(low.get(node)!, indices.get(target)!));
    }
    if (low.get(node) !== indices.get(node)) return;
    let size = 0;
    while (stack.length > 0) {
      const member = stack.pop()!; onStack.delete(member); size += 1;
      if (member === node) break;
    }
    largest = Math.max(largest, size);
  };
  for (const node of circuit.nodes.map((item) => item.nodeId).sort()) if (!indices.has(node)) visit(node);
  return bounded(largest / circuit.nodes.length);
}

export function analyzeBiologicalTopology(circuit: BiologicalCircuitIR): BiologicalTopologyMetrics {
  if (!validBiologicalCircuit(circuit)) throw new Error("biological_circuit_invalid");
  const outgoing = new Map(circuit.nodes.map((node) => [node.nodeId, 0]));
  const incoming = new Map(circuit.nodes.map((node) => [node.nodeId, 0]));
  const directed = new Set(circuit.edges.map((edge) => `${edge.sourceNodeId}\0${edge.targetNodeId}`));
  let reciprocal = 0;
  for (const edge of circuit.edges) {
    outgoing.set(edge.sourceNodeId, outgoing.get(edge.sourceNodeId)! + 1);
    incoming.set(edge.targetNodeId, incoming.get(edge.targetNodeId)! + 1);
    if (directed.has(`${edge.targetNodeId}\0${edge.sourceNodeId}`)) reciprocal += 1;
  }
  const outDegrees = [...outgoing.values()];
  const inDegrees = [...incoming.values()];
  const sortedOut = [...outDegrees].sort((left, right) => right - left);
  const hubCount = Math.max(1, Math.ceil(sortedOut.length * 0.1));
  const allOut = sortedOut.reduce((sum, value) => sum + value, 0);
  const possible = circuit.nodes.length * Math.max(1, circuit.nodes.length - 1);
  const density = bounded(circuit.edges.filter((edge) => edge.sourceNodeId !== edge.targetNodeId).length / possible);
  return immutable({ nodes: circuit.nodes.length, edges: circuit.edges.length, density, sparsity: bounded(1 - density),
    inputFraction: bounded(circuit.nodes.filter((node) => node.role === "INPUT").length / circuit.nodes.length),
    outputFraction: bounded(circuit.nodes.filter((node) => node.role === "OUTPUT").length / circuit.nodes.length),
    inhibitoryEdgeFraction: bounded(circuit.edges.filter((edge) => edge.sign === "INHIBITORY").length / circuit.edges.length),
    electricalEdgeFraction: bounded(circuit.edges.filter((edge) => edge.modality === "ELECTRICAL").length / circuit.edges.length),
    reciprocalEdgeFraction: bounded(reciprocal / circuit.edges.length),
    recurrentCoreFraction: largestStronglyConnectedFraction(circuit),
    meanNormalizedWeight: rounded(circuit.edges.reduce((sum, edge) => sum + edge.normalizedWeight, 0) / circuit.edges.length),
    outDegreeCoefficientOfVariation: coefficientOfVariation(outDegrees),
    inDegreeCoefficientOfVariation: coefficientOfVariation(inDegrees),
    hubOutflowConcentration: allOut === 0 ? 0 : bounded(sortedOut.slice(0, hubCount)
      .reduce((sum, value) => sum + value, 0) / allOut),
    maximumOutDegree: Math.max(0, ...outDegrees), maximumInDegree: Math.max(0, ...inDegrees),
  });
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : rounded(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function aggregateMetrics(metrics: readonly BiologicalTopologyMetrics[]): BiologicalTopologyMetrics {
  const numeric = (key: keyof BiologicalTopologyMetrics) => mean(metrics.map((item) => item[key]));
  return immutable({ nodes: Math.round(numeric("nodes")), edges: Math.round(numeric("edges")),
    density: numeric("density"), sparsity: numeric("sparsity"), inputFraction: numeric("inputFraction"),
    outputFraction: numeric("outputFraction"), inhibitoryEdgeFraction: numeric("inhibitoryEdgeFraction"),
    electricalEdgeFraction: numeric("electricalEdgeFraction"), reciprocalEdgeFraction: numeric("reciprocalEdgeFraction"),
    recurrentCoreFraction: numeric("recurrentCoreFraction"), meanNormalizedWeight: numeric("meanNormalizedWeight"),
    outDegreeCoefficientOfVariation: numeric("outDegreeCoefficientOfVariation"),
    inDegreeCoefficientOfVariation: numeric("inDegreeCoefficientOfVariation"),
    hubOutflowConcentration: numeric("hubOutflowConcentration"), maximumOutDegree: Math.round(numeric("maximumOutDegree")),
    maximumInDegree: Math.round(numeric("maximumInDegree")),
  });
}

function motif(kind: BiologicalMotifKind, strength: number, circuits: readonly BiologicalCircuitIR[],
  metrics: readonly BiologicalTopologyMetrics[], metric: keyof BiologicalTopologyMetrics,
  intendedComputationalUse: string, falsificationCondition: string, limitations: readonly string[]): BiologicalMotif {
  return immutable({ motifId: `motif:${kind.toLowerCase().replace(/_/g, "-")}`, kind, strength: bounded(strength),
    support: circuits.map((circuit, index) => immutable({ datasetId: circuit.provenance.datasetId,
      metric, value: metrics[index][metric] })), intendedComputationalUse, falsificationCondition,
    limitations: immutable([...limitations]), grantsAuthority: false as const });
}

export function compileHybridBiologicalPrior(circuits: readonly BiologicalCircuitIR[], priorId: string): HybridBiologicalPrior {
  if (!validId(priorId) || circuits.length < 2 || circuits.some((circuit) => !validBiologicalCircuit(circuit))
    || new Set(circuits.map((circuit) => circuit.provenance.datasetId)).size !== circuits.length
    || new Set(circuits.map((circuit) => circuit.provenance.organism)).size < 2) {
    throw new Error("hybrid_biological_prior_sources_invalid");
  }
  const ordered = [...circuits].sort((left, right) => left.provenance.datasetId.localeCompare(right.provenance.datasetId));
  const metrics = ordered.map(analyzeBiologicalTopology);
  const aggregate = aggregateMetrics(metrics);
  const motifs = immutable([
    motif("SPARSE_DISTRIBUTED_ROUTING", aggregate.sparsity, ordered, metrics, "sparsity",
      "Route evidence through bounded sparse projections instead of all-to-all communication.",
      "Matched ablation shows no capability, robustness, or efficiency gain from sparse routing.",
      ["Anatomical sparsity does not prove the same sparsity is optimal for symbolic reasoning."]),
    motif("RECURRENT_CORE", aggregate.recurrentCoreFraction, ordered, metrics, "recurrentCoreFraction",
      "Permit bounded recurrent integration for revision and temporal evidence accumulation.",
      "Recurrence increases instability or cost without matched capability improvement.",
      ["Strong connectivity is a structural observation, not evidence of consciousness or general intelligence."]),
    motif("RECIPROCAL_COUPLING", aggregate.reciprocalEdgeFraction, ordered, metrics, "reciprocalEdgeFraction",
      "Support bidirectional proposal-critique exchange while retaining separate provenance.",
      "Reciprocal exchange increases correlated error or groupthink relative to one-way baselines.",
      ["Electrical and chemical reciprocity have different biological meanings that are compressed here."]),
    motif("LATERAL_INHIBITION", aggregate.inhibitoryEdgeFraction, ordered, metrics, "inhibitoryEdgeFraction",
      "Suppress mutually incompatible hypotheses while preserving explicitly protected minority branches.",
      "Inhibition prematurely removes correct minority hypotheses on held-out tasks.",
      ["Unknown transmitter signs are not inferred; this strength can therefore be an underestimate."]),
    motif("CONVERGENT_INTEGRATION", bounded(aggregate.inDegreeCoefficientOfVariation / 3), ordered, metrics,
      "inDegreeCoefficientOfVariation", "Allocate integrators where diverse evidence streams converge.",
      "Convergence-aware allocation fails to improve evidence synthesis at matched compute.",
      ["High indegree can reflect anatomical scale rather than causal importance."]),
    motif("HUB_MEDIATED_BROADCAST", aggregate.hubOutflowConcentration, ordered, metrics, "hubOutflowConcentration",
      "Use bounded routing hubs for high-value, broadly relevant evidence without granting authority.",
      "Hub routing creates bottlenecks, correlated failures, or worse capability-per-compute.",
      ["Biological hubs must not become unreviewed software authorities."]),
    motif("MULTI_MODAL_COUPLING", aggregate.electricalEdgeFraction, ordered, metrics, "electricalEdgeFraction",
      "Preserve distinct fast-coupling and evidence-bearing channels in the digital architecture.",
      "Separate coupling channels provide no reliable improvement over a single typed channel.",
      ["The current digital substrate simulates motifs, not biophysical ion-channel dynamics."]),
  ]);
  const body = { schemaVersion: BIOLOGICAL_CIRCUIT_SCHEMA_VERSION, priorId,
    sourceCircuitDigests: immutable(ordered.map((circuit) => circuit.circuitDigest)),
    sourceDatasetIds: immutable(ordered.map((circuit) => circuit.provenance.datasetId)),
    sourceOrganisms: immutable(ordered.map((circuit) => circuit.provenance.organism)),
    aggregateMetrics: aggregate, motifs, authority: BIOLOGICAL_CIRCUIT_AUTHORITY, grantsAuthority: false as const };
  return immutable({ ...body, priorDigest: sha256(body) });
}

function multiplier(value: number, amplitude: number): number {
  return rounded(1 + (bounded(value) - 0.5) * amplitude);
}

export function sealEpistemicArchitectureProfile(
  draft: EpistemicArchitectureProfileDraft,
): EpistemicArchitectureProfile {
  const profile = immutable({ ...draft, profileDigest: sha256(draft) });
  if (!validEpistemicArchitectureProfile(profile)) {
    throw new Error("epistemic_architecture_profile_draft_invalid");
  }
  return profile;
}

export function compileEpistemicArchitectureProfileFromMetrics(input: {
  readonly profileId: string;
  readonly sourceDigest: string;
  readonly metrics: BiologicalTopologyMetrics;
}): EpistemicArchitectureProfile {
  if (!validId(input.profileId) || !validSha256(input.sourceDigest)) {
    throw new Error("epistemic_architecture_profile_identity_invalid");
  }
  const metric = input.metrics;
  const finiteMetrics = Object.values(metric);
  if (metric.nodes < 2 || metric.edges < 1 || finiteMetrics.some((value) => typeof value !== "number"
    || !Number.isFinite(value) || value < 0)) {
    throw new Error("epistemic_architecture_profile_metrics_invalid");
  }
  return sealEpistemicArchitectureProfile({ schemaVersion: BIOLOGICAL_CIRCUIT_SCHEMA_VERSION,
    profileId: input.profileId, sourcePriorDigest: input.sourceDigest,
    evidenceCopiesMultiplier: multiplier(metric.sparsity, 0.35),
    hypothesisCopiesMultiplier: multiplier(metric.recurrentCoreFraction, 0.3),
    falsifierCopiesMultiplier: multiplier(metric.inhibitoryEdgeFraction, 0.5),
    integratorCopiesMultiplier: multiplier(bounded(metric.inDegreeCoefficientOfVariation / 3), 0.35),
    inhibitoryCopiesMultiplier: multiplier(metric.inhibitoryEdgeFraction, 0.8),
    uncertaintyCopiesMultiplier: multiplier(1 - metric.meanNormalizedWeight, 0.25),
    actionCopiesMultiplier: multiplier(1 - metric.hubOutflowConcentration, 0.2),
    routingFanoutMultiplier: multiplier(1 - metric.sparsity, 0.5),
    recurrenceCyclesMultiplier: multiplier(metric.recurrentCoreFraction, 0.4),
    authority: BIOLOGICAL_CIRCUIT_AUTHORITY,
    modelCallsAdded: 0, toolsAdded: 0, grantsAuthority: false });
}

export function compileEpistemicArchitectureProfile(prior: HybridBiologicalPrior): EpistemicArchitectureProfile {
  if (!validHybridBiologicalPrior(prior)) throw new Error("hybrid_biological_prior_invalid");
  return compileEpistemicArchitectureProfileFromMetrics({
    profileId: `${prior.priorId}:epistemic-profile`,
    sourceDigest: prior.priorDigest,
    metrics: prior.aggregateMetrics,
  });
}

export function validEpistemicArchitectureProfile(profile: EpistemicArchitectureProfile): boolean {
  if (!profile || profile.schemaVersion !== BIOLOGICAL_CIRCUIT_SCHEMA_VERSION
    || profile.authority !== BIOLOGICAL_CIRCUIT_AUTHORITY || profile.grantsAuthority !== false
    || profile.modelCallsAdded !== 0 || profile.toolsAdded !== 0 || !validId(profile.profileId)
    || !validSha256(profile.sourcePriorDigest) || !validSha256(profile.profileDigest)) return false;
  const multipliers = [profile.evidenceCopiesMultiplier, profile.hypothesisCopiesMultiplier,
    profile.falsifierCopiesMultiplier, profile.integratorCopiesMultiplier,
    profile.inhibitoryCopiesMultiplier, profile.uncertaintyCopiesMultiplier,
    profile.actionCopiesMultiplier, profile.routingFanoutMultiplier,
    profile.recurrenceCyclesMultiplier];
  if (multipliers.some((value) => typeof value !== "number" || !Number.isFinite(value)
    || value < 0.5 || value > 1.5)) return false;
  const { profileDigest: _digest, ...body } = profile;
  return sha256(body) === profile.profileDigest;
}

export function validBiologicalCircuit(circuit: BiologicalCircuitIR): boolean {
  try {
    if (!circuit || circuit.schemaVersion !== BIOLOGICAL_CIRCUIT_SCHEMA_VERSION
      || circuit.authority !== BIOLOGICAL_CIRCUIT_AUTHORITY || circuit.grantsAuthority !== false
      || !validSha256(circuit.circuitDigest)) return false;
    const reconstructed = finalizeCircuit(circuit.circuitId, circuit.provenance, circuit.nodes,
      circuit.edges.map(({ normalizedWeight: _normalizedWeight, ...edge }) => edge));
    return reconstructed.circuitDigest === circuit.circuitDigest && canonical(reconstructed) === canonical(circuit);
  } catch { return false; }
}

export function validHybridBiologicalPrior(prior: HybridBiologicalPrior): boolean {
  if (!prior || prior.schemaVersion !== BIOLOGICAL_CIRCUIT_SCHEMA_VERSION
    || prior.authority !== BIOLOGICAL_CIRCUIT_AUTHORITY || prior.grantsAuthority !== false
    || !validId(prior.priorId) || !validSha256(prior.priorDigest) || prior.sourceCircuitDigests.length < 2
    || prior.sourceCircuitDigests.some((digest) => !validSha256(digest)) || prior.sourceOrganisms.length < 2
    || prior.motifs.length !== 7 || prior.motifs.some((item) => item.grantsAuthority !== false)) return false;
  const { priorDigest: _digest, ...body } = prior;
  return sha256(body) === prior.priorDigest;
}
