export const AUTHORITY_RELATION_KINDS = Object.freeze([
  "REQUIRES", "IMPLIES", "CONFLICTS_WITH", "FORBIDDEN_WITH", "BOUNDED_BY", "EXPIRES_WITH",
] as const);
export type AuthorityRelationKind = (typeof AUTHORITY_RELATION_KINDS)[number];
export type AuthorityNodeKind = "AUTHORITY" | "AUTHORIZATION" | "BOUNDARY" | "LIFETIME";

export interface AuthorityNode {
  readonly nodeId: string;
  readonly kind: AuthorityNodeKind;
  readonly currentState: "VERIFIED" | "UNAVAILABLE" | "FORBIDDEN" | "CONDITION";
}
export interface AuthorityEdge { readonly from: string; readonly relation: AuthorityRelationKind; readonly to: string }
export interface AuthorityGraph { readonly schemaVersion: 1; readonly graphId: string; readonly nodes: readonly AuthorityNode[]; readonly edges: readonly AuthorityEdge[] }
export interface AuthorityClosureAnalysis {
  readonly decision: "ACCEPT" | "REJECT" | "INSUFFICIENT_EVIDENCE";
  readonly effectiveAuthorities: readonly string[];
  readonly unmetRequirements: readonly string[];
  readonly conflicts: readonly string[];
  readonly forbiddenAuthoritiesReached: readonly string[];
  readonly boundaries: readonly string[];
  readonly expiries: readonly string[];
  readonly graphIssues: readonly string[];
  readonly grantsAuthority: false;
}

function unique(values: readonly string[]): readonly string[] { return [...new Set(values)].sort(); }
export function validateAuthorityGraph(graph: AuthorityGraph): readonly string[] {
  const issues: string[] = [];
  if (graph.schemaVersion !== 1 || !graph.graphId.trim()) issues.push("invalid_graph_identity");
  const ids = graph.nodes.map((node) => node.nodeId);
  if (new Set(ids).size !== ids.length) issues.push("duplicate_authority_node");
  const nodeIds = new Set(ids);
  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    const identity = `${edge.from}:${edge.relation}:${edge.to}`;
    if (edgeIds.has(identity)) issues.push(`duplicate_authority_edge:${identity}`); else edgeIds.add(identity);
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) issues.push(`unknown_authority_edge_node:${identity}`);
    if (edge.from === edge.to) issues.push(`self_authority_edge:${identity}`);
  }
  return unique(issues);
}

export function analyzeAuthorityClosure(
  graph: AuthorityGraph,
  initiallyGranted: readonly string[],
  satisfiedConditions: readonly string[] = [],
): AuthorityClosureAnalysis {
  const graphIssues = validateAuthorityGraph(graph);
  const nodes = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  const effective = new Set<string>();
  const unknown = initiallyGranted.filter((id) => !nodes.has(id));
  for (const authority of initiallyGranted) if (nodes.get(authority)?.kind === "AUTHORITY") effective.add(authority);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of graph.edges) if (edge.relation === "IMPLIES" && effective.has(edge.from) && nodes.get(edge.to)?.kind === "AUTHORITY" && !effective.has(edge.to)) {
      effective.add(edge.to); changed = true;
    }
  }
  const active = new Set([...effective, ...satisfiedConditions]);
  const unmetRequirements = graph.edges.filter((edge) => edge.relation === "REQUIRES" && effective.has(edge.from) && !active.has(edge.to)).map((edge) => `${edge.from}->${edge.to}`);
  const conflicts = graph.edges.filter((edge) => ["CONFLICTS_WITH", "FORBIDDEN_WITH"].includes(edge.relation) && active.has(edge.from) && active.has(edge.to)).map((edge) => `${edge.from}:${edge.relation}:${edge.to}`);
  const forbiddenAuthoritiesReached = [...effective].filter((id) => nodes.get(id)?.currentState === "FORBIDDEN");
  const boundaries = graph.edges.filter((edge) => edge.relation === "BOUNDED_BY" && effective.has(edge.from)).map((edge) => `${edge.from}->${edge.to}`);
  const expiries = graph.edges.filter((edge) => edge.relation === "EXPIRES_WITH" && effective.has(edge.from)).map((edge) => `${edge.from}->${edge.to}`);
  const insufficient = [...graphIssues, ...unknown.map((id) => `unknown_initial_authority:${id}`)];
  const rejected = [...unmetRequirements, ...conflicts, ...forbiddenAuthoritiesReached];
  return Object.freeze({
    decision: rejected.length > 0 ? "REJECT" : insufficient.length > 0 ? "INSUFFICIENT_EVIDENCE" : "ACCEPT",
    effectiveAuthorities: unique([...effective]), unmetRequirements: unique(unmetRequirements), conflicts: unique(conflicts),
    forbiddenAuthoritiesReached: unique(forbiddenAuthoritiesReached), boundaries: unique(boundaries), expiries: unique(expiries),
    graphIssues: unique(insufficient), grantsAuthority: false,
  });
}

