import { R3BoundedRepairLoop, type R3BoundedRepairLoopConfig,
  type R3BoundedRepairRequest, type R3BoundedRepairResult } from "../engine/r3BoundedRepairLoop";
import { TheoryInvestigationSession } from "./theoryInvestigation";
import { TheoryNetwork } from "./theoryNetwork";
import type { TheoryResearchContext } from "./theoryContracts";

export type TheoryEngineeringDispatchResult = Readonly<{
  state: "IDLE" | "FINISHED" | "BLOCKED";
  theoryId: string | null;
  reason: string;
  result: R3BoundedRepairResult | null;
  grantsAuthority: false;
}>;

/**
 * One event-driven activation: no fresh user prompt, hidden daemon, or unbounded spawning.
 * The host supplies already-authorized Omega capabilities; a theory cannot manufacture them.
 */
export async function runNextTheoryEngineeringInvestigation(network: TheoryNetwork, coordinator: object,
  prepare: (context: TheoryResearchContext) => Promise<{
    config: Omit<R3BoundedRepairLoopConfig, "theorySession">; request: R3BoundedRepairRequest;
  }>): Promise<TheoryEngineeringDispatchResult> {
  const lease = network.take(coordinator);
  if (!lease) return Object.freeze({ state: "IDLE", theoryId: null,
    reason: "no_eligible_activation_within_budget", result: null, grantsAuthority: false });
  const finish = (state: TheoryEngineeringDispatchResult["state"], reason: string,
    result: R3BoundedRepairResult | null = null): TheoryEngineeringDispatchResult =>
    Object.freeze({ state, theoryId: lease.theoryId, reason, result, grantsAuthority: false });
  try {
    const context = network.context(coordinator, lease);
    if (context.assignment.domain !== "SOFTWARE") return finish("BLOCKED", "domain_execution_adapter_not_implemented");
    const prepared = await prepare(context);
    const session = new TheoryInvestigationSession(network, coordinator, lease);
    session.context(prepared.request.objective, prepared.request.initialObservation.candidateCommit,
      prepared.request.allowedMutationPaths);
    const result = await R3BoundedRepairLoop.create({ ...prepared.config, theorySession: session }).run(prepared.request);
    return finish("FINISHED", result.reason, result);
  } catch {
    return finish("BLOCKED", "theory_dispatch_preparation_or_session_failed");
  } finally {
    // Revocation/retirement may already have released ownership; never revive it.
    try { network.release(coordinator, lease); } catch { /* Already revoked, replaced, or retired. */ }
  }
}
