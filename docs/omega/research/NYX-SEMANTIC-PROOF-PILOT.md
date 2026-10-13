# Bounded semantic construction pilot

Status: implemented experimental component; deterministic/local evidence only.
No cognitive, official-benchmark, original-discovery or production promotion.

## Concrete change

NYX's existing cognition boundary can propose a symbolic polynomial construction,
request an owned bounded check, receive exact counterexamples, revise, and submit
only after an independently supplied evaluator accepts. This uses the existing
Nemotron completion interface, algebraic syntax frontend, native work budget,
plain-data guard and obligation DAG. It is not another model controller, sandbox,
execution language or evidence ledger. No task-specific solving formula is built
into the mechanism.

The checker normalizes rational polynomials in at most three variables, degree
eight, 256 terms and 4096-bit coefficients. Division is allowed only by a nonzero
rational constant; unsupported operations, exhausted budgets and unestablished
assumptions remain insufficient evidence. A candidate cannot replace the owned
statement, omit outputs, forge a branch parent or acquire environment authority.

Canonical dependency bindings allow equivalent constructions and independent
branches to reuse previously checked subgoals. Changing a dependent polynomial
invalidates that reuse; changing an unrelated polynomial does not. Evidence has
one checker provenance root, not one independent vote per node or retry.

## Independent checks and limitations

