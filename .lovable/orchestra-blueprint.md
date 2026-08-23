# ORCHESTRA — Agentic System Blueprint for CodeLab
### (Generous AI Core · Orchestrated Swarm Architecture · v1.1 — APPROVED)

> Status: APPROVED by owner (with §0a amendments). O-phase implementation
> authorized, starting at O0.
> Builds directly on the Phase 0 agent core (`src/lib/codelab/agent/*`,
> `src/lib/codelab/verifier/*`) and `.lovable/codelab-agent-plan.md` (v2).
>
> Research grounding: Anthropic's multi-agent research system (Jun 2025),
> Microsoft Magentic-One (2024), Pyodide/WASM runtimes, Dimforge Rapier.
> Key external findings are cited inline as [A#] / [M#] / [R#].

---

## 0a. Owner amendments (binding, recorded at approval)

1. **NO fixed ceilings.** Executor/lane counts are never arbitrary
   constants. The **Capacity Planner** (O2) derives required parents,
   workers, and concurrent lanes FROM the plan itself: measured project
   volume (files/LOC/assets), decomposition breadth, verification surface,
   and per-unit work estimates. A 50M-line migration legitimately plans a
   proportionally sized swarm. Infrastructure elasticity (how many lanes can
   actually run) is a deployment configuration fed BY the planner's demand
   computation — a resource allocation decision, never a design-law cap.
   Logical agents were already unbounded; now concurrency targets scale
   with computed demand too.
2. **DELIVERY LOCK (new design law, added to §1 as law 6):** the finalized
   product may only be shown to the user after end-state verification
   returns `pass` across all applicable channels AND Eyes sign-off is on
   record. Imperfect builds are reported honestly with their evidence
   packs — never shipped as final. Quality is never traded for cost or
   speed; the swarm scales instead (amendment 1 exists precisely so cost/
   speed pressure has a lawful outlet that doesn't touch quality).
3. **Economics:** owner acknowledges frontier-scale swarm work is expensive
   and plans a dedicated institutional subscription tier in the future.
   No near-term product decisions required; budget plumbing still lands
   with O2 for accounting visibility.

---

## 0. The vision → the machine

The product owner's vision, restated as system requirements:

| # | Vision (owner's words) | Engineered mechanism |
|---|---|---|
| V1 | "AI coder evaluates if it can do the job alone or needs agents" | **Complexity Gate** — scored dispatch decision (§3) |
| V2 | "Plans, then creates parent agents" | **Genesis Pipeline** — bespoke parent synthesis + qualification gauntlet before activation (§4) |
| V3 | "Clones itself 30M times extremely fast" | **Virtual Swarm** — clone = O(1) ledger append; bounded elastic executor pool does the actual work (§5). *Physics note below.* |
| V4 | Three logs: public / family / private | **Channel Fabric** — structurally enforced message routing (§6) |
| V5 | Workers talk only to their parent | Capability matrix per charter; violations are undeliverable, not forbidden (§6) |
| V6 | Mini agents: one-time self-evaluation duplicates that do internet research and propose UP through the chain | **MiniAgent Protocol** (§7) |
| V7 | "AI coder evaluation should be abstract, not a read-through" | **Adversarial Deliberation Protocol** — multi-perspective panel with mandatory evidence citation (§8) |
| V8 | "Pairs of eyes" evaluating like humans, evidence-based | **Eyes Oversight** — independent observers with read-everything grants (§9) |
| V9 | AI Playground stress-testing every minor aspect | **Evidence Harness** inside the preview frame (§10) |
| V10 | AAA-grade 3D/physics generation in CodeLab | **Engine Kit** — three.js + Rapier WASM assembly pipeline (§11) |
| V11 | Win every coding benchmark by a landslide | Benchmark strategy + honest economics (§13) |

**The physics note (V3), stated once and honestly:** 30 million live LLM
sessions would cost millions of dollars and months of wall-clock time on any
inference network on Earth. What ORCHESTRA builds instead is what Kubernetes,
map-reduce, and every real swarm system builds: *logical* agents whose
existence is a record in an event-sourced ledger — spawn/clone is therefore
O(1) and genuinely instant at ANY scale — while a bounded pool of elastic
executors (tiered models: bulk workers on cheap/fast tiers, escalations to
frontier models) drains the work queue with work-stealing. The swarm
*semantics* are unlimited; the swarm *economics* have explicit budgets.
This is not a downgrade of the vision — it is how the vision survives
contact with reality [A#: token spend explains ~80% of eval variance;
multi-agent ≈ 15× chat cost].

---

## 1. Design laws (inherited from Phase 0, binding here too)

1. Everything is event-sourced. Agents, messages, clones, verdicts — all
   events in append-only logs. Replayable, abortable via epochs.
2. Enforcement is STRUCTURAL, never prompt-polite. If a channel rule exists,
   the router makes violations undeliverable.
3. Pure cores (`src/lib/codelab/**` non-IO layers): no clocks, no random,
   no network. Deterministic harnesses in `scripts/` for everything.
4. Bounded resources everywhere: rings, caps, budgets — mirroring LIMITS.
5. The verifier/eyes are independent components by architecture, swappable
   behind contracts (Phase 0 directive 3 generalized to all oversight).
6. **DELIVERY LOCK:** no finalized product reaches the user without a
   passing end-state verification record and Eyes sign-off (§0a.2).

---

## 2. Topology

```
                        ┌─────────────────────────────┐
   student request ───▶ │  AI CODER (orchestrator)    │◀─── Eyes reports
                        │  Complexity Gate · Genesis  │
                        │  ADP evaluation · Policy    │
                        └──────────┬──────────────────┘
                                   │ charters + spawn orders
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
        ┌──────────┐         ┌──────────┐         ┌──────────┐
        │ PARENT A │         │ PARENT B │         │ PARENT C │   (bespoke,
        │ family:A │         │ family:B │         │ family:C │    qualified)
        └────┬─────┘         └────┬─────┘         └────┬─────┘
             │ clones (O(1))      │                    │
        ┌────▼────┐          ┌────▼────┐          ┌────▼────┐
        │ workers │          │ workers │          │ workers │  …logical,
        │  (pool) │          │  (pool) │          │  (pool) │   pooled
        └────┬────┘          └─────────┘          └─────────┘
             │ self-duplicates ONCE
             ▼
         mini agent ──research──▶ proposal UP the chain only
```

---

## 3. Complexity Gate (V1) — dispatch decision

Before any swarm activity, the AI coder scores the request:

```
score = w1·parallelizableBreadth     // independently splittable subtasks
      + w2·artifactVolume            // est. files/LOC/assets
      + w3·domainDiversity           // #distinct expertises needed
      + w4·verificationSurface       // #channels evidence needed from
      − w5·couplingPenalty           // tightly-shared-context penalty [A]
```

- `score < τ_single` → solo mode: plain Phase-1 agent loop (no swarm).
- `τ_single ≤ score < τ_swarm` → few-shot mode: 2–5 direct subagents.
- `score ≥ τ_swarm` → full ORCHESTRA dispatch.
- Effort-scaling heuristics embedded verbatim from Anthropic practice [A]:
  simple fact-find ≈ 1 executor/3–10 tool calls; comparisons ≈ 2–4 lanes;
  complex breadth ≈ many lanes with explicitly divided responsibilities.
- Gate decision + full score breakdown appended to the session log
  (auditable; Eyes audits gate calibration over time).

Anti-runaway guardrails [A: "spawning 50 subagents for simple queries"]:
hard lane ceilings per mode, spawn-rate limits, budget pre-authorization
per family (Phase-2 cost ledger integration).

---

## 4. Genesis Pipeline (V2) — bespoke parents, no templates

Parents are NOT instantiated from templates. Each is synthesized:

```
GENESIS = spec_synthesis → capability_grant → qualification_gauntlet
        → activation_certificate
```

1. **Spec synthesis.** The AI coder authors a Charter from first principles
   given THIS task family: identity, mission narrative, planning doctrine,
   delegation style, stop conditions, model tier per role, channel grants.
   Freeform fields — the charter schema constrains SHAPE, never CONTENT.
2. **Capability grant.** Explicit tool allowlist + API credential scopes
   ("injecting its own API") + budget envelope. Least privilege default.
3. **Qualification gauntlet.** BEFORE activation, the candidate parent must
   pass a rigorous adversarial battery generated against its own mission:
   - planning probes (does its decomposition cover the goal?)
   - channel-law tests (attempt illegal sends — must fail structurally)
   - budget discipline (refuses over-budget plans?)
   - failure behavior (degrades honestly, escalates correctly?)
   - delegation quality [A: detailed task descriptions prevent duplicated
     work] — its briefs are scored for objective/output-format/boundary.
   Gauntlet results are events. Fail → revise charter → re-gauntlet.
4. **Activation certificate.** Only after pass: signed activation event.
   No certificate, no execution rights. Ever.

All agents share ONE runtime species (worker/parent/orchestrator differ by
charter + grants + position in the tree) — exactly as the owner specified.

---

## 5. Virtual Swarm (V3) — clone semantics & execution

**Identity:** an agent = `{agentId, charterRef, parentId, epoch, state}` —
an event-log record. Cloning appends N birth records: microseconds,
unbounded N. "Clone its own code" is literal: the child inherits the
parent's charter payload (its "code" at the identity level) plus deltas.

**Execution:** logical workers are scheduled onto a bounded elastic pool:

| Tier | Backing | Used for |
|---|---|---|
| T0 deterministic | pure JS fns, validators, formatters | mechanical work, zero tokens |
| T1 fast model | cheap tier via gateway | bulk workers |
| T2 frontier model | strong tier | parents, escalations, ADP |

- Work-stealing queue per family; starvation guards inherited from the LSE
  priority scheduler pattern.
- Escalation ladder: T1 worker stuck ⇒ T2 assist ⇒ parent replan ⇒ AI coder.
  (Magentic-One outer/inner loop discipline [M]: Task Ledger vs Progress
  Ledger, replan when stalled.)
- Artifacts (code, reports) go to a shared artifact store; agents exchange
  REFERENCES, not payloads [A: kills the telephone game, cuts tokens].
- Family teardown = epoch bump (reuses Phase 0 abort semantics exactly).
  Post-teardown straggler traffic is dropped deterministically — already
  proven by the Phase 0 reducer tests.

---

## 6. Channel Fabric (V4–V5) — three logs, structurally enforced

Three channel families, all partitions of the same event log:

| Channel | Addressed as | Writers | Readers |
|---|---|---|---|
| PUBLIC | `chan:public` | governance only (see §8 policy engine) | every agent |
| FAMILY | `chan:family:<parentId>` | that parent + its direct children | same set |
| PRIVATE | `chan:private:<agentId>` | that agent (+ its mini, during life) | that agent; Eyes read-only |

**Routing law (structural):** every message carries
`(from, to-channel, grant-token)`. The router validates the sender's
capability matrix from its charter. An illegal address fails at the
transport layer — there is no code path that delivers it. This is the
same philosophy as the extension system's protected-keyword blacklist:
"isolation structural rather than prompt-restricted."

Worker→worker and worker→foreign-parent messages are therefore not
"against policy" — they are impossible.

PRIVATE log purpose ("engraved"): each worker's durable memory — task DNA,
learnings, mini-agent dossier — survives restarts, feeds post-mortems.

---

## 7. MiniAgent Protocol (V6)

Trigger: a worker may self-duplicate EXACTLY ONCE per task unit. The
duplicate is a mini agent with a narrow charter:

```
mini = duplicate(worker) with charter {
  mission: evaluate creator's progress + independent web research,
  grants: [read private:<workerId>, read family:<parentId>,
           web_research, propose-to-parent],
  lifetime: one proposal or timeout
}
```

Flow (exactly the owner's chain of command):

```
mini finding ──▶ PARENT receives proposal ──▶ parent's own report
             ──▶ AI CODER runs ADP (§8) ──▶ policy verdict:
                 { reject | private:<worker> | family broadcast
                   | group-public | GLOBAL RULE }
             ──▶ policy engine writes to the matching channel
```

Key properties:
- The mini NEVER instructs its creator directly. Up-chain only.
- The AI coder's verdict is classified by scope; global rules land on
  PUBLIC and become binding doctrine for all future charters (genesis
  pipeline injects current public doctrine into every new parent).
- Web research citations are mandatory fields on proposals [A rubric:
  source quality graded; primary > secondary].
- Mini dossiers are archived into the worker's PRIVATE log on completion.

---

## 8. Adversarial Deliberation Protocol (V7) — the abstract evaluation

When the AI coder (or a parent) evaluates anything nontrivial — a mini
proposal, a completed family artifact, a disputed verification — it does
NOT do a single read-through. It convenes a deliberation:

1. **Panel synthesis.** From the deliberation charter, instantiate distinct
   examiner perspectives, each a scoped agent instance with its own context:
   - FEASIBILITY red-team (attacks the mechanism)
   - EVIDENCE AUDITOR (verifies every claim against logs/web citations;
     uncited claims are inadmissible)
   - NOVELTY SCOUT (web-checks whether this is known practice; grades
     originality with sources)
   - COST PHYSICIST (token/compute/time accounting vs expected value [A
     economics])
   - ADVOCATE (steel-mans the proposal; mandatory counterweight)
2. **Cross-examination round.** Examiners see anonymized peer positions and
   may challenge once. Challenges require evidence.
3. **Verdict synthesis.** Scored rubric → structured verdict:
   `{accept/reject/revise, confidence, scope classification, dissent record}`.
   Dissents are preserved verbatim in the log (calibration data).
4. **Calibration loop.** Verdicts are later scored against realized outcomes
   (did accepted proposals actually help? Eyes measures this) and drift is
   fed back into deliberation charters [A: let agents improve their own
   prompts; measured 40% efficiency gain in Anthropic's case].

Single-call LLM-as-judge remains the fallback for LOW-stakes items [A:
single judge was most consistent for simple grading]; ADP is reserved for
high-stakes evaluations. Stakes are classified by the Complexity Gate.

---

## 9. Eyes (V8) — oversight with pairs of eyes

Independent observer entities. Charter grants: READ on all channels,
WRITE only to `chan:oversight`. They hold no execution power except one:
**motion to freeze** — a family pause that bumps its epoch (pending AI
coder confirmation; automatic for hard safety tripwires).

Evaluation doctrine (human-like, evidence-based):
- END-STATE evaluation first [A appendix]: judge final artifacts against
  the original goal + acceptance criteria, not step-compliance.
- Evidence packs required: every finding cites logs/artifacts/harness
  outputs (§10) or web sources. Vibes are inadmissible.
- Human-style rubric dimensions: correctness, craft, performance,
  maintainability, honesty-of-reporting, user-goal fidelity.
- Continuous sampling: Eyes watch spawn rates, budget burn, escalation
  storms, channel anomalies (a worker attempting illegal routes is an
  immediate finding — even though the route fails, the ATTEMPT is logged).
- Eyes report cadence + a standing adversarial duty: try to break what the
  orchestra built, then prove the break with repro steps.

---

## 10. AI Playground & Evidence Harness (V9)

The preview frame gains a headless instrumentation harness injected alongside
the student's bundle ("stress test EVERY minor aspect"):

| Probe | What it collects |
|---|---|
| console/network | errors, warnings, failed fetches (extends Phase-1 runtime channel) |
| perf budget | FPS sampling, long tasks, memory heap growth/leak detection, bundle weight |
| interaction fuzz | chaos-monkey driver: random clicks/inputs/swipes; crash reproduction paths recorded |
| visual regression | deterministic scene snapshots; pixel-diff against baselines |
| physics probes | determinism replay (Rapier supports cross-platform determinism [R]), tunneling checks, energy-drift metrics, solver iteration counts |
| accessibility | contrast, focus order, aria basics |
| API contract | LUMINA_AI runtime misuse detection |

Output: a signed **Evidence Pack** (event-sourced artifact) consumed by:
the verifier's six channels (Phase 0 §5 mapping: perf/fuzz→runtime &
behavioral channels), Eyes rubrics, and ADP cost physics.

---

## 11. Engine Kit (V10) — AAA-leaning 3D in CodeLab

CodeLab gains a mode selector: **CODE | 3D | HYBRID** (user chooses; matches
the owner's requirement).

Stack decisions (all browser-native, no install):
- Rendering: **three.js r184** — ALREADY in package.json dependencies.
- Physics: **@dimforge/rapier3d-compat** — WASM embedded base64, loads
  without bundler changes, deterministic stepping supported [R]. Added as
  a lazy-loaded dependency only when 3D mode is active.
- Assets: procedural geometry generators + glTF import path; Draco/KTX2
  via CDN loader modules when heavy meshes are warranted.
- WebGPU renderer where available, WebGL2 fallback auto-detected.

**Kit Parts** — composable, parameterized building blocks the swarm assembles
rather than freehand-codes (this is how quality ceiling rises fast):
`TerrainKit`, `CharacterControllerKit`, `LightingPresets` (PBR/IBL rigs),
`PostFXStack` (bloom/DoF/tonemapping tuned per scene mood),
`AnimationRigKit`, `AudioGraphKit`, `PhysicsMaterialLibrary`,
`GameLoopSkeleton` (fixed-timestep physics + interpolated render [R]).

Pipeline: AI coder decomposes scene spec → families assemble kit parts +
custom code → Playground harness validates physics/render/perf evidence →
Eyes review → iterate. Honest framing: kit-driven generation reaches
"impressive sim/demo" fidelity fast; literal AAA-title fidelity stays
aspirational, but the pipeline is exactly how the ceiling gets pushed.

---

## 12. O-Phases (implementation order after approval)

| Phase | Delivers | Depends on |
|---|---|---|
| **O0** | Channel fabric: addressing envelope, router, capability matrix, structural enforcement + harnesses | Phase 0 types/protocol ✓ |
| O1 | Agent identity + Genesis Pipeline (charter schema, gauntlet runner, certificates) | O0 |
| O2 | Virtual Swarm scheduler (spawn/clone ledger ops, **Capacity Planner** — demand-derived lane/parent/worker computation, tiered pool, work-stealing, escalation ladder) | O1 |
| O3 | MiniAgent protocol + proposal envelopes | O0/O2 |
| O4 | ADP deliberation engine + policy engine (scope-classified broadcasts) | O3 |
| O5 | Eyes observers + freeze motion | O0/O4 |
| O6 | Evidence Harness (playground probes) — lands WITH agent-plan Phase 4 verifier wiring | P1/P4 |
| O7 | Engine Kit + CodeLab CODE/3D/HYBRID modes | O6 |
| O8 | Benchmark suite: internal SWE-bank + swarm evals; calibration dashboards | all |

Each O-phase ships deterministic harnesses in `scripts/` and its own
`.lovable/orchestra-O<n>-dossier.md`, matching house convention.

---

## 13. Benchmark strategy & honest economics (V11)

What the evidence says we must exploit [A]:
- Multi-agent shines on **breadth-first, parallelizable, high-value** work;
  token volume correlates ~80% with performance. ORCHESTRA's tiered pool is
  designed to buy tokens where they pay.
- Multi-agent struggles with **tightly-coupled shared-context coding** [A].
  Mitigation: artifact-store + reference passing, ADP cross-examination,
  end-state verification loops (agent plan P4).

Internal benchmark bank (O8), built before any external claims:
- SWE-task bank: real bug-fixes/features on Lumina itself + synthetic repos,
  graded end-state by deterministic tests FIRST, judge second [A].
- Swarm stress evals: spawn discipline, channel-law violation rate = 0,
  budget adherence, recovery-from-freeze.
- 3D evals: physics determinism replay, perf budgets at 60fps target,
  visual regression stability.

Honesty clause, committed to the owner: no responsible architect can promise
"winning every benchmark by a landslide" against frontier systems backed by
frontier models. What this architecture CAN promise: structural advantages
(parallel exploration with compression, evidence-adversarial evaluation,
zero channel-violation isolation, unlimited swarm semantics at bounded
cost) that compound as model tiers improve underneath it.

---

## 14. Owner decisions — RESOLVED (see §0a)

1. Blueprint APPROVED with amendments.
2. Ceilings: REJECTED. Capacity Planner computes all swarm sizing from the
   plan; no fixed lane constants anywhere in design law.
3. Budget posture: never butcher quality; DELIVERY LOCK adopted; cost
   plumbing is accounting-only for now (institutional tier is a future
   product decision).
