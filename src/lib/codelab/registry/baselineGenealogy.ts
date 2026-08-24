export interface InstitutionalBaseline {
  readonly baselineId: string;
  readonly commit: string;
  readonly role: "ORIGINAL_VERIFIED_R1" | "INTEGRATED_INSTITUTIONAL_R1" | "TRACEABLE_INTEGRATED_R1";
  readonly predecessorBaselineId: string | null;
}

export const OMEGA_R1_ORIGINAL_BASELINE_COMMIT = "7729cf3e3e6bdb9e8771dfcad6386ecc9fa55296";
export const OMEGA_R1_INTEGRATED_BASELINE_COMMIT = "734e402fd80ed7425735830ea9a0b2b6a6e25908";
export const OMEGA_R1_TRACEABLE_BASELINE_COMMIT = "68717200b669a8e7644e01f717f158ea44899820";

export const OMEGA_R1_BASELINE_GENEALOGY = Object.freeze<readonly InstitutionalBaseline[]>([
  Object.freeze({
    baselineId: "OMEGA-R1-ORIGINAL-CAPABILITY-BASELINE",
    commit: OMEGA_R1_ORIGINAL_BASELINE_COMMIT,
    role: "ORIGINAL_VERIFIED_R1",
    predecessorBaselineId: null,
  }),
  Object.freeze({
    baselineId: "OMEGA-R1-INTEGRATED-INSTITUTIONAL-BASELINE",
    commit: OMEGA_R1_INTEGRATED_BASELINE_COMMIT,
    role: "INTEGRATED_INSTITUTIONAL_R1",
    predecessorBaselineId: "OMEGA-R1-ORIGINAL-CAPABILITY-BASELINE",
  }),
  Object.freeze({
    baselineId: "OMEGA-R1-TRACEABLE-INSTITUTIONAL-BASELINE",
    commit: OMEGA_R1_TRACEABLE_BASELINE_COMMIT,
    role: "TRACEABLE_INTEGRATED_R1",
    predecessorBaselineId: "OMEGA-R1-INTEGRATED-INSTITUTIONAL-BASELINE",
  }),
]);

export const OMEGA_R1_TRACEABLE_BASELINE_REF =
  `baseline://OMEGA-R1-TRACEABLE-INSTITUTIONAL-BASELINE/${OMEGA_R1_TRACEABLE_BASELINE_COMMIT}` as const;

export function validateInstitutionalBaselineGenealogy(
  genealogy: readonly InstitutionalBaseline[] = OMEGA_R1_BASELINE_GENEALOGY,
): readonly string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  const commits = new Set<string>();
  for (let index = 0; index < genealogy.length; index += 1) {
    const baseline = genealogy[index];
    if (!baseline || !baseline.baselineId.trim() || !/^[0-9a-f]{40}$/.test(baseline.commit)) {
      issues.push(`malformed_baseline:${index}`);
      continue;
    }
    if (ids.has(baseline.baselineId)) issues.push(`duplicate_baseline_id:${baseline.baselineId}`);
    if (commits.has(baseline.commit)) issues.push(`collapsed_baseline_commit:${baseline.commit}`);
    ids.add(baseline.baselineId);
    commits.add(baseline.commit);
    const expectedPredecessor = index === 0 ? null : genealogy[index - 1]?.baselineId ?? null;
    if (baseline.predecessorBaselineId !== expectedPredecessor) {
      issues.push(`broken_predecessor:${baseline.baselineId}`);
    }
  }
  if (genealogy.length !== 3) issues.push("unexpected_r1_genealogy_length");
  if (genealogy[0]?.commit !== OMEGA_R1_ORIGINAL_BASELINE_COMMIT) issues.push("wrong_original_r1_baseline");
  if (genealogy[1]?.commit !== OMEGA_R1_INTEGRATED_BASELINE_COMMIT) issues.push("wrong_integrated_r1_baseline");
  if (genealogy[2]?.commit !== OMEGA_R1_TRACEABLE_BASELINE_COMMIT) issues.push("wrong_traceable_r1_baseline");
  return Object.freeze([...new Set(issues)]);
}
