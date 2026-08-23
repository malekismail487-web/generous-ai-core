# ORCHESTRA O4 Dossier — Adversarial Deliberation Protocol

> Status: DELIVERED. Harness: `npx tsx scripts/orchestraO4.test.ts` → 31/31.
> Full regression at delivery: O0 53 · O1 36 · O2 43 · O3 45 · P0 19+55 —
> all green; strict tsc clean. Zero existing files modified.

## Delivered

### `src/lib/codelab/orchestra/adp.ts`
The owner's abstract evaluation process as a deterministic kernel that
model-backed examiners will drive at runtime:

- **Five fixed examiner perspectives** (feasibility red-team, evidence
  auditor, novelty scout, cost physicist, mandatory advocate) with a
  FROZEN published rubric: role weights (.25/.25/.15/.15/.20), accept/revise
  thresholds (.66/.40), uphold delta (.10), open-challenge penalty (.05).
- **Evidence-or-inadmissible on both layers**: positions require evidence
  refs (artifact:// / https(s) / log:seq); challenges REQUIRE them too.
- **Cross-examination bites mechanically**: upheld challenges subtract the
  fixed delta from the TARGET position's effective score; unresolved
  challenges shave confidence. No self-challenges; one challenge per
  (challenger→target) pair; chair resolutions are explicit events.
- **Verdict synthesis** (hand-computed fixture pinned): weighted mean →
  outcome thresholds; spread-based confidence; deterministic scope table
  (accept ∧ conf ≥ .8 ⇒ global_rule; accept ∧ conf ≥ .6 ⇒ family).
- **Digest-bound landing**: the reducer re-synthesizes and compares digests
  before accepting any verdict event — forged verdicts (confidence mutated
  to .99 in the harness) are structurally rejected.
- **Dissents preserved**: every position whose stance ≠ final outcome is
  recorded verbatim-bounded into the verdict.
- **Low-stakes single-judge fallback**: same verdict shape, confidence
  CEILING 0.5 — a lone judge can never claim panel-grade certainty [A].
- **Calibration loop**: realized outcomes (helped/neutral/harmed/unresolved)
  recorded per verdict; `driftFor` computes helped-ratio EXCLUDING
  unresolved records (absence of evidence reported as null, never disguised
  as zero or one); ratio below RUBRIC.driftReviewFloor flags doctrine review
  — closing the loop back into future Genesis charters.

## Verification highlights
- Weighted mean .77 and confidence .45 matched hand computation exactly on
  the challenge-laden fixture (upheld novelty challenge + open cost
  challenge).
- Panel quorum strict: four-of-five roles ⇒ NO verdict possible.
- Forged verdict rejection proven via digest mismatch.
- ADP scope recommendation flows cleanly into O3 `validateDecision`.

## Contracts handed to O5 (Eyes Oversight)
1. Eyes sample deliberation cases from AdpState projections; findings ride
   `chan:oversight` (O0 law table already grants exactly this).
2. Freeze motions map onto O2 `family_frozen` epoch bumps; Eyes never write
   family channels directly.
3. Drift reports (`driftFor`) feed Eyes' human-style rubrics as evidence;
   reviewRequired cases are automatic findings.
4. Calibration recording rights belong to post-delivery verification (the
   Delivery Lock flow), not to the actor being judged.
