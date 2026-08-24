# ORCHESTRA / Generous AI Core — System Capability Audit
### Date: 2026-08-24 · Scope: full repository state at commit `6e50e9d` + working tree

> Method: every claim below is bound to a runnable artifact. Re-verify with
> the commands listed. No claim in this document rests on description alone.

---

## 1. Verified-by-execution summary (this audit's live runs)

| Check | Command | Result |
|---|---|---|
| Deterministic test suite (11 harnesses) | `npx tsx scripts/<harness>.test.ts` ×11 | **385 passed / 0 failed** |
| Strict TypeScript, all 21 core modules | `tsc --strict` (full list in repo history) | **0 errors** |
| Live scene perception battery | `node run.mjs canyon-v3.html audit` (headless Edge) | **6/6 channels PASS** |
| Physics replay determinism (live) | same, runs 1–3 | hash `fa0f0a6d` identical **3×** |
| Audio offline render (live) | same | RMS 0.0465 · peak 0.195 · no clipping |
| Playtest fuzz (live) | 120 injected events | 0 errors · 45.5ms input latency |
| Core scale | line count, `src/lib/codelab/**` | **5,351 lines** across 21 modules |

---

## 2. Capability matrix — what the system CAN do today

### A. Agent governance (P0 + O0–O6) — PROVEN
| Capability | Proof artifact |
|---|---|
| Event-sourced agent logs: replay-anywhere, associativity at every split, abort generations | `scripts/codelabAgentReducer.test.ts` (55) |
| Streaming tool-call protocol: recovers frames split at ANY byte offset; prose (chain-of-thought) discarded by construction | `scripts/codelabAgentProtocol.test.ts` (19) |
| Channel fabric with STRUCTURAL isolation: worker→worker / cross-family / illegal writes are undeliverable, not forbidden; every illegal ATTEMPT audited | `scripts/orchestraO0.test.ts` (53) |
| Bespoke parent genesis: charters constrain shape-not-content; adversarial qualification gauntlet; activation certificates void on any charter mutation | `scripts/orchestraO1.test.ts` (36) |
| Virtual swarm: 30,000,000 logical agents minted by ONE ledger append (<250ms); capacity planner derives all sizes from workload (linearity pinned — no caps, owner law) | `scripts/orchestraO2.test.ts` (43) |
| MiniAgent protocol: one-time self-duplication law, citations-mandatory proposals, up-chain-only routing, doctrine broadcasts at 4 scopes | `scripts/orchestraO3.test.ts` (45) |
| Adversarial Deliberation: 5-examiner panels, evidence-or-inadmissible, cross-examination that mechanically bites scores, digest-bound verdicts (forgery structurally rejected), calibration drift with honest nulls | `scripts/orchestraO4.test.ts` (31) |
| Eyes oversight: 5 anomaly detectors (boundary-exact thresholds), end-state rubric, **Delivery Gate** — nothing ships without passing assessment AND verifier | `scripts/orchestraO5.test.ts` (37) |
| Evidence packs: 11 probe types, tamper-evident digests, single projection feeding verifier + Delivery Gate | `scripts/orchestraO6.test.ts` (28) |

### B. Generation machinery (O7a) — PROVEN as machinery; DORMANT as autonomy
| Capability | Status | Proof |
|---|---|---|
| Seeded deterministic worlds (integer-hash PRNG; Rapier-safe) | PROVEN | `orchestraO7a.test.ts` + live replay hashes |
| Static generation gate (R1–R5) | PROVEN | linter tests + rig LINT runs |
| Closed Loop kernel with Recovery Task law (owner §4.5): exit impossible without tested hypotheses | PROVEN | `orchestraO7a.test.ts` lifecycle |
| **Worker perception — the eyes**: motion/palette/edges/physics/audio/playtest | **PROVEN LIVE** | `evidence/o7/attempt-3.perception.json` + audit rerun: all 6 PASS |
| Real physics in generated scene (Rapier, 240-step double replay) | **PROVEN LIVE** | hash equality ×3 runs |
| Real synthesized audio, numerically analyzed | **PROVEN LIVE** | RMS/peak/centroid from OfflineAudioContext |
| Playtesting (fuzz + latency + crash watch) | **PROVEN LIVE** | 120 events, 0 errors, 45.5ms |
| Headless capture rig (screenshots as evidence) | PROVEN | `evidence/o7/attempt-{1,2,3}.png` |
| **Prompt → model → generated scene (autonomous GEN)** | **DORMANT — requires live model credentials** | `generator.mjs` + `gen.mjs` complete; fail loudly as `NO_MODEL_CREDENTIALS` / session-gated |

### C. Institutional governance properties (cross-cutting) — PROVEN
- **Delivery Lock (Design Law #6)**: enforced in code (`deliveryGate`), tested (inconclusive verifier blocks; single weak rubric dimension blocks).
- **Recovery-before-exit (owner law)**: structurally impossible to exit without tested hypotheses — `orchestraO7a.test.ts`.
- **No-capacity-caps (owner law)**: planner linearity pinned exactly ×10; 50M-unit scenario plans proportionally.
- **No-CoT persistence (P0 directive 4)**: transport discards prose by construction; rejection tokens carry no payload; test-asserted.
- **Tamper evidence**: certificates, ADP verdicts, evidence packs — all digest-bound; forged variants tested and rejected.
- **Budget = visibility only**: burn never blocks (owner decision), quality protected by the Delivery Gate instead.

---

## 3. What is NOT done (honest gaps)

1. **Autonomous generation** — the GEN phase needs a live model endpoint (expired credits noted). Machinery complete; autonomy dormant. *Unblock: any OpenAI-compatible key, or reactivated Lovable credits + dashboard email-confirm for the rig agent.*
2. **O7b** — post-processing stack (god-rays/bloom/DoF), starfield sky, terrain-collider physics, deeper visual probes.
3. **O7c** — full swarm choreography end-to-end on the flagship brief (canyon guardian: creature gait + narrated tour) through the Delivery Gate.
4. **O8** — external benchmark suite (SWE-task bank, swarm stress evals).
5. **Remaining remasters** (per the owner deal): O0–O5 hardening passes at institution bar; UI surfaces (Agent Console, Playground drawer) from the original agent-plan P6 are unbuilt — current interfaces are CLI/JSON.
6. **Known debt** (flagged, unfixed, by design of this audit): repo security items from the first exploration (committed `.env`, plaintext seed codes in old migrations, leaked `ale_live_` token in `.lovable/ale-api-dossier.md`) still require rotation/cleanup.

---

## 4. Verdict against the institutional goal

**Have we reached it?** Precisely:

- **The governance institution: YES.** Role isolation, genesis qualification, swarm semantics at any scale, adversarial evaluation, oversight with real teeth, evidence-tamper-evidence, delivery lock — all implemented, all deterministic, all replayable, all under 385 green assertions with strict types. An institution could audit every decision this system has ever made or will make, from its logs alone. That was the founding promise of the blueprint, and it holds.
- **The product promise (autonomous AAA-grade generation): NOT YET.** Every *organ* exists — contracts, loop, eyes, gate — but the system has not yet autonomously written a scene from a prompt, and the flagship (O7b/O7c) is ahead of us, not behind us. The current canyon is operator-authored (disclosed), validated by the machine.
- **One-line status**: *a fully-governed generation engine with its eyes open, waiting for a pulse of compute to breathe autonomously — with O7b/O7c/O8 and the remaster campaign still to run.*

Re-verification: every table row above maps to a file in `scripts/` or `evidence/`. Run them. That is the institutional standard we committed to.
