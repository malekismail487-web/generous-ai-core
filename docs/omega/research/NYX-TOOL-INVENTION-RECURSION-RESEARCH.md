# NYX tool invention and measured recursion

Research refinement: 2026-10-12. Inspected repository checkpoint:
`bf81efc200ec826a400f7002aa39465edd597736`.
Status: **RESEARCH / PROPOSED**, not capability promotion or authority.
Companion: [preserved dual-track goal](NYX-DUAL-TRACK-PROGRAM.md).

## Objective and actual starting point

Build a system that can notice a missing capability, propose a task-class tool,
have it independently tested, reuse it on unseen instances, and eventually
propose improvements to that improvement process. This is stronger than saving
answers, editing a prompt, or attaching another model call to every failure.

NYX still depends on Nemotron inference for model cognition. The bounded native
interpreter supplies deterministic computation, not a separately trained brain.
The latest shared-start repair epoch accepted **0/4** solutions in each arm;
only one of four public formulations was admitted and none repaired the answer.
These outcomes constrain this agenda. They do not support an AGI/ASI claim or a
guarantee that adding tools will eliminate the foundation model's limitations.

## Primary research inspected

| Identity | Methods inspected | Relevant result and limit | NYX design inference |
| --- | --- | --- | --- |
| S16 — [LLMs as Tool Makers](https://arxiv.org/html/2305.17126), sections 3–4 | Tool proposal, validation, wrapping, use and functional caching | Generates reusable functions from examples; construction and repeated use are distinct phases. Its verification includes model-generated calls, not an independent NYX-quality assurance boundary. | Separate invention, safe execution and transfer; charge construction. Do not copy self-validation as authoritative acceptance. |
| S17 — [DreamCoder](https://arxiv.org/html/2006.08381), wake/sleep methods and ablations | Typed program search, abstraction/compression, learned recognition and memorize controls | Learns reusable program libraries and tests their contribution with ablations. It also trains a recognition model; NYX has not reproduced that training or demonstrated its gains. | Compare parameterized abstraction against whole-solution caching. A new primitive must preserve semantics and help fresh composition; library size is not success. |
| S18 — [TextGrad](https://arxiv.org/html/2406.07496), framework, appendix A and E | Feedback propagation through a computation graph, explicit variable roles and separate data splits | Language-model feedback guides optimization. The feedback is generated advice, not a proof or a numeric derivative guaranteeing descent. Some evaluation is model-judged. | Route measured failures to the responsible interface or procedure. Freeze questions, constraints, safety boundaries and authoritative judges; independently test proposed changes. |
| S02 — [Darwin Gödel Machine](https://arxiv.org/html/2505.22954v3), methods, transfer, safety | Code/workflow evolution around frozen foundation models, archives and alternate-benchmark transfer | Improves coding agents in its experiments; benchmark improvement can amplify unintended behavior. Better coding is used as a proxy for self-improvement ability. | Test subsequent improvement ability directly. Keep lineage and regression controls; do not transplant broad Bash access. |
| S04 — [Voyager](https://arxiv.org/html/2305.16291v2), sections 2.2–2.3 | Executable skill retrieval, iterative feedback and reusable control programs | Studies embodied skills in Minecraft. Its self-verification is not the independent acceptance demanded here. | Use precondition-bound skills and observed execution feedback, with an external admission decision. Domain success is not broad intelligence. |
| S06 — [AlphaEvolve](https://deepmind.google/blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/), author technical account | Generation, automated evaluation and diversified algorithm search | Search works where evaluators can check candidates; the account does not prove arbitrary objectives are fully verifiable. | Try bounded candidate search only for checkable objectives, counting all branches and construction cost. |

These are design inferences, not reproduced paper results or claims of original
scientific discovery. Source abstracts, methods and code have different evidence
strengths; implementation requires a relevant code/license review. The failed
PDF/Nature retrievals were replaced with the authors' arXiv HTML, not inferred
contents. No private repository data or benchmark answer references were sent
to research services.

## Distinct research routes — use the existing portfolio, not a second stack

Each row names a different potential job. IDs refer to the 64-hypothesis
portfolio; the routes below are refinements, not extra independent inventions.

| Route | IDs | Observable job | Simpler control / falsifier |
| --- | --- | --- | --- |
| Task-class tool invention | H005–H008 | Replace repeated difficult operations with a newly proposed parameterized tool | Same reasoning with existing tools; reject if gains need an answer-specific program or free construction compute |
| Semantic skill compression | H009–H012 | Extract reusable abstractions from independently accepted programs | Whole-program cache; reject if compression changes behavior or fails new compositions |
| Counterexample-guided repair | H013–H016 | Return an executable failing case, not a vague critic opinion | Existing feedback; reject if the critic misses seeded defects or false alarms consume the benefit |
| Proof obligations and translation checks | H017–H020 | Validate both the formal computation and the encoding of the task | Current exact solver; reject if formal success solves the wrong statement |
| Active rival-hypothesis experiments | H021–H024 | Choose observations that distinguish competing predictions | Fixed or random experiment order; reject if confidence changes without discriminating evidence |
| Calibrated abstention | H025–H028 | Reduce false confident answers at stated coverage | Existing confidence field; reject if reported confidence rises but actual calibration worsens |
| Recoverable partial-order planning | H029–H032 | Resume valid plan portions without replaying stale actions | Sequential frozen plan; reject on changed targets, invalidated dependencies or duplicate effects |
| Freshness-bound procedural memory | H033–H036 | Retrieve a relevant rule with preconditions and invalidation dependencies | No memory / answer cache; reject if stale or exposed answers explain the benefit |
| Prediction-distinct specialist entities | H037–H040 | Produce different checkable predictions and communicate needed evidence | A single reasoner at total matched compute; reject if specialists are duplicate votes |
| Bounded diversified program search | H041–H044 | Find useful executable constructions that a single proposal misses | One larger inference or fixed search; reject if extra compute alone explains acceptance |
| Workflow and meta-workflow proposals | H045–H048 | Improve how NYX creates subsequent improvements | Static parent and one-generation controls; reject if only first-generation task scores improve |
| Independent detector development | H049–H052 | Increase defect detection without changing authoritative results | Frozen detector on separate seeded challenges; reject if the candidate grades itself |
| Structure-preserving domain transfer | H053–H056 | Reuse an abstraction after independently checking correspondence | Domain-specific solution; reject linguistic analogy without preserved constraints |
| Grounded transition predictions | H057–H060 | Predict later observations with falsifiable uncertainty | Direct observation only; reject imagined states being treated as completed actions |
| Value-of-compute routing | H061–H064 | Spend extra resources only where acceptance gains justify them | Equal-total-compute fixed route; reject better labels or more IDs without throughput/correctness gains |

## Tool invention: three competing implementation hypotheses

1. **Finite-IR synthesis first.** NYX proposes a parameterized pure program in the
   existing bounded arithmetic/constraint representation. No arbitrary source
   execution is needed. Independently check behavior across development inputs,
   bind preconditions and resource limits, then evaluate invocation on fresh
   instances. Limitation: this is invention within a small language, not a
   general software toolmaker. Failure mode: representation/formulation errors.
2. **Verified composition before new primitives.** NYX combines admitted tools
   under explicit input/output contracts. An independent checker verifies
   correspondence and dependency closure. Compare with flat tool use at equal
   compute. Limitation: planning over existing abilities is not invention of an
   entirely new primitive. Failure mode: compatible types but incompatible meaning.
3. **General source synthesis later.** NYX proposes a pure software utility plus
   specification, error cases and a test plan. A separately trusted harness
   supplies held-out checks and runs it only in a validated quota-enforcing
   boundary. Current hostile-code runner admission remains a dependency; do not
   use the host Node process as an unrestricted fallback. Failure mode: resource,
   secret, network or filesystem escape, or a correct tool for the wrong task.

Select route 1 only after the current formulation/value diagnosis identifies a
specific general correction. Compare route 2 as a later ablation; route 3 stays
blocked where validated execution isolation is absent. No automatic tool
registration, package installation or permission growth follows a passing test.

## What is allowed to improve, and what is not

Candidate proposals may change a scoped pure tool, procedure, retrieval rule,
task decomposition or workflow, and later a bounded improvement strategy.
Changing model weights, training data, architecture or device behavior requires
separate resources, authority and evaluation; it is not implied by this agenda.

The authority kernel, leases, credentials, authoritative oracle, reserved
evaluation data, evidence custody and promotion decision are outside candidate
mutation scope. A detector improvement is a separately reviewed candidate,
evaluated on independent challenges. The model may propose its own language only
if an existing representation cannot serve a measured need; parsability, finite
semantics and validated translation precede execution. No new language is
necessary to begin these experiments.

## Preregistered two-generation test — specification only

Freeze parent P and an unchanged model. Separate development, selection-validation
and final transfer populations; task contents must not migrate between them.

1. P proposes at most one candidate C under a frozen construction budget.
2. Independent development/selection checks either admit C provisionally or
   reject it. Record failed proposals and all compute, not just the winner.
3. Give P and admitted C equal total budgets to each propose a subsequent
   candidate, P2 and C2. Neither can edit the admission or scoring mechanism.
4. Freeze P, C, P2 and C2. Evaluate each on untouched final tasks, charging both
   search cost and inference/tool cost; report latency and safety regressions.
5. First-order improvement needs C to outperform P on fresh outcomes. Stronger
   measured recursion needs C's subsequent improvement to exceed P's under
   comparable budgets, survive replication and preserve all hard invariants.

The exact tasks, effect threshold, sample size, calls/tokens, wall-clock limits,
number of repetitions and stop rule must be frozen before execution. They are
not invented after seeing a favorable score. A second generation that merely
uses more computation, retrieves exposed answers, or weakens the checker fails.
This protocol is not a launched campaign, endless self-edit loop or ASI proof.

## Alternation and the very large search space

The literal long-term request for hundreds of thousands of ideas is retained,
but has **not** been fulfilled as individually researched solutions. Current
inventory: 64 authored hypotheses; 204,800 raw combinations; compatible count
unknown. No claim of novelty or demonstrated benefit follows from either count.

Research expands the inventory only when a proposal has a distinct mechanism,
evidence basis, applicability limits, simpler control and falsifier. Deduplicate
equivalent mechanisms, exclude incompatible combinations, and record reasons
for retirement. Addressability is not execution or population; this document
launches no entities, tools, model calls or benchmarks.

At each cohesive boundary: **observed failure → research selection → bounded
development reproduction → frozen fresh transfer → independent decision**.
If the next step needs unavailable authority or an external environment, keep
that dependency explicit and select an independent in-scope question if one
exists. Do not replace empirical failure with another impressive-looking layer.

## Immediate selection and evidence discipline

### Fresh transfer and next bounded question (2026-10-12)

The formulation-bound transfer at `162e958c` is complete: four known-family
parameter cases, both arms zero accepted, stable delivery, three versus four
admitted public formulations and more treatment tokens. One later treatment
certificate was mathematically equivalent but noncanonical; the strict frozen
oracle still rejects it. Most certificate values were wrong. Neither an
interface count gain nor a formatting-only repair establishes stronger cognition.
The [sanitized receipt](../evidence/nyx-formulation-bounds-162e958c.json) retains
this negative result and actual compute; do not repeat the same manual arithmetic
strategy merely to seek a favorable sample.

Select H005/H009's existing finite-IR route next. A bounded mathematical surface
notation could remove bookkeeping of positional temporary references while
leaving every proposed operation/sign and the original task intact. The model
must still supply the mathematics. Lowering must reuse the existing exact
interpreter, reject unknown names, forward/cyclic bindings, unsupported syntax,
excess resource use and arithmetic faults, and never infer a missing formula.
Demonstrate correspondence and seeded rejection on separate development cases,
then freeze a fresh comparison against the current native representation.
Construction, translation and validation costs count. No new compiler or
experiment is claimed implemented by this research selection.

An additional primary method examined is
[PICARD](https://aclanthology.org/2021.emnlp-main.779.pdf), sections 2--3 and
the ablations: incremental parsing rejects invalid tokens and guards name scope;
the study separately measures exact match and execution across database instances.
Its inference hooks need decoder/token-score access, which this hosted NYX path
has not established. Do not claim PICARD is installed or copy its SQL accuracy
to NYX. The applicable design inference is narrower: distinguish lexical,
binding and semantic failures, test translation with an independent oracle,
and require fresh execution outcomes rather than grammar validity alone.

The working diagnostic distinguishes public-formulation structural rejection,
canonical serialization, as-written numerical mismatch and unclassified text.
It supplies no answer, changes no acceptance, and is not a reasoning upgrade.
Separate development tests must prove those noninterference properties before
any live run. Past epochs stay frozen and cannot be retroactively regraded.

Only the observed failure class selects the correction: malformed contract →
general interface repair; equivalent noncanonical value → separately considered
serialization repair without weakening this oracle; wrong value → reasoning or
formalization intervention; unknown text → retain uncertainty. Transport faults,
unreached tests and schema failures are not automatically reasoning failures.

Plan coverage: **PARTIAL / JUST-IN-TIME**. Direct principles: evidence over
confidence; generator requires independently validated detector; no
self-certification; scope and provenance precede action; useful complexity;
specification is not capability. Deferred: unbounded recursion, weight training,
trillion-population instantiation, unrestricted tool execution and production
or physical authority. Authority delta: **NONE**.
