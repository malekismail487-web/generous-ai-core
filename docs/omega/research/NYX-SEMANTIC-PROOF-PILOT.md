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
66 proved identities, 64 refuted identities, 540 exact grid evaluations and zero
checker disagreements. Seven planted-invalid/valid detector checks cover changed
statements, changed source, omitted obligations, executable text, literal emission
and false counterexamples. The component suite has 185 passing checks, including
matched-profile test-double cognition/repair composition and independent rejection.
Test doubles made no NVIDIA calls and establish no E4 cognition result.
Independent rejection remains in model feedback and the result history; a later
positive verdict for the identical artifact cannot erase that falsification.

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

## Omega plan coverage

Partial/just-in-time. Direct: D04 shared contracts, immutable proof obligations,
canonical subgoal reuse, verifier hierarchy and finite compute; D01 independent
acceptance and honest controls. Supporting: generator/detector separation,
critical falsification, dependency freshness, no action without provenance and
no authority expansion. Deferred: full strategy-diverse search, formalization
audit, Lean integration, held-out live comparison, typed abstraction transfer,
original discovery, recursion and broad benchmarks. Conflict: a green component
suite cannot be substituted for the plans' required cognitive gains.
