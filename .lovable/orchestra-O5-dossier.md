# ORCHESTRA O5 Dossier — Eyes Oversight

> Status: DELIVERED. Harness: `npx tsx scripts/orchestraO5.test.ts` → 37/37.
> Full regression at delivery: P0 19+55 · O0 53 · O1 36 · O2 43 · O3 45 ·
> O4 31 — all green; strict tsc clean. Zero existing files modified.

## Delivered

### `src/lib/codelab/orchestra/eyes.ts`
The "pairs of eyes" as pure deterministic machinery (blueprint §9):

**Findings.** Fixed dimension vocabulary (correctness / craft / performance /
maintainability / honesty / goal_fidelity / anomaly) and severity ladder
(info/concern/urgent). Evidence-or-inadmissible enforced at the validator.

**Five continuous-sampling detectors**, boundary-exact against published
thresholds (`EYES_THRESHOLDS`, frozen):
- budget runaway (concern ≥ 3× plan estimate, urgent ≥ 10×) with the
  humility law: zero baseline ⇒ NO finding, never a fabricated judgment
- escalation storms (rate ≥ .5 with output; ≥ 3 escalations before ANY
  output)
- spawn spikes ([A] over-spawning guard; absolute floor avoids tiny-case
  noise)
- illegal-route rejection audits over any attempt ledger
- ADP drift-review auto-findings (O4 contract #3): reviewRequired ⇒
  automatic URGENT finding citing the ADP artifact

**End-state rubric & THE DELIVERY GATE** (Design Law #6): six human-style
dimensions each scored 0..1; PASS requires EVERY dimension ≥ floor — one
weak dimension fails everything, like a human reviewer would insist. The
gate requires BOTH keys: passing end-state assessment AND verifier verdict
"pass". Inconclusive blocks (absence of evidence ≠ success). This is the
mechanism that makes the owner's quality law executable rather than
aspirational.

**Freeze motions** — the single execution power: produce exact O2 events
(newEpoch = current + 1 ALWAYS), evidence-mandatory, fixed reason tokens,
and AUTOMATIC only for `safety_tripwire`; every other motion is
pending-confirmation per blueprint §9.

## Design decisions recorded
1. Detectors are pure functions over ledger projections — no clocks, no
   polling loops in the core; runtime sampling cadence lands with UI phases.
2. Delivery gate mirrors activationGate's shape (O1) so the scheduler and
   delivery paths read identically.
3. Detector-generated findings auto-cite their own artifact refs — even
   mechanical findings remain auditable end-to-end.

## Contracts handed to O6 (Evidence Harness)
1. Harness evidence packs must serialize into `ChannelEvidence` (P0 §5)
   so runtime/behavioral channels feed BOTH the verifier and the delivery
   gate from one source of truth.
2. Probe findings ride `chan:oversight` via `validateFinding`; probe
   crash-repro paths are evidence refs by construction.
3. Perf budgets (FPS/heap/long-tasks) map onto the performance dimension;
   chaos-monkey repros map onto correctness findings.
