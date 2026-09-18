import {
  BIOLOGICAL_CIRCUIT_AUTHORITY,
  validEpistemicArchitectureProfile,
  type EpistemicArchitectureProfile,
} from "./biologicalCircuitIR";

/**
 * Compact compiled result of the exact source artifacts in biologicalSourceRegistry.
 * The source graphs remain outside the product repository; the read-only cache verifier
 * deterministically recompiles this value from their pinned commits and SHA-256 identities.
 */
export const NYX_VERIFIED_HYBRID_BIOLOGICAL_PROFILE = Object.freeze({
  schemaVersion: 1,
  profileId: "nyx:hybrid-biological-prior:v1:epistemic-profile",
  sourcePriorDigest: "359e18edb8f84c3cf12a5fa68000640daa643ce9ac417052092882a1c8aea650",
  evidenceCopiesMultiplier: 1.144079047217,
  hypothesisCopiesMultiplier: 1.136400298731,
  falsifierCopiesMultiplier: 0.844214876033,
  integratorCopiesMultiplier: 0.918838683273,
  inhibitoryCopiesMultiplier: 0.750743801653,
  uncertaintyCopiesMultiplier: 1.036238296135,
  actionCopiesMultiplier: 1.04368061246,
  routingFanoutMultiplier: 0.79417278969,
  recurrenceCyclesMultiplier: 1.181867064974,
  profileDigest: "976fb5157c20474a2d99c7ef8818db32ce571b9f0e690b48a3d28cdf5f0627cf",
  authority: BIOLOGICAL_CIRCUIT_AUTHORITY,
  modelCallsAdded: 0,
  toolsAdded: 0,
  grantsAuthority: false,
} as const satisfies EpistemicArchitectureProfile);

if (!validEpistemicArchitectureProfile(NYX_VERIFIED_HYBRID_BIOLOGICAL_PROFILE)) {
  throw new Error("verified_hybrid_biological_profile_invalid");
}