function node(nodeId: string, kind: AuthorityNodeKind, currentState: AuthorityNode["currentState"]): AuthorityNode { return Object.freeze({ nodeId, kind, currentState }); }
function edge(from: string, relation: AuthorityRelationKind, to: string): AuthorityEdge { return Object.freeze({ from, relation, to }); }
export const OMEGA_AUTHORITY_GRAPH_001 = Object.freeze<AuthorityGraph>({
  schemaVersion: 1, graphId: "OMEGA-AUTHORITY-GRAPH-001",
  nodes: [
    node("READ_REPOSITORY", "AUTHORITY", "VERIFIED"), node("R2_A_AUTHORIZATION", "AUTHORIZATION", "CONDITION"),
    node("PROVISION_SANDBOX", "AUTHORITY", "UNAVAILABLE"), node("TERMINATE_SANDBOX", "AUTHORITY", "UNAVAILABLE"),
    node("WRITE_SANDBOX", "AUTHORITY", "UNAVAILABLE"), node("WRITE_SANDBOX_CONTENT", "AUTHORITY", "UNAVAILABLE"),
    node("WRITE_REPOSITORY", "AUTHORITY", "FORBIDDEN"), node("SHELL", "AUTHORITY", "FORBIDDEN"), node("NETWORK", "AUTHORITY", "FORBIDDEN"),
    node("CREDENTIAL_ACCESS", "AUTHORITY", "FORBIDDEN"), node("PACKAGE_INSTALL", "AUTHORITY", "FORBIDDEN"), node("DEPLOYMENT", "AUTHORITY", "FORBIDDEN"),
    node("APPROVED_SANDBOX_ROOT", "BOUNDARY", "CONDITION"), node("OWNED_SANDBOX_IDENTITY", "BOUNDARY", "CONDITION"), node("CAPABILITY_LIFETIME", "LIFETIME", "CONDITION"),
  ],
  edges: [
    edge("PROVISION_SANDBOX", "REQUIRES", "R2_A_AUTHORIZATION"), edge("TERMINATE_SANDBOX", "REQUIRES", "R2_A_AUTHORIZATION"),
    edge("PROVISION_SANDBOX", "BOUNDED_BY", "APPROVED_SANDBOX_ROOT"), edge("TERMINATE_SANDBOX", "BOUNDED_BY", "OWNED_SANDBOX_IDENTITY"),
    edge("PROVISION_SANDBOX", "EXPIRES_WITH", "CAPABILITY_LIFETIME"), edge("TERMINATE_SANDBOX", "EXPIRES_WITH", "CAPABILITY_LIFETIME"),
    edge("PROVISION_SANDBOX", "FORBIDDEN_WITH", "WRITE_REPOSITORY"), edge("PROVISION_SANDBOX", "FORBIDDEN_WITH", "SHELL"),
    edge("PROVISION_SANDBOX", "FORBIDDEN_WITH", "NETWORK"), edge("PROVISION_SANDBOX", "FORBIDDEN_WITH", "CREDENTIAL_ACCESS"),
  ],
});
