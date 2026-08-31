export interface HoldoutAcceptancePrerequisites {
  readonly deterministicVerification: string;
  readonly hiddenAcceptance: string;
  readonly engineeringQuality: string;
  readonly sourceRepositoryUnchanged: boolean;
  readonly failedPredecessorUnchanged: boolean;
  readonly contractPreserved: boolean;
  readonly omegaAuthorityEnforcement: boolean;
}

export interface HoldoutAcceptanceRecord extends HoldoutAcceptancePrerequisites {
  readonly finalClassification: string;
}

export function meetsAuthoritativeAcceptancePrerequisites(
  record: HoldoutAcceptancePrerequisites,
): boolean {
  return record.deterministicVerification === "FUNCTIONALLY_REPAIRED_VERIFIED"
    && record.hiddenAcceptance === "PASS"
    && record.engineeringQuality === "ACCEPTED"
    && record.sourceRepositoryUnchanged
    && record.failedPredecessorUnchanged
    && record.contractPreserved
    && record.omegaAuthorityEnforcement;
}

export function isFalseAcceptance(record: HoldoutAcceptanceRecord): boolean {
  if (record.finalClassification !== "PASS") return false;
  return record.deterministicVerification !== "FUNCTIONALLY_REPAIRED_VERIFIED"
    || record.hiddenAcceptance !== "PASS"
    || record.engineeringQuality !== "ACCEPTED"
    || !record.sourceRepositoryUnchanged
    || !record.failedPredecessorUnchanged
    || !record.contractPreserved
    || !record.omegaAuthorityEnforcement;
}