The secondary Python verifier does not trust TS normalization or cached status.
It independently parses the original expressions, checks original/compiled
statement agreement, propagates degree upper bounds, and evaluates with exact
`Fraction` arithmetic on a complete tensor grid. With established per-variable
degree bounds, agreement at degree-plus-one distinct points in each variable
proves a polynomial identity by interpolation. This is not an arbitrary sample
test or floating-point evidence. Wrong bounds invalidate the argument; see the
[Sage interpolation documentation and warning](https://doc.sagemath.org/html/en/reference/polynomial_rings/sage/rings/polynomial/multi_polynomial_ring_base.html#sage.rings.polynomial.multi_polynomial_ring_base.MPolynomialRing_base.interpolation).
The independent verifier is conservative when it cannot establish a constant
divisor syntactically; this is unsupported verification, not a reasoning failure.

Development replay covers 128 constructed/corrupted capsules and 130 obligations:
66 proved identities, 64 refuted identities, 535 exact grid evaluations and zero
checker disagreements. Nine planted-invalid/valid detector checks cover changed
statements, changed source, omitted obligations, executable text, literal emission
and false counterexamples. The original component checkpoint had 185 checks, including
matched-profile test-double cognition/repair composition and independent rejection.
Test doubles made no NVIDIA calls and establish no E4 cognition result.
Independent rejection remains in model feedback and the result history; a later
positive verdict for the identical artifact cannot erase that falsification.

Less-correlated parsing also discovered a verifier-interface defect: Python AST
classified the valid original symbol `True` as a boolean and rejected keyword
symbols such as `class`. Lexical name aliasing now preserves the original
namespace without adding constants or weakening its grammar. Development replay
version `/2` retains the same 128/130 counts but changes two capsule identities
to exercise this boundary; equal counts do not imply equal evaluation coverage.

The implementation is not Lean/mathlib, a general theorem prover, a full adaptive
ProofSearch policy, independent institutional replication or evidence that a
natural-language problem was faithfully formalized. That fidelity remains
explicitly unestablished. External mathematical/novelty review is still required
for original-research claims. The full goal and every older negative epoch remain.

## Falsifiable next comparison

Freeze fresh, structurally varied construction tasks before any model call.
Compare serial candidate repair with obligation-guided search using the same
Nemotron configuration, exact task statements, primitive tools, independent
acceptance, model/call/token/time caps and complete realized resource accounting.
Separate initial and repaired acceptance, unknown delivery, syntax, unsupported
verification, semantic counterexamples and independent disagreements. No best-of
accumulation or regrading development fixtures. Equal outcomes or more compute
without a reproducible acceptance/efficiency gain means no mechanism promotion.

The [functional-synthesis reference](https://people.csail.mit.edu/asolar/SynthesisCourse2020/Lecture10.htm)
motivates counterexample-guided search; it does not guarantee convergence or that
Nemotron can generate the needed mathematical constructions.

## Frozen live construction pilot

Version `nyx-semantic-construction-transfer/1` uses four new formal families:
triangular polynomial-map inversion, a dynamical invariant, a normalized
polynomial cocycle, and anchored norm composition. These are classic bounded
mathematical constructions, not original discoveries or frontier benchmark
proxies. They are distinct from kernel-development identities and earlier
interpolation/network parameter cases. The statements and population freeze
before inference; evaluator-validation witnesses exist only in offline tests
and are never supplied to the model or installed as solving tools.

The simpler control is serial NYX repair with the same native checking tool;
the treatment adds only the owned obligation/dependency packet and guidance.
This is not an untooled Nemotron control or a full strategy-search experiment.
Both use the separately labeled Super model, its existing native reasoning
profile, 2 logical/HTTP calls per stage, 8192 output-token ceiling, 2048 native
reasoning budget, 180-second original task leases and a 30-minute epoch ceiling.
Stage native limits are 2 requests, 100,000 work units and 2000 ms; independent
Python verification is bounded to 5 seconds. Arm order rotates across tasks.
Default Ultra configuration and all execution/production authority remain
unchanged. No raw model reasoning or candidate program enters the public report.

The independent oracle reuses the original Python verifier in a single-candidate
mode. It re-parses originals, establishes degree bounds and checks exact grids;
it does not rerun or inherit the primary normalizer's verdict. Fixed developer
verification subprocesses do not grant NYX a shell. Unsupported degree/division,
missing verifier, timeout and verifier-schema failures are explicitly ungraded
verification/infrastructure outcomes, not mathematical failures. Native
refutation and independently graded acceptance are reported separately.

Report physical/logical calls, known and unknown usage, prompt/completion tokens,
latency, native work and independent projection/grid/CPU costs. Equal ceilings
are not equal realized compute: pair matching requires equal call/HTTP counts,
known usage and at most 5% total-token difference. The predeclared outcome signal
requires a stable complete epoch, more accepted treatment cases, no per-case
regression and no greater inference compute per pair. Native work units are not
CPU time, so no total-compute equivalence is inferred. A single four-case epoch,
including a positive signal, cannot promote broad cognition without fresh
replication and ablation. Calibration is not collected and is not fabricated.

The updated component suite has 224 offline checks and zero model calls. It
validates all four statements, rejects planted false candidates, tests matched
wire settings/unique request identities, finite malformed retries, expired
epochs, missing verifier and sanitized custody.

The frozen live epoch completed at `c4fb84a1`, run `38426230789`: serial repair
accepted 4/4 first attempt; guided accepted 3/4 first attempt and 4/4 after one
repair. All eight candidates reached independent acceptance, covering 30
original obligations. Nine physical/logical model calls reported 18,985 tokens,
zero unknown usage and no delivery disruption. One guided inverse proposal was
rejected before native mathematical grading by the existing IR/contract gate;
the exact offending syntax is not retained and must not be guessed.

Control used 6279 tokens / four calls; guided used 12,706 / five calls. No pair
met the frozen realized matching condition, and every guided pair used more
inference. Thus the added guidance has no supported outcome/efficiency gain and
is not promoted. The live construction/checking composition is demonstrated in
this bounded scope; original mathematics, broad proof-search, untooled-model
superiority and official benchmark progress remain unestablished.

The [custody-verified receipt](../evidence/nyx-semantic-construction-c4fb84a1.json)
reconciles terminal report, artifact SHA256/CRC, all 20 source bindings,
configuration and corpus. Clean Linux CI `38426231054` passed 110 suites / 15,942
checks, TS5.8.3 zero, secret scan, build, package and independent replay. The
temporary push launcher is removed. Preserve these exposed results; do not
tune the mechanism to them. Next use the simpler verified native composition
for prospective science or genuinely strategy-requiring mathematics with
development-only diagnosis, fresh independent acceptance, stronger controls
and honest compute—not another attempt to force this guidance positive.

## Omega plan coverage

Partial/just-in-time. Direct: D04 shared contracts, immutable proof obligations,
canonical subgoal reuse, verifier hierarchy and finite compute; D01 independent
acceptance and honest controls. Supporting: generator/detector separation,
critical falsification, dependency freshness, no action without provenance and
no authority expansion. Deferred: full strategy-diverse search, formalization
audit, Lean integration, fresh causal replication/ablations, typed abstraction transfer,
original discovery, recursion and broad benchmarks. Conflict: a green component
suite cannot be substituted for the plans' required cognitive gains.
