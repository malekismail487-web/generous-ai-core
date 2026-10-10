# NYX benchmark capability program

### Quality-policy applicability: reproduced baseline-formatting discrepancy

Before another live model run, a separate development diagnostic reproduced a
policy applicability problem in `omega-public-static-candidate/2`. Four original
stubs have the same normalized AST and the same measurements (one declaration,
complexity one, nesting zero), but their nonblank line counts are **3, 4, 4, 3**.
The exact same readable binary-search candidate is **REJECTED, ADMITTED,
ADMITTED, REJECTED**, respectively. Wrapping the original throw statement or
adding a comment switches the effective declaration-delta limit from four to
twelve. The candidate, objective, paths and other checks do not change.

An independent linear-search oracle checked all 126 nondecreasing arrays of
length zero through four over five integer values, with seven target values:
**882 finite cases**. Both the named-alias implementation and a readable direct-
input-read implementation pass, with inputs unchanged: **1,764 candidate
evaluations**, not 1,764 tasks. The second implementation is admitted under all
four baselines without packing declarations or relaxing any threshold. This
shows a feasible candidate exists for this objective; it does **not** prove
that any arbitrary refactor is equivalent, nor that the tiny limit is impossible.
The equivalence observation applies to these plain JSON inputs, not getters or
proxies. Syntax, network-access and input-mutation negative controls still reject.

The production policy, original-state accounting, authority, default model and
all frozen outcomes remain unchanged. No inference was performed. This is an
**evaluation-validity finding, not a cognitive gain or a revised benchmark score**.
The reproducible diagnostic is in `omegaCandidateEngineeringAdmission.test.ts`;
its [sanitized receipt](../../../docs/omega/evidence/nyx-quality-policy-applicability-dc049077.json)
records the unchanged runtime hashes, dirty evaluated test-source identity and
109 suites / 12,178 checks / zero failures, TypeScript 5.8.3 zero diagnostics,
secret scan zero findings, and passing package/inventory checks. A separately versioned,
formatting-invariant task-applicability correction requires explicit review;
padding a fixture or silently raising a limit is not an acceptable workaround.

The metamorphic test follows the general idea of comparing controlled
semantics-preserving variants, not arbitrary equivalence certification
([primary compiler-testing research](https://arxiv.org/abs/2504.04321)).
Research on code understandability also motivates treating complexity metrics
as limited empirical indicators, not universal quality proofs
([216-developer study](https://arxiv.org/abs/2303.07722)). Neither study establishes
NYX's thresholds, this policy correction, or any NYX capability improvement.

### Bounded runtime-observation review: candidate experiment, not promoted

The [frozen live run](https://github.com/malekismail487-web/generous-ai-core/actions/runs/38027149037)
at `d2900344` is complete. The
[verified receipt](../../../docs/omega/evidence/nyx-runtime-observation-transfer-d2900344.json)
pins the artifact/report SHA256, all 19 source hashes, actual configuration,
log/freeze agreement and cleanup. Both arms achieved **4/4 functional acceptance,
0/4 full acceptance**. Every first and second candidate passed the finite public
and private functional oracle; all 16 candidates were rejected by unchanged
structural quality limits. The 100 passing private case evaluations include
repeated arm/iteration evaluations of just 25 unique cases, not 100 tasks.

Control used **49,620 tokens / eight calls**; treatment used **54,541 / eight**.
All four pairs were provider-stable; three were within 10% realized model calls,
tokens and scheduled verifier-work proxy. There were no provider, retry, schema,
syntax or truncation failures. Four treatment repair prompts received samples,
but **zero post-pass reviews were exercised**, because no candidate passed static
admission. Observation capture works; no acceptance/cognitive gain is established.
No raw reasoning or generated source was persisted.

One pair began with the same candidate. Literal first-prompt digests differed in
all pairs; host-generated observation identities are included and semantic
normalization was not recorded. Do not reinterpret first-candidate variation as
a treatment gain. The recurring-decimal pair retained declaration delta 14
after both repairs; the remaining final candidates also exceeded the delta-four
limit, with additional complexity failures on scheduling. There were no observed
functional regressions. The next supported investigation is general algorithmic
restructuring that genuinely satisfies the unchanged quality contract, not more
observation layers, raised thresholds or cosmetic declaration packing. These
tasks are now exposed development material and must not be rerun as fresh.

Frozen Linux CI: **109 suites / 12,158 checks / zero failures**, TypeScript 5.8.3
zero diagnostics, secret scan zero findings, production build 12.68 seconds,
package smoke passing. Production was not deployed; default Ultra and authority
remain unchanged.

The next frozen experiment compares `SCOPED_REVIEW_CONTROL` with
`RUNTIME_OBSERVATION_REVIEW` on four newly authored cross-domain engineering
objectives. Both use the existing R3 repository session, the same pinned TEST
entrypoint, public/private scorer and cumulative original-state quality oracle.
Both permit one post-pass review within the existing two model calls/two candidate
iterations. Only treatment receives up to four bounded synthetic runtime samples.
Inputs are predeclared; samples contain actual outputs, not expected answers.
Model counterexample prose remains prose: this experiment does **not** implement
dynamic arbitrary test generation or give the model a new tool.

`NO_ACTION` can retain only the exact candidate already independently admitted
by the host. It cannot certify an initial failure, rescue a quality rejection,
ignore a later regression, renew a lease or evade cancellation. Malformed sample
streams are unavailable evidence, never success. Ordinary execution diagnostics
and private expected-output grading remain unchanged. Private inputs are visible
in the fixture; expected outputs are withheld. These same-author fixtures are E3,
not independently authored benchmark holdouts or cross-platform replication.

The falsifiable job is whether execution observations improve objective-level
acceptance over the identical review cadence, without more realized model compute
or relaxed gates. All first and final candidates, retention versus actual repair,
schema/provider failures, tokens, verifier work and regressions remain separate.
Case-invocation accounting is a verifier-work proxy, not total CPU accounting.
No broad cognitive promotion follows from infrastructure tests alone. Default
Ultra, source-write permissions, production and general network authority remain
unchanged; disposable isolation is not a proven hostile-code/network boundary.

The [authors' metamorphic-testing survey](https://i.cs.hku.hk/~tse/Papers/2010s/hlmtCSUR.html)
motivates distinguishing executable observations and necessary relations from
oracle authority. This implementation is a bounded observation/review experiment,
not a claim that model-proposed relations are correct or formal verification.
Ω plan coverage is **PARTIAL / JUST-IN-TIME**: observe–diagnose–repair,
generator/detector separation, unchanged independent acceptance, lease/provenance,
bounded resources and capability-versus-authority. Dynamic experiments, broader
benchmarks, recursion, biological expansion and production promotion are deferred.

### Concrete local refactor transfer: zero actionable coverage, not promoted

The [frozen live run](https://github.com/malekismail487-web/generous-ai-core/actions/runs/38024882912)
at `8b17b103` completed four new objectives in both arms. The
[receipt](../../../docs/omega/evidence/nyx-local-refactor-transfer-8b17b103.json)
verifies the artifact SHA256, log/report/freeze agreement, all 18 source hashes,
actual model controls, source preservation and owned cleanup. Control achieved
**2/4 full acceptance, 3/4 functional acceptance**; treatment achieved
**1/4 full acceptance, 3/4 functional acceptance**. Control used 28,865 tokens
and six calls; treatment used 35,891 tokens and seven calls. Three pairs were
within 10% realized calls/tokens/verifier work; all four were provider-stable.

The pure bounded proposer offered adjacent return-temporary elimination,
primitive-constant substitution and opposite-boolean-return simplification,
not automatic rewriting or a new compiler. Both arms kept identical first-edit
configuration, native-none Super model, original-state quality limits, grammar,
execution/private oracle, authority and finite budgets. However, **none of the
three treatment repair prompts contained an applicable proposal**. This is a
coverage/integration falsification, not evidence that executed local refactors
improve cognition. The graph pair began with the same candidate; control alone
repaired its declaration excess. Other first-candidate differences occurred
before treatment exposure. No broad causal claim follows from this single epoch.

All 13 source emissions were valid and untruncated, with zero provider,
infrastructure, schema or unknown-usage failures. Bag difference remained 4/5
private cases in both arms; median remained quality-rejected in both arms.
Neither the exact source-level hidden defect nor its cause is invented from
aggregate pass counts. First attempts and repairs remain separate; no hidden
answers or scores reached cognition. All four test-only references passed the
unchanged real lifecycle, execution, private and quality gates. These objectives
are now exposed development tasks, not future fresh holdouts.

Development tests reproduce observable anonymous-function naming under the
[ECMAScript binding rules](https://tc39.es/ecma262/multipage/ecmascript-language-statements-and-declarations.html#sec-let-and-const-declarations)
and verify single-evaluation boolean conversion against
[ToBoolean](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-toboolean).
Guards also reject captures, writes, dynamic scope, disposal bindings,
unsupported typed syntax and resource-heavy inputs. They are not a complete
whole-program equivalence proof. A post-epoch supporting correction now omits
the entire proposal field when there is no applicable rewrite: its provider
payload equals the simpler control exactly. Proposal v2 remains experimental,
opt-in and unpromoted. No additional live rerun was launched.

Frozen-candidate Linux CI passed **109 suites / 12,063 checks**, TypeScript 5.8.3
zero, build, package smoke, secrets and inventories. Windows Device Guard
blocked the local build executable; it was not bypassed. Pure-helper profiling
on a 6,519-byte authored program measured median 5.21 ms / p95 12.27 ms over 50
samples, not end-to-end matched host CPU. Default Ultra, production and authority
remain unchanged. Plugin discovery established no quota-capable benchmark
environment and changed no connection or permission.

Next inspect existing bounded runtime observations and whole-function structural
repair on separate development programs. A future comparison must exercise an
actual mechanism on new objectives; added prompt detail, empty proposal coverage,
test volume and infrastructure are not cognitive gains.

### Binding-use repair transfer: no acceptance gain, not promoted

The [frozen live run](https://github.com/malekismail487-web/generous-ai-core/actions/runs/38022952653)
at `9850e645` evaluated four fresh objectives in both arms. The
[receipt](../../../docs/omega/evidence/nyx-behavior-repair-transfer-9850e645.json)
verifies artifact/log agreement, all 17 source hashes, actual native-none wire
controls, source preservation and owned cleanup. Both arms finished **0/4 full
acceptance, 2/4 functional acceptance** at their last evaluated candidates.
There is no cognitive promotion or default configuration change.

The treatment added bounded, source-bound lexical binding-use facts only after
publicly passing execution plus a quality rejection. Both arms retained the
same first-candidate configuration, original structural budget, declaration
sites, strict intent grammar, private oracle, authority and finite call/token/
wall limits. Six quality-repair prompts occurred, three with treatment. Two
pairs were within 10% realized calls/tokens/verifier work; none gained acceptance.
Treatment spent 43,435 tokens versus 40,032 control tokens. One treatment repair
regressed from 8/8 to 7/8 private cases while still passing public checks. Public
regression counts alone therefore do not establish behavior preservation.
Graph treatment's functional success predates treatment exposure and is not a
causal gain. First-attempt and repaired outcomes remain separate.

All 16 responses contained syntactically valid, untruncated source; provider,
infrastructure and unknown-usage counts were zero. Both run-fold second responses
repeated a falsified candidate and were rejected as semantic no-op repairs, not
transport failures. The other three pairs remained quality-rejected. Sources
were not retained; the exact low-level cause of each semantic bug is not inferred
from pass counts. These tasks are now exposed, not future fresh holdouts.

Trusted development programs separately reproduced call/getter repetition and
accumulator regressions. Lexical summaries deliberately assert no purity,
liveness, alias or equivalence proof. Test-only reference candidates demonstrate
that all four tasks can satisfy the unchanged public/private/quality gates.
This design follows the separation of repair tests from independent evaluation
in [patch-overfitting research](https://people.cs.umass.edu/~brun/pubs/pubs/Smith15fse.pdf),
not a claim that additional feedback itself improves reasoning.

Linux CI passed **109 suites / 11,958 checks**, TypeScript 5.8.3 zero, build,
package smoke, secret scan and inventories. Experimental `BINDING_USES` remains
opt-in, unpromoted; the automatic launch trigger is removed. Next investigate
bounded behavior-preserving refactor operations on separate development programs
rather than add another prompt-only layer or weaken the oracle. No new plugin
connection, permission expansion, production change or SEC-003 work occurred.

### Original-budget transfer: one acceptance gain, no general promotion

The [frozen run](https://github.com/malekismail487-web/generous-ai-core/actions/runs/38020783952)
at `5a44bb78` completed all four fresh tasks in both arms. The
[receipt](../../../docs/omega/evidence/nyx-original-budget-transfer-5a44bb78.json)
verifies the artifact/log agreement, 17 frozen source hashes, actual native-none
wire controls and cleanup. Control finished **3/4 functional, 0/4 full acceptance**;
budget treatment **1/4 functional, 1/4 full acceptance**. Treatment solved the
join on its first call (5,051 tokens); control spent two calls/11,083 tokens and
failed. That is one fresh no-more-measured-compute acceptance gain, not replicated
or general cognitive improvement. The one 10%-realized-matched pair, scheduling,
had no accepted solution. No global promotion is justified.

There were 15 physical calls, 82,628 reported tokens, no unknown usage, provider
or infrastructure failures, and 15 syntactically valid, untruncated sources.
One control framing interaction failed semantic counterexample constraints;
source validity is not intent validity. Subsequent treatment repairs broke
previously passing framing and scheduling behavior. Affine treatment produced
no valid private artifact: the exact cause is unknown and unreached hidden
checks are not scored as reasoning failures. Preserve every first/repaired
outcome, not best-of successes. These tasks are now exposed.

Linux CI passed 109 suites/11,881 checks, TypeScript zero, production build,
package smoke and inventories. A prospective receipt check now distinguishes
pre-candidate phase from physical call number during correction/retry; original
frozen evidence is unchanged. Default Ultra, authority, leases and production
remain unchanged. Next reproduce preservation failures on separate development
tasks before selecting a general refactoring correction.

Plugin discovery did not establish a quota-capable runner. Docker's
[official storage-option documentation](https://docs.docker.com/reference/cli/docker/container/run/#set-storage-driver-options-per-container---storage-opt)
requires XFS with `pquota` for `overlay2` writable-layer size limits. No new
account, permissions, charges or infrastructure changes were made; official
writable TerminalBench/SWE profiles still need an approved, empirically proven
quota environment rather than a removed boundary.

### Original structural budget: fresh transfer experiment

`NYX_ORIGINAL_BUDGET_TRANSFER=1` compares existing source-site repair guidance
with the same stack plus exact original-state structural totals before its first
candidate. Four new objectives cover stable relational joins, strict UTF-16
framing, exact affine skip-ahead and weighted interval optimization. The control
already receives the public policy; treatment translates that policy and the
original authorized file's AST into concrete totals. No solution or hidden score
enters cognition. After a candidate, original-state guidance is unavailable;
both arms retain identical bound post-rejection source-site feedback.

Both arms use separately labeled Super native-none, length-bounded hosted
grammar, unchanged local parser, original-state quality, public verifier and
private literal oracle. Shared limits are two logical/physical calls including
retries, two candidates, three verifier executions, 8,192 output tokens per call,
155 seconds per task/arm and 22.5 minutes per epoch. Reported tokens, first and
repaired acceptance, private outcomes and actual wire configuration remain
separate. Realized match is 10% for calls/tokens/verifier work; host detector CPU
is included in wall-clock time but not separately profiled. No more-measured-
compute wins are reported separately. Clean initial failures and test-only
references pass real Omega lifecycle, unchanged admission and exact oracles.

This is an unpromoted hypothesis, not a capability gain. Same-session evaluator
authorship is not independent replication, disposable repositories are not
proven hostile-code isolation, and a development transfer score is not an
external benchmark score. Default Ultra, reserved benchmarks, authority,
leases, credentials and production are unchanged.

### Native reasoning transfer: no acceptance gain

The [frozen live run](https://github.com/malekismail487-web/generous-ai-core/actions/runs/38006515872)
at `f999513d` fully attempted all four new tasks in both arms. Actual wire settings,
16 source hashes, report/log agreement and owned cleanup are verified in the
[receipt](../../../docs/omega/evidence/nyx-native-transfer-f999513d.json).
Native-none and bounded-native-reasoning both finished with **3/4 functional,
0/4 quality, 0/4 full acceptance**. Every assessed public-test-passing candidate
exceeded the unchanged declaration limit. Native reasoning did not consistently
reduce that count, and one Boolean-model repair lost a previously passing hidden
case. Its register repair was syntax-rejected; the preceding candidate remains
functionally correct but unaccepted. No best-of accumulation is used.

Control used eight physical calls / 38,070 reported tokens; treatment eight /
52,742. No unknown usage, provider or infrastructure failures occurred. No pair
matched realized compute within 10%, and treatment used more measured compute
on every pair. Promotion is **FALSIFIED**: extra thinking did not buy an acceptance
gain here. The corpus is now exposed, not a benchmark score or evidence of ≥80%
all-benchmark readiness. Next investigate actionable structural-budget guidance
using the existing detector; do not relax admission or add another cognition layer.

Candidate Linux CI passed 109 suites / 11,825 checks, TypeScript zero, production
build, package smoke and inventories. The one-shot trigger is removed. Default
Ultra, original baselines, authority, leases and production remain unchanged.

### Native reasoning allocation: fresh controlled engineering transfer

`NYX_NATIVE_REASONING_TRANSFER=1` freezes four new objectives: weighted Unicode
edit distance, exact rational aggregation, versioned register reconciliation and
bounded Boolean model enumeration. Literal private expectations and test-only
reference implementations are evaluator-owned and pass the real existing R3
loop, unchanged static admission and exact scorer before model inference. The
references are not supplied to NYX. Authorship is same-session E3, not independent
replication or reserved external benchmark content.

Both arms use explicitly labeled Super, the length-only decision-required grammar,
identical prompts/feedback policy, 8,192 total output-token ceiling, two logical
and shared physical calls including retries, two iterations, existing authority,
verification and time/mutation limits. Control uses native `none`; treatment uses
the existing native `high` setting with a finite 2,048-token reasoning reservation
inside that ceiling. No new cognition, provider, repair stack or authority is built.
[NVIDIA documents these native controls](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-super-120b-a12b-infer).
Safe wire projections verify actual settings without persisting messages, headers,
model reasoning or generated source. Unknown arms fail closed. The default Ultra
configuration remains unchanged.

Hypothesis: reasoning allocation helps form coherent implementations and preserve
function while satisfying structural quality constraints. Falsify on no reproducible
quality-accepted gain or reduced repair cost on fresh tasks at matched realized
compute, any gate weakening or unexpected authority. Report first and repaired
outcomes separately, every failure class, latency, calls, tokens, verification work
and cleanup. Equal ceilings are not equal compute; retain the existing 10% paired
parity check and no-more-measured-compute test. Live benefit remains unverified.
Plan coverage: evidence-linked diagnosis and controlled ablation; supports bounded
reasoning, generator/detector separation and provenance; defers default promotion,
production, recursion and device integration. Coverage is PARTIAL / JUST-IN-TIME.

### Fresh length-only transfer: delivery recovered, acceptance did not

At frozen `f8621c51`, both arms fully attempted four fresh engineering objectives
with unchanged public/private checks and original-state quality admission. Neither
produced a fully accepted first or repaired candidate: control **0/4**, length-only
treatment **0/4**. The control's last evaluated candidates were functionally correct
on 2/4 objectives, the treatment's on 0/4; neither passed quality. On expression
evaluation, the treatment first passed every functional case and then regressed
after quality feedback. Transaction repair also lost previously passing behavior.
No best-of accumulation or quality waiver is applied.

All 16 responses reached JSON/source inspection; 15 sources were syntactically
valid and one control source was rejected. There were zero provider failures,
unknown-usage calls or truncations. Total: 16 physical calls, 96,587 reported tokens.
Four pairs were provider-stable, only two matched realized calls/tokens/verifier
work within the frozen 10% tolerance. These synthetic E3/E4 tasks are now exposed,
not independent replication, external benchmarks or evidence of frontier readiness.

The [sanitized receipt](../../../docs/omega/evidence/nyx-length-transfer-f8621c51.json)
preserves the original per-iteration failures, artifact/report SHA256, 16 source
digests, log agreement and verified cleanup. Linux CI passed 109 suites / 11,782
checks, TypeScript zero and production build. Promotion is **FALSIFIED**. The
next bottleneck is coherent structural repair that preserves functional invariants,
not another grammar layer. Future failure accounting distinguishes valid-JSON
semantic/no-op and source-bound rejection from malformed JSON; this does not
rewrite the frozen report or change any acceptance threshold. Default Ultra,
authority, leases and production state remain unchanged.

### Explicit regex-free contract and fresh transfer

At frozen `4edbd7b8`, both the prior decision-required grammar and the explicit
length-only policy passed all three development action shapes (edit, insufficient
evidence, request available evidence): six physical calls, 19,471 reported tokens,
zero unknown usage. The [receipt](../../../docs/omega/evidence/nyx-length-contract-4edbd7b8.json)
verifies six source digests, artifact/log agreement and cleanup. Linux CI passed
109 suites / 11,746 checks, TypeScript zero, production build, package smoke and
W0 inventory. Windows' Device Guard blocked the local Vite launcher; no bypass
was attempted. Small action compatibility does not certify cognitive improvement.

The next epoch freezes four new objectives: strict quoted-row parsing, exact
decimal half-even quantization, nested cell transactions and reachable expression
evaluation. Both arms retain the same model, prompts, authority, 8,192 output-token
ceiling, two shared physical attempts, two candidate iterations and original-state
quality/private oracles. The only treatment is request-derived length/array
generation bounds without prose regex. Test-only references must pass the real
Omega loop and unchanged quality checks before inference; their initial static
quality failures were repaired without changing any expected result or threshold.
Report first-attempt and repaired acceptance, delivery failures, hidden failures,
quality rejection and realized compute separately. These synthetic tasks have
same-session E3 authorship, not independent replication or external benchmark status.

### Full-protocol generation recovery: escaping diagnosis

At frozen `cde45497`, four synthetic copy requests all returned JSON, three
satisfied the local shape bounds, and only one preserved the benign strings
exactly. One regex-bound response emitted four items despite the three-item
limit. This does **not** reproduce or explain the eight non-JSON engineering
responses at `e71123b0`; simple-schema compatibility is not full-protocol
compatibility. The [sanitized receipt](../../../docs/omega/evidence/nyx-generation-escaping-cde45497.json)
pins the artifact, four source digests, log agreement, four physical calls and
545 reported tokens (zero unknown usage).

The diagnostic candidate's CI passed all 11,719 deterministic checks but failed
the stale W0 environment-variable inventory. That inventory is refreshed, not
its detector weakened. An explicit, opt-in length-only generation policy is
tested next; it preserves historical grammars, all local semantics and authority
checks, and the default Ultra configuration. No cognitive promotion or benchmark
score follows from this source-interface work.

This is a reproducible **data/evaluation harness**, not a new executor or a new model. It does not claim a cognitive improvement, an official leaderboard score, or near-perfect readiness. Its format tests are development fixtures, never NYX performance evidence.

### Bounded transient recovery and explicit Ultra phase controls

An opt-in `WITHIN_SHARED_BUDGET` provider profile can use still-owned HTTP
attempts after more than one transient error. It requires an explicit caller
deadline, retains every ancestor dispatch limit, honors the existing cooldown,
and cannot refill the task budget or extend its lease. Historical fixed-retry
behavior remains the default. Development fault schedules exercise two 503s
followed by delivery, persistent outage, cancellation and nested limits. This
repairs premature termination, not NVIDIA service availability.

`SESSION_NATIVE_PHASE_CONTRACT` reuses the existing session-owned read/reply
contract, parser and R1 executor. Only generation controls differ: Ultra's
documented native `reasoning_effort=none` for the required read intent and
`medium` with a 2,048-token reasoning budget for the answer. The 8,192 output-token
ceiling, two logical calls, four shared physical attempts, original 180-second
lease, question observation and independent oracle remain unchanged. Reference:
[NVIDIA Ultra API](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-ultra-550b-a55b-infer).

The data-free diagnostic compares this candidate with the unchanged session
contract on the same two **repeated development objectives**, counterbalanced
and with identical transport recovery. It is not fresh held-out transfer.
Sanitized evidence adds JSON-kind/fence/thinking-delimiter flags without retaining,
extracting or repairing raw output. Failed readiness now exits nonzero even when
evidence capture succeeds. Four correct graded read/answer attempts with stable
known usage are required; a workflow artifact alone is never a readiness pass.
Actual compute matching remains measured, not inferred from equal ceilings.

Ω plan coverage: directly implements evidence-linked failure classification,
bounded recovery and typed action confinement; supports provenance, adversarial
verification and compute accounting; defers new cognition, production promotion
and other benchmark-family admission. No authority delta or conflict with the
R1/lease/strict-parser constraints is intended. Coverage remains PARTIAL / JUST-IN-TIME.

## Session-owned action phases (development candidate)

The successful deliveries in the offset-16 comparison exposed a generic protocol
gap: a JSON-object request and a broad action menu did not reliably produce the
required read-then-answer sequence within two logical calls. The existing schema
experiment guides generation but does not own the runtime phase. The opt-in
`NyxChatSession.actionContract` now expresses `REPLY_ONLY` or `READ_THEN_REPLY`
for an arbitrary safe relative file path. The session sends only the current
phase's schema/instructions and independently rejects out-of-phase actions even
when the provider ignores that schema. Only an actual successful, non-sensitive
observation advances the phase. Each turn starts unobserved; caller mutation,
old conversation history and model claims cannot advance it. The contract narrows
requests, never grants R1 scope, extends a lease or certifies answer correctness.
Historical defaults and frozen comparison interpretations remain unchanged.

`CONTRACT_DIAGNOSTIC` exercises the candidate via the existing text epoch, session,
provider, R1 executor, disposable repository and independent integer oracle. It
opens no benchmark dataset. Two new development objectives are counterbalanced
between the existing schema-only configuration and `SESSION_ACTION_CONTRACT`.
Both arms use the same fixed model, 8,192 output-token ceiling, two logical calls,
four shared physical attempts, original 180-second task lease, scoped read and
unchanged acceptance checks. The existing two-consecutive-delivery-failure circuit
remains enabled. Record realized compute, unknown usage and incomplete pairs;
equal ceilings are not proof of equal realized compute. The experiment establishes
at most local/live protocol behavior, never a cognitive or broad benchmark gain.
The narrow push trigger must be removed when this one-shot is frozen.

Ω plan coverage: directly implements no action without provenance, no observation
without evidence and plan/capability/authority separation. It supports the live
engineering substrate and generator/detector separation. Broader planning, memory,
recursion, additional cognitive layers and production/default promotion are
deferred. No conflict with the existing authority model was identified: parser,
R1 authorization, private oracle and rollback/cleanup remain independent.
Coverage remains PARTIAL / JUST-IN-TIME, not complete corpus certification.

The development comparison at `3230f9ce` is terminal in run 37623036780.
Both attempted configurations successfully read the authorized file. The
schema-only control then emitted non-JSON after recovering a transient request;
the session-contract candidate's answer request received repeated HTTP 503s.
The unchanged delivery circuit stopped after two affected attempts: two of four
attempts executed, zero independently graded, two unexecuted. Six physical
requests, 1,426 reported tokens and three requests of unknown usage are retained
in `docs/omega/evidence/nyx-session-action-contract-3230f9ce.json`. Its original
report exactly matches the downloaded, hash-verified artifact. No stable or
compute-matched pair, live answer-phase success, cognitive gain or benchmark score
is established. Local phase enforcement passed adversarial tests; reliable live
completion remains unverified. The optional candidate is not a new default.
Automatic replay is removed; another unchanged experiment needs an external
delivery readiness change, not additional speculative architecture.

## Actual composition

Existing Nemotron-backed NYX cognition → existing typed Omega execution → candidate artifact → independent benchmark verifier → this harness's bound, sanitized record → general capability-gap investigation.

`BenchmarkAdapter.invoke` is a **trusted integration seam**. It receives only allowlisted model-facing input, remaining resource limits and sanitized feedback. It does not receive `PreparedTask`, its private scorer, expected answers or authority tokens. A provider-only integration must be named `RAW_MODEL`; it must not be passed off as current NYX. Actual current/candidate NYX adapters must call existing NYX/Omega machinery. The ARC development adapter below does so; other official-family execution integrations remain unavailable.

The adapter must enforce remaining limits using the existing provider/tool leases, honor cancellation and obtain usage from actual provider/execution evidence. The harness independently checks returned usage and bounds caller completion, but cannot stop an arbitrary malicious callback from continuing work in another process. Unknown in-flight usage stops retries; it is not zero cost. No arbitrary plugin loading is supported. The callback boundary is process-local trusted composition, not an OS sandbox.

## Operating commands

`npm run omega:benchmark -- --help`

- `score-arc --task task-envelope.json --prediction predictions.json`: exact local scoring of supplied ARC-format predictions, including both guesses and every test output.
- `export-prediction --task task-envelope.json --artifact artifact.json --model model-id`: SWE patch or HLE response export, ARC predictions, or explicitly non-official FrontierMath export. It never executes the artifact. Terminal text cannot stand in for a Harbor agent.
- `replay --campaign frozen-spec.json --tasks envelopes.json --transcripts arms.json --reports reports.json`: replay imported inference/verification records; no new inference, network or shell. Imported timing and custody are labeled as such. Expiry is replayed against imported durations, not misrepresented as live authorization.

Task envelope: `{family,taskId,tier,source,record}`. Source contains `{dataset,revision,contentDigest,visibility,kind,provenance}`. `contentDigest` is the existing `theoryDigest(record)` (recursive key-sorted JSON SHA256), **not** raw file-byte SHA256. Task arrays and campaign task digests must have identical order. Freeze the dataset revision, each input/oracle digest, model/configuration, each actual NYX source version, tools, authority and verifier before the run. Record environment/execution identities and each arm's inference mode. Replays require `IMPORTED_TRANSCRIPT`; synthetic test adapters remain `SYNTHETIC_PROTOCOL_TEST`, never E4 model evidence. Do not use mutable `latest` as a dataset version.

Keep private task/oracle files outside the tracked repository and outside model inputs. Do not commit benchmark answers or unnecessary raw responses. Replays must be backed by retained provider/tool artifacts under authorized custody; JSON hashes alone do not establish that the supplied transcript is true.

Runnable **format-only** example (authored synthetic fixture, not an official ARC task and not model-generated):

```powershell
npm run omega:benchmark -- score-arc --task scripts/omega/benchmarks/fixtures/arc-format-task.json --prediction scripts/omega/benchmarks/fixtures/arc-format-predictions.json
```

## Three tiers and failure feedback

DEVELOPMENT may influence architecture. VALIDATION must use independently authored, unseen inputs with no shared answer/template shortcuts. SEALED requires protected/private source; public samples cannot be relabeled SEALED. A sealed candidate is frozen before task exposure. The harness allows **one final artifact per sealed run and no oracle-guided repair**; a model may still do authorized internal reasoning and development-test work within its unchanged limits.

If a sealed failure influences design, append it to `TaskExposureHistory`; future unbiased execution rejects the same normalized input even if its ID, source label or tier is changed. This is an exportable process-local history, not a durable or authenticated global registry. The evaluator/operator must preserve it across campaigns; the constructor validates imported history, and CLI replay accepts `--exposure history.json`. Public dataset exposure during model training is unknown unless independently established; a private tier label cannot prove a model never saw a problem. Digest disjointness detects exact reuse, not semantic equivalents. Distinct candidate/verifier source identities are required but do not alone establish independence; evaluator custody remains external to the candidate.

Register a failure using `createCapabilityGap` in the existing capability-gap program. The enforced workflow is:

classification → independently authored development reproduction → separate mechanism test examples → matched mechanism-off/on ablation → fresh validation transfer → benchmark reevaluation eligibility.

Exact benchmark input reuse, skipped steps, recycled development inputs in transfer, unsupported ablation and unsupported transfer are rejected. Semantically independent tasks and honest evidence remain evaluator responsibilities; the record explicitly does not claim digests prove independence. Negative results are preserved; creating a gap does not grant authority or promotion.

## Official-family status

| Family | Implemented here | Still needed for actual NYX evaluation |
|---|---|---|
| SWE-bench | Private-test stripping, patch export, exact candidate-bound per-instance report import, unique cache IDs | NYX task/repository adapter; authorized official Docker environment |
| Terminal-Bench | Instruction-only input, single-step binary Harbor reward import, checksum/trial binding | Real bounded NYX Harbor agent and isolated terminal authority |
| ARC-AGI-2 | Strict grid input, private test output custody, official-compatible exact two-guess scoring/export, actual bounded NYX development adapter | Official protected run and broader capability evidence |
| HLE | Question/image input only, response export, independent judge result import | NYX expert-answer/multimodal adapter; authorized independent judge |
| FrontierMath | Problem-only input, normalized external receipt, honest sample/variant distinction | Authorized protected tasks and variant-specific verifier/NYX integration |

Pinned upstream format sources are in `upstream-pins.json`; no official tasks were downloaded for contract development. Local inspection found no Docker command on this Windows host. This blocks local official container runs; it does not establish an inability to solve the tasks. Existing Windows Python aliases were not treated as proven runtimes.

SWE-bench cache reuse is keyed by run/instance, so every campaign/arm/task/attempt/artifact gets a unique run identity. Imported reports bind campaign, exact task, source version, artifact, attempt, evaluator version/source, environment and raw report digest. The receipt is `CALLER_ATTESTED_NOT_AUTHENTICATED`, not a signature or independent management-plane proof. FrontierMath's normalized receipt is explicitly **not** an invented Epoch official schema. Unsupported multi-step Harbor reports fail closed.

## Measurements and promotion

Four requested arm slots always remain in the population, including unavailable arms. Report first-attempt accepted, repaired accepted, final accepted, quality accepted/not evaluated, actual logical/physical calls, HTTP attempts, tokens and unknown usage, tool work, latency, retries and distinct failure classes. A missing verifier/environment/authority is not PASS, FAIL or a guessed cognitive score. Unreached hidden tests are not hidden-case reasoning failures.

Equivalent-tool controls must share exact model/configuration/authority/tool envelope. Raw model intentionally lacks equivalent tools and is reported separately. Matched realized compute requires complete usage, provider stability and prospectively frozen tolerance for calls/tokens/tool work (maximum 10%, default experimental choice may be zero); nominal equal budgets alone are insufficient. Replay correctness is not evidence of model quality. Functional SWE success is `quality=NOT_EVALUATED` until the existing independent engineering-quality oracle also executes. HLE official calibration is not replaced by our separately named binary Brier statistic.

Independent verifier consumption is recorded separately and included in realized-compute checks. An external judge without usage evidence leaves verifier usage unknown and prevents a full compute-match claim. The native ARC verifier's work unit is tested outputs, not CPU cycles or all hashing overhead. False acceptance remains unknown until a separate audit executes, not a fabricated zero.

No automatic broad promotion exists. Review requires fresh, non-contaminated task populations, independent evaluation, matched controls, replication and actual capability gains. The target of near-100% remains an aspiration, not a score inferred from architecture.
# Existing NYX execution adapter

## Actual benchmark acquisition and baseline epoch

`docs/omega/evidence/benchmark-acquisition-2026-10-03.json` records actual evaluator-side downloads:
the full public ARC repository (1,000 training / 120 evaluation tasks), 500 SWE-bench Verified
instances (Parquet byte digest and decoded row count verified), all 89 Terminal-Bench 2.0 tasks,
and pinned SWE/Harbor/HLE evaluator sources. Downloads live outside this source repository;
they are not model input, training data, or capability evidence. HLE's anonymous immutable-file
request returned HTTP 401 `GatedRepo`; no mirror or access-gate bypass was attempted. FrontierMath's
public sample page is downloaded, not its protected benchmark or an official score.

`nyx-arc-benchmark-epoch.ts` freezes the first eight sorted public **evaluation** tasks before
opening their content, then runs raw model, existing minimal-reference equivalent tools, and
existing current NYX through the unchanged independent exact scorer. It does not restart the
earlier training pilot, use withheld feedback to repair, or relabel public tasks as SEALED.
Candidate source and task revision, calls/tokens/work/latency, source preservation, cleanup,
first-attempt vs public-guided repair and pairwise realized-compute parity are recorded.
Evaluation failures retire that task from future unbiased comparisons if they influence design.
General corrections must be reproduced on separate DEVELOPMENT tasks and tested on fresh inputs.

The adapter additionally retains only sanitized rejection codes/locations and diagnostic digests;
raw generated source, reasoning and credentials are not persisted. An explicitly selected existing
TEXT-vs-LINES source representation is available for subsequent **development** interface
diagnosis. It changes neither parser strictness nor admission, verification, or authority, and
is not automatically promoted or used by the frozen baseline epoch. Defaults remain LINES.

`nyxArcAdapter.ts` composes the existing NYX engineering cognition and R3 bounded repair loop,
R1 inspection, R2A lifecycle, R2G patch proposals, R3A disposable application, R3B fixed tools,
and unchanged static candidate admission. It does not introduce a second cognition controller,
sandbox, or verifier. `MODEL_EQUIVALENT_TOOLS` uses the existing minimal-reference prompt,
explicitly pinned to the same provider inference policy as `CURRENT_NYX`; omission preserves
the previous policies for all existing consumers. `RAW_MODEL` produces grids without tools.
`nyx-arc-core-refinement.ts` records the exact two opt-in changes (inference comparison control
and outer cancellation). Inverting those exact hunks must reproduce the entire frozen predecessor.
Historical evaluated commits and their digests remain immutable; historical scored protocols
still require their exact frozen sources and do not inherit this new epoch's results.
No new candidate mechanism is labeled as improved before it earns fresh evidence.

## One bounded public-witness correction cycle

The frozen `764d0b0` pilot is preserved in `docs/omega/evidence/nyx-arc-development-764d0b0.json`.
No solutions were accepted. Raw output-contract failures were not hidden-case reasoning failures;
the retained digests do not reveal their exact schema violations. Two current-NYX tasks produced
two candidates each but exhausted the combined local verification/admission gate. The old trace
did not retain per-iteration functional and quality outcomes, so their exact cause is unresolved.
Other attempts hit provider/clock limits. Historical
resource-termination labels remain unchanged; new traces separately record each candidate's
functional/quality outcome. No promotion or official score follows from this pilot.

Separate authored development reproductions showed that full expected-grid dumps can consume
the existing 1,000-character observation ceiling before actual values appear. The optional
`COMPACT_WITNESS` rendering preserves a public example index, both first mismatch coordinates,
expected/actual scalar values, bounded shapes and input-preservation status. It neither changes
the exact-match predicate nor reads withheld outputs. Candidate values cannot contribute arbitrary
strings to a witness. Default feedback stays `FULL_DUMP`; no production behavior is promoted.

`nyx-public-witness-cycle.ts` runs one frozen, finite current/candidate ablation on two new
development rule families and two new transfer rule families. Both arms compose identical
existing CURRENT cognition and R3 tools. Only public-failure rendering differs. Model, request
policy, ceilings, static admission and exact independent acceptance remain identical. No official
or reserved task is used. Same-session task authorship is disclosed, not falsely called independent.
Known and unknown work, actual token/call/tool consumption, first-call acceptance and internal
repair are kept separate. A 10% prospectively frozen realized-compute tolerance does not entitle
unequal or unstable pairs to a causal improvement claim. The experiment may refute the hypothesis.

The prior pilot also exposed late cleanup evidence after an outer deadline. The adapter now
reserves cleanup time *within* the unchanged outer lease. The new report checks trace completeness.
The one-shot workflow is restored to manual-only after the cycle; no unbounded failure reruns.

### Cycle result: no promotion

Frozen candidate `ccf998c`, live run `37122187108`: current NYX accepted 1/4 first try;
the witness candidate accepted 1/4 only after an existing quality-governor repair. Its first
candidate on that task already passed public functional checks, so that repair is **not**
evidence that failure witnesses improved reasoning. Reported tokens: 74,743 vs 88,324;
physical model attempts: 8 vs 10, with unknown work and provider instability. No overall
matched-compute gain was demonstrated. Both sides failed to emit syntactically valid source
on the other transfer task, with 2 calls each and 25,143 vs 25,157 reported tokens. That stable
matched failure never reached functional or hidden scoring, so it is an emission/interface
failure rather than a demonstrated hidden-case reasoning failure. The report and a derived
analysis are preserved in `docs/omega/evidence/nyx-public-witness-ccf998c.json`.

The frozen report's pair metric unnecessarily required scorer execution, excluding a known
zero-scoring-work syntax failure. Derived analysis corrects only that accounting distinction;
the raw report, tolerance, task population and every acceptance outcome remain unchanged.
The script applies that correction to future **manual** runs. The bounded cycle is stopped
for review. Compact witnesses remain experimental/opt-in; broad capability is not promoted.

Public examples can guide the internal bounded repair loop; test outputs stay only in the
independent scorer closure. Verifier stdout predictions are untrusted candidate artifacts,
NOT self-certified success. Ambiguous/malformed artifacts fail closed. The report separates
internal revisions from first-call/first-candidate acceptance. Execution is the established
process-local Node permission **seatbelt**, not a hostile-code or proven network sandbox.
Production use and official hostile repository evaluation still require suitable isolation.

`scripts/omega/nyx-arc-live-eval.ts` freezes the first three lexicographically sorted public
training paths from the pinned ARC repository before opening contents. Upstream Git blob
identity is checked after only checkout-EOL normalization and removing the one import-added
final LF. These tasks are DEVELOPMENT, may be pretraining-exposed, and are NOT fresh transfer,
private benchmark or official leaderboard evidence. Model API calls require explicit network
authorization and the injected GitHub secret. No credential enters the disposable process.
Known usage, HTTP retries, unreported failed-retry work, public verifier invocations and independent
scorer work are separately recorded. Equal ceilings are not equal realized compute. The absent
candidate arm and unequal realized costs prohibit broader promotion from this pilot.

### Actual public evaluation baseline — 2026-10-03

Candidate `9649ec6`, run `37125272663`, froze eight actual ARC-AGI-2 public evaluation
tasks before opening their content. RAW_MODEL, MODEL_EQUIVALENT_TOOLS and CURRENT_NYX
each produced **zero accepted solutions**. This is not a valid full-benchmark score or
a clean cognitive comparison: no paired task satisfied provider stability and realized
compute matching. Only two raw-model artifacts reached exact hidden scoring; NYX's
two executed candidates failed public examples, and its other observations included
syntax rejection, capacity pauses, HTTP 503 and exhausted wall-clock budgets.

Reported tokens were 17,052 / 7,781 / 81,743, with 3 / 15 / 7 unknown-usage calls
respectively. The unknown work is not zero. Recurrent line-32 diagnostics are an observed
interface symptom, not a proved transport/extraction/truncation cause. No model output
was accepted by self-declaration. Source preservation, cleanup and integration trace
completeness passed. Sanitized original evidence: `docs/omega/evidence/nyx-arc-public-9649ec6.json`.

The subsequent source-representation ablation was authored before these results were
read and uses four separate software domains, not ARC answers or task-specific fixes.
Two DEVELOPMENT and two VALIDATION tasks compare the already supported TEXT and LINES
contracts under unchanged cognition, model settings, static admission, private exact
acceptance and authority. Its test-only reference implementations establish that the
oracles and bounded execution path work; they are not model solutions and are never
model inputs. Same-session authorship is disclosed, not independent replication.
Both live workflows return to manual-only after this bounded execution.

### Physical request limits

ARC, text evaluation and the Harbor entrypoint use the existing NVIDIA provider's
`withHttpAttemptBudget` to create a host-owned per-task scope. Logical calls and internal
retries debit that same scope before HTTP dispatch. Nested scopes retain all ancestor
limits; cancellation, expiry and transport failure cannot refund or renew attempts.
Budget denial is resource exhaustion, not a model reasoning or provider failure.
Successful last-budget responses remain eligible for the unchanged independent oracle.
This is a delivery correction, not a cognitive promotion or a benchmark score.

### Entire public AIME population

`FULL_AIME` selects all 30 tasks from the unchanged pinned 490-task AIME/BBEH data
artifact, before consulting correctness. It uses current NYX's existing scoped-question
read/reply path and unchanged per-task calls, tokens, deadlines, parser and exact-answer
oracle. A 110-minute workflow accommodates the 30 existing 180-second task leases;
it does not extend a task lease or renew exhausted inference. The two-task provider-failure
circuit remains intact. Partial, ungraded and omitted families cannot claim a full score.
BBEH's 460-task population remains required separately. This current-system baseline
is not a matched-compute comparison, protected evaluation or cognitive promotion.

The text outage circuit considers observed provider failures on ungraded tasks even
when the final failure label is resource exhaustion or schema failure. It preserves
that primary classification and all costs. A recovered retry followed by a graded
answer, correct or incorrect, does not count as blocked delivery. This does not change
the frozen `dd9e7705` AIME campaign. Its full-population receipt preserves 7 attempts,
zero graded answers and 23 unexecuted tasks; the score is unknown, not zero percent.
The next counterbalanced transfer uses positional offset 8 (AIME 9/10, BBEH 008/009),
not those observed failures. It compares only the already implemented default and
observation-aligned schema with identical authority, oracle and per-task limits.
No cognitive promotion is justified by the circuit repair or a provider-unstable pair.

The offset-8 transfer at `4943841b` is frozen in
`docs/omega/evidence/nyx-text-transfer-4943841b.json`. The first infrastructure attempt
never acquired a runner; only that failed job was retried at the identical commit.
Four of eight planned attempts executed. The schema arm produced one independently
graded correct unseen AIME answer; the other three attempted solutions timed out.
No BBEH attempt executed. Neither math pair was stable or actual-compute matched,
so no comparative cognitive gain or full score is established. All four question
observations succeeded. The next general diagnostic concerns a per-attempt transport
timeout inside a still-unexpired task lease; this does not authorize lease renewal,
more calls, more tokens or a weaker oracle. The automatic push trigger is removed;
manual dispatch and exact-job retries remain available.

The next delivery hypothesis is opt-in last-attempt timeout alignment. Independent
synthetic fetch/body controls reproduce premature per-attempt rejection while a
finite task lease remains valid. Ordinary provider timeout remains capped at 120
seconds. The explicit experimental final-attempt ceiling is 180 seconds, requires
both a host-owned shared request allowance and a caller deadline, and is always
clipped to that original deadline. Setup cannot renew the pre-provision task lease.
No additional calls, tokens, retry allowance, model parameters, tools or authority
are granted. This is delivery support, not demonstrated cognitive improvement.
`TIMEOUT_TRANSFER_ABLATION` freezes positional offset 10 with identical existing
observation-aligned schema on both sides; only the transport timeout profile differs.
Unknown usage or unstable delivery prevents a matched-compute claim. Remove the
narrow push trigger after this one-shot is frozen; manual dispatch remains available.

The offset-10 timeout transfer is preserved in
`docs/omega/evidence/nyx-final-attempt-transfer-44a61202.json`. Two of eight planned
attempts executed, neither was graded, and six were not executed. The fixed arm
timed out. The experimental arm first emitted non-JSON output, then received HTTP
503 before its longer cutoff could establish any benefit. The hypothesis remains
inconclusive and unpromoted; neither a reasoning failure nor a cognitive gain is
established. Both physical allowances held and source state remained unchanged.

`FULL_BBEH` next selects all 460 pinned public BBEH Mini tasks, without correctness
selection. It uses the existing default NYX direct-text chat protocol (not the full
repository-engineering agent), one logical/physical request per task, 8,192 output
tokens, original 180-second leases, strict local reply parsing and the unchanged
upstream grader. The existing two-failure delivery circuit remains. The bounded
epoch is 19,000,000 ms with a 330-minute workflow; this reserves no unlimited task
authority and guarantees no completed score. Atomic partial checkpoints and the
all-selected/executed/graded rule preserve interruption and incompleteness honestly.
Some public tasks have been observed before, so this is a whole-population baseline,
not a fresh-transfer or sealed result. No cognitive promotion is claimed by adding
the execution mode. The narrow push trigger must be removed when it is frozen.

The whole-public-BBEH campaign at `4e757a5e` is terminal and preserved losslessly in
`docs/omega/evidence/nyx-bbeh-entire-public-4e757a5e.json`. It selected all 460 tasks,
attempted two, graded none and left 458 unexecuted. One request received HTTP 503;
the other timed out after the existing capacity wait. Both physical one-request
limits held, no repository tools ran and source state remained unchanged. Two
calls have unknown token usage; zero reported tokens is not zero compute. The
existing delivery-failure circuit stopped the campaign. This establishes neither
a BBEH score nor a reasoning failure or cognitive gain. The narrow automatic
trigger is now removed; manual dispatch remains. Do not replay the unchanged
campaign or add cognitive layers to compensate for unavailable model delivery.

### Bounded delivery recovery

`DELIVERY_PREFLIGHT` now runs the same NYX chat/provider/strict parser on the two
existing `TEXT_ACTION_SCHEMA_DIAGNOSTICS` development objectives without downloading,
opening, selecting or evaluating benchmark data. It uses the existing direct
observation-aligned schema and bounded recovery profile: one logical call, at most
three physical attempts per objective, 8,192 output tokens and the original
180-second task lease. The entire check is bounded to six minutes; it is not an
automatic campaign retry or a new cognitive layer.

Narrow readiness requires both expected objectives to receive independent grading,
with no delivery failures, retries or unknown compute. A graded wrong answer is
recorded as a reasoning failure, not relabeled as an outage. Failure exits nonzero.
Passing means only that bounded text evaluation can proceed at that time, not
sustained provider availability, a full benchmark score, other-family environment
admission, cognitive gain or new authority. Current SWE/Terminal quota, HLE access
and formal-math environment requirements remain separate. The one-shot push
trigger is removed after this authorized current-availability check completes.

The data-free run at `0613a66b` (37603998015) independently graded both development
answers correct: two HTTP 200 responses, 2,347 reported tokens, no retries, unknown
usage or provider failures. Its artifact byte digest and exact original report
were reconciled in `docs/omega/evidence/nyx-delivery-preflight-0613a66b.json`.
This permits one fresh frozen text comparison, not a claim of permanent recovery.
The next existing default-versus-observation-schema comparison freezes positional
offset 14 (two AIME and two BBEH objectives, eight paired attempts) before opening
questions or answers. Both arms retain the same model, scoped read, two logical
and physical requests, 8,192 output-token bound, original 180-second lease and
unchanged graders. Actual compute matching and stability must be established from
results, not assumed from equal ceilings. The temporary push trigger is removed
when this single comparison is frozen; earlier negative evidence stays intact.

That offset-14 comparison is terminal in run 37604506015 at `dcdd7384`: two of
eight attempts executed, none graded. Both first logical calls recovered from a
transient service failure. The default then emitted a malformed typed action;
the schema arm completed the required read. Both exhausted the two physical
attempts before a final answer. Four physical requests, 754 reported tokens and
two unknown-usage calls are preserved in `nyx-text-transfer-dcdd7384.json`.
This is not a mathematical failure or a passing score.

The general correction makes the existing bounded recovery policy prospectively
selectable for every arm with `NYX_TEXT_RECOVERY_PROFILE=BOUNDED_RECOVERY`. An
independent scoped development fixture reproduces the failed two-attempt
read/answer sequence and completes it with bounded recovery: two logical calls,
three physical requests including the failed retry, one authorized read and
verified cleanup. The absolute lease, parser, graders and tools are unchanged.
The selector cannot overwrite a heterogeneous recovery ablation, silently renew
a budget or grant an additional reasoning turn. Historical defaults remain fixed.

Fresh transfer now freezes offset 16 with the same four-objective/eight-attempt
comparison, and the same recovery allowance for both arms (at most four physical
requests, two logical calls and the original 180-second lease). Unknown retry
compute still prevents a matched-realized-compute claim. No task answer, identity
or observed mathematical pattern is encoded in the correction.

The corrected offset-16 run at `c5d8b908` (37605637564) is also terminal:
three of eight attempts executed, zero graded, five unexecuted. The shared physical
allowance was not exhausted. The default received two successful responses but
emitted non-JSON before reading, leaving no answer within its unchanged logical
limit. The constrained arm encountered repeated HTTP 503 responses on one task;
on the next it completed the required read, then the answer request timed out at
the original expiry. Six physical requests, 1,229 reported tokens and three calls
of unknown usage remain in `nyx-scoped-recovery-c5d8b908.json`, independently
reconciled with its downloaded artifact. These are protocol and provider failures,
not established wrong mathematical answers, a matched comparison or a full score.

The general scoped-budget defect is corrected and development-verified; sustained
delivery and the default serialization gap remain unresolved. The existing scoped
schema correction is not broadly promoted from this unstable comparison. Automatic
benchmark replay is disabled. Further meaningful live evaluation needs reliable
authorized model-serving capacity; do not change providers, credentials, deadlines,
authority, graders or protected-access restrictions silently. Official engineering
and formal-math environments, HLE access/judge/multimodal integration and protected
FrontierMath access remain outstanding, not completed by a passing preflight.

The historical direct-text physical allowance is one request, which deliberately
prevents even the provider's existing sixty-second retry from dispatching again.
The opt-in `BOUNDED_RECOVERY` evaluation profile adds two physical attempts to the
existing shared task budget, not two reasoning turns. Default callers and historical
campaigns keep their original limits. Retries use the same frozen payload, configured
endpoint, server cooldown, 120-second per-attempt ceiling and original 180-second
task expiry; cancellation, transient retry limits and the outage circuit remain.
No failed or unknown-usage call is free, and no task lease is renewed.

Independent synthetic fault schedules compose the actual NYX session, provider,
capacity gate and unchanged grader. They reproduce the one-request failure and
successful recovery after 503 or two 429 responses; persistent unavailability,
credential rejection, expired leases, malformed actions and wrong answers still
fail. An explicit token-limit stop with missing final content is classified as
truncation, not as evidence of incorrect reasoning or a service outage.

`RECOVERY_TRANSFER_ABLATION` counterbalances both delivery profiles on the same
fresh positional window, with identical observation-aligned JSON schema, model,
tokens, logical calls, authority and oracle. The changed physical retry ceiling is
explicit: realized compute is recorded, not assumed matched. This is a delivery
experiment, never automatic cognitive promotion. The offset-12 workflow is frozen
before questions or reference answers are observed, and its narrow automatic push
trigger must be removed after the one-shot finishes. Preserve original negative
receipts; do not reinterpret an incomplete rerun as a full benchmark score.

The frozen offset-12 run at `21161cc` is terminal. Its artifact was independently
hash-checked and reconciled with the lossless original report in
`docs/omega/evidence/nyx-delivery-recovery-21161cc.json`. Eight attempts were selected;
two executed, neither was graded, and six were unexecuted. The fixed arm timed out.
The recovery arm actually waited and dispatched twice, receiving 503 both times;
119,995 ms of capacity waiting includes the inherited preceding-request cooldown.
All three physical calls have unknown token usage. Recovery dispatch is verified,
but improved live delivery, matched compute, reasoning improvement and a benchmark
score are not established. The outage circuit remains intact and automatic replay
is removed. Another unchanged retry is not a correction for sustained unavailability.

### Native request isolation after bounded-recovery evaluation

The `c3919bca` contract run is preserved losslessly in
`docs/omega/evidence/nyx-session-native-phase-c3919bca.json`, reconciled with both
the terminal report and independently hash-checked artifact. Recovery reached a
real authorized read after two 503s, but the subsequent answer encountered another
503. The native-control arm read successfully, then received HTTP 400. Its fixed
`model`/`VALIDATION` clues do **not** identify a rejected parameter. Neither arm
was graded; readiness, configuration promotion and cognitive promotion remain false.

The existing live smoke runner's opt-in `HOSTED_NATIVE_ISOLATION` profile compares
native medium plus 2,048 thinking tokens, native medium without that reservation,
and template medium on identical synthetic input/schema and an 8,192-token ceiling.
It permits at most three physical requests, one per arm, under finite original
deadlines, stops on an outage, retains failures, and exits nonzero if any arm is
missing or unsuccessful. No parser, acceptance oracle, production default or
authority changes. This isolates configuration acceptance, not reasoning quality.

That focused run at `928e1691` (37631839599) stopped on its first physical request:
HTTP 503, zero returned answers, unknown token usage, two configurations unexecuted.
The artifact and terminal report agree byte-for-byte after archive hash validation;
the receipt is `docs/omega/evidence/nyx-native-compatibility-928e1691.json`.
It neither resolves the earlier HTTP 400 cause nor establishes a reasoning failure.
Automatic replay is disabled. Further live configuration isolation and benchmark
evaluation require stable authorized NVIDIA serving; no new key requirement, quota
cause, successful recovery or cognitive advantage is inferred from these responses.

### Authorized full public text campaign — 2026-10-07

Malek authorized actual benchmark execution from `0aa274e1`. The existing one-shot
workflow now freezes `FULL_AIME` (all 30 pinned problems), then `FULL_BBEH` (all
460 pinned Mini problems) if the first family completes. Both use the existing
`SESSION_ACTION_CONTRACT` candidate, scoped whole-question read, fixed Ultra model,
8,192 output-token ceiling, two logical calls, four shared physical attempts,
original 180-second task lease, opt-in bounded transient recovery and unchanged
graders. Unsupported native controls are not used. No production default changes.

Full-population execution now exits nonzero if required tasks are unexecuted or
ungraded; a complete low score remains valid evidence, not a harness failure. This
reuses the existing completeness predicate. The two-consecutive-delivery-failure
circuit remains intact. The second family does not repeatedly probe an outage
that prevented the first from completing. Existing epoch limits remain 91 minutes
for AIME and 19,000,000 ms for BBEH; CI timeouts only cover setup and those existing
limits, never renew an individual task's authority or expiry.

This is a frozen-version public rerun, not fresh held-out transfer or an official
leaderboard harness. Prior public exposure and unknown training contamination
remain explicit. Reference answers stay in evaluator custody outside the source
repository; only sanitized evidence is uploaded. First attempts are retained;
any later general correction needs separate development reproduction and fresh
transfer, not answer-guided retries of this population. Automatic push dispatch is
removed after the authorized one-shot is captured.

Ω coverage remains PARTIAL / JUST-IN-TIME: directly applies real execution,
complete-population accounting and no self-certification; supports scope, provenance,
leases and private-oracle separation; defers protected/container-dependent families
and cognitive promotion. No additional reasoning layer or authority is introduced.

The full campaign at `ce926d2f` (37636458975) is terminal and incomplete. AIME
selected 30 tasks, executed three, independently graded one correct, and left two
provider-blocked/ungraded plus 27 unexecuted. All three performed the required
authorized whole-question read. The first answer recovered after a 503 and bounded
cooldown. The next two answer requests encountered timeout/unavailability; the
two-consecutive-failure circuit stopped execution. BBEH Mini's dependent job was
skipped, not scored. One correct answer is not a full-population accuracy result.

The independently archive-hash-checked, log-reconciled original report is preserved
in `docs/omega/evidence/nyx-full-aime-ce926d2f.json`. Six logical / nine physical
calls reported 1,994 tokens with five unknown-usage calls, four observed 503s and
one timeout. Original task leases, shared attempt limits, strict grading and
authority boundaries stayed intact. No wrong answer or syntax/schema failure was
observed in this tiny sample; absence of a returned answer is not a reasoning
failure. Stable delivery, configuration superiority and cognitive improvement
remain unestablished. No 429 or new-key requirement was demonstrated. Automatic
push replay is removed; completing this campaign requires stable authorized
same-model serving, not weaker acceptance or repeated unchanged outage probes.

### Pre-lease inherited-capacity scheduling correction — 2026-10-07

The `ce926d2f` report exposes a host scheduling cost: the third task spent 59,997 ms
of its already-issued 180-second lease in the preceding task's known cooldown.
The full-family workflow now explicitly opts into `BEFORE_TASK_LEASE` scheduling.
It waits in the existing shared capacity gate before issuing that next task's
repository/capability lease. Readiness reserves no dispatch, creates no sandbox,
reads no credential and grants no authority. The provider independently reacquires
capacity before each actual request, so stale readiness cannot bypass a new cooldown.

A separate virtual-clock DEVELOPMENT workload reproduces the old deadline loss
with two ordinary successful logical requests taking 30 and 100 seconds behind
an inherited 60-second cooldown. Pre-lease scheduling allows the same workload
to finish using the same two requests and original 180-second task lifetime.
Cancellation, expiry, changed cooldown, malformed deadlines and timer cleanup are
tested. This is a general scheduling correction, not a benchmark-answer fix or
proof that NVIDIA serving is reliable. Production defaults are unchanged.

The new public campaign retains the model, selected populations, output ceiling,
logical/physical limits, per-request timeouts, strict parser, independent graders,
original task lifetime and two-consecutive-failure circuit. Queue waiting is
recorded separately and remains charged to the unchanged epoch wall-clock budget.
No already-issued authority is renewed. This explicitly changed scheduling policy
precludes claiming an unchanged or realized-compute-matched rerun. Earlier results
remain preserved; these public tasks are not fresh held-out transfer. The narrow
push trigger exists only to execute this authorized correction and must be removed
after its evidence is captured. No cognitive promotion is inferred from unit tests.

Ω Plan Coverage: PARTIAL / JUST-IN-TIME. Directly implements honest resource
scheduling and lease preservation; supports scope, provenance, independent grading
and fail-closed execution; defers cognitive layers, protected benchmark access and
container-dependent families. It supersedes charging a previous task's known
provider cooldown against a newly issued task lease, not any security requirement.

The actual rerun at `5960d525` (37641184650) is terminal. The second task's inherited
59,998 ms cooldown was observed before lease creation; task authority was not
renewed. Both tasks' initial read-intent requests then received three 503s each.
Zero question reads or answers completed. AIME selected 30, attempted two, graded
none and left 28 unexecuted; BBEH Mini's dependent job was skipped. All six physical
calls have unknown token usage; zero reported tokens is not zero model compute.
The epoch records 302,417 ms, separately preserving pre-lease waiting and task time.

The archive-hash-checked original report matches the terminal log and is preserved
in `docs/omega/evidence/nyx-prelease-queue-5960d525.json`. Both read request digests
exactly match previously accepted HTTP-200 read requests from `ce926d2f`; a newly
changed model payload does not explain these failures. No reasoning failure or
provider-stable improvement is established. NVIDIA's [hosted-endpoint guidance](https://docs.nvidia.com/aiq-blueprint/2.2.1/resources/troubleshooting.html#nemotron-hosted-endpoint-availability)
documents high-demand 503s for this exact Ultra model and recommends bounded retry,
lower concurrency or self-hosting for consistent throughput. That is consistent
with the observations, not incident-specific proof of an internal provider cause.
Automatic Ultra replay is removed. This terminal result does not itself authorize
any endpoint, model, credential, grader, lease or authority substitution.

### Explicitly authorized alternate-model campaign — 2026-10-07

After six consecutive Ultra 503s, the operator explicitly authorized testing
another model through the existing NVIDIA endpoint as a separately labeled
campaign. The next one-shot selects `nvidia/nemotron-3-super-120b-a12b` explicitly;
there is no automatic fallback, production model change or new routing system.
NVIDIA's [model-selection documentation](https://docs.nvidia.com/nemoclaw/user-guide/hermes/inference/learn-and-choose/choose-model)
identifies Super as a tool-planning option; live execution, not that catalog, must
establish availability and suitability for this NYX protocol.

The pinned AIME-2025 30-task and BBEH-Mini 460-task populations, NYX session,
scoped question-file read, strict structured action parser, withheld-reference
graders, output ceiling, logical/physical request limits, original task lease,
pre-lease capacity scheduling, epoch limits and delivery-failure circuit remain
unchanged. Only the evaluation model changes. Reports and artifacts explicitly
identify Super, keep Ultra's evidence intact, and preserve unknown token usage.
Equal ceilings do not imply matched realized compute or an architectural gain.
Public reruns are not fresh held-out tests. No promotion follows merely from a
different model answering successfully. The temporary narrow push trigger is
removed after this separately authorized campaign's terminal evidence is captured.

Ω Plan Coverage remains PARTIAL / JUST-IN-TIME: applies measured model/integration
diagnosis, independent grading, resource limits and provenance; preserves execution
boundaries; defers model routing, cognitive expansion and broad superiority claims.

The first Super campaign `06b836ff` (37642599890) returned 20 HTTP-200 responses,
read ten complete questions and independently graded seven answers: six correct,
one invalid final-answer format. Three other answers ended at the existing token
ceiling without final content and remain ungraded truncations. Twenty AIME tasks
were unexecuted; BBEH was dependency-skipped. This is not a full AIME score and
does not establish cognitive superiority or sustained provider stability.
Reported usage was 56,477 tokens, 20 logical/physical calls, zero unknown-usage
calls and zero transport retries. All original evidence is archive-hash checked,
log-reconciled and preserved in `docs/omega/evidence/nyx-super-first-06b836ff.json`.

This run exposed a general harness defect: the outage circuit counted delivered
HTTP-200 token-limit failures because the adapter's generic `providerFailures`
counter also includes missing-content schema errors. The original stop label is
preserved, not rewritten as an outage claim. A narrowly scoped correction excludes
only an observed terminal HTTP-200 `length` response from outage tracking, while
retaining the ungraded truncation, raw failure accounting, original strict parser,
grader, token/call/lease/epoch limits and two-consecutive-actual-outage circuit.
Missing terminal evidence is not assumed to prove delivery. A later timeout still
counts as blocked transport even if an earlier response truncated.

Independent synthetic development cases exercise returned truncations, recovered
503 then truncation, truncation followed by timeout, missing evidence and genuine
consecutive outages. The corrected Super public rerun changes only this host-side
classification, not prompts, model settings, acceptance or task selection. Earlier
attempts remain distinct; replay is not fresh transfer or realized-compute matching.
No benchmark answer is used to repair the system. No reasoning improvement is
inferred from this supporting evaluation correction.

The same correction separates independent-family execution from score completeness.
BBEH may execute after all 30 AIME tasks were attempted, with source integrity and
`SELECTION_EXHAUSTED`, even if token limits left AIME answers ungraded. The AIME
job still fails its unchanged full-score completeness check; no missing answer
becomes a pass or a zero-cost result. Partial execution, capability blocks, changed
source, malformed/missing reports, a real outage halt or expired epoch do not
admit BBEH. This removes an artificial cross-family dependency, not a scoring gate.

The corrected Super AIME execution `1c0bc4f8` (37665577413) exhausted all 30 selected
tasks: 16 correct, two wrong integers, one final-format failure, ten ungraded
token-limit truncations and one ungraded timeout. All 30 authorized question reads
completed. There were 60 logical/physical requests, 165,079 reported tokens, one
unknown-usage request, zero retries, zero observed 503s and 1,256,018 ms of epoch
time. The generic adapter failure count of 11 is not eleven provider outages.
The AIME job correctly remains failed for incomplete grading, not a complete score.

Its archive-hash-checked original report agrees with the terminal log and is
preserved in `docs/omega/evidence/nyx-super-corrected-aime-1c0bc4f8.json`.
Policy, population and selection digests are unchanged from the initial Super
campaign. All ten shared initial read-request digests match. Correct solutions in
that common subset changed from six to five, with different realized tokens.
Only execution coverage improved; no cognitive gain, matched-compute advantage or
architectural promotion is established. The dominant observed limit is missing
final content at the frozen token ceiling, separate from wrong-answer reasoning.

The independent BBEH Mini job has begun at the same frozen `1c0bc4f8` candidate;
its result remains pending, not inferred from AIME. Automatic push replay is now
removed without interrupting that already-started job. Production defaults,
authority, credential custody and all original acceptance checks remain unchanged.

## Super final-answer budget correction (2026-10-07)

The completed AIME report exposed ten HTTP-200, length-terminated responses with
reasoning but no final content. Super's historical requests specified 8,192 total
output tokens but no thinking budget. NVIDIA's hosted Super reference documents a
default reasoning budget of 16,384. This is a configuration failure hypothesis,
not evidence that the two delivered wrong integers were transport failures.

`SUPER_HOSTED_NATIVE` is an explicit exact-model provider opt-in. The existing
text harness's `SESSION_SUPER_PHASE_CONTRACT` uses `reasoning_effort=none` for the
required authorized read and `high` with `reasoning_budget=6144` for the answer,
within the unchanged 8,192-token ceiling. It preserves schema, strict parsing,
finish-reason rejection, lease, authority, oracle and usage accounting. It never
extracts a final answer from private reasoning. Ultra and omitted Super controls
remain unchanged. Historical scored candidates retain their original identities;
only exact declared source hunks can be inverted by the existing assurance check.

The bounded live diagnostic compares this opt-in against unmodified Super on the
two pre-existing development objectives in counterbalanced order. These are not
held-out benchmark results. Equal ceilings are not necessarily equal realized
compute. The completion watch is paused; BBEH cancellation is operator-requested.
The completed one-shot workflow force-cancelled only run `37665577413`, using a
separate trusted job's short-lived GitHub token, never model authority. That job
and its `actions:write` permission are now removed. The diagnostic is manual-only
and receives only the existing NVIDIA secret; it grants no deployment authority.

Official benchmark prerequisites remain distinct: the Windows host has no Docker,
the previously measured Linux runner lacks enforceable writable-layer quotas
(`nyx-storage-prerequisite-e0c7ecd.json`), and protected FrontierMath access is
unresolved. The public Erdős acquisition is a different, unexecuted variant.
Astra's published comparison uses Terminal-Bench 4.0 and FrontierMath Tier 4 v2,
not our downloaded Terminal-Bench 2.0 set. These cannot be relabeled comparable.

Ω plan coverage: directly implements bounded inference and strict evidence-backed
configuration; supports no self-certification, unchanged authority and unknown
usage accounting; defers cognitive promotion, quota environment provisioning,
protected evaluation, recursion and connectome expansion. Coverage remains
PARTIAL / JUST-IN-TIME. No task-specific answer repair is introduced.

### Fresh observations and requested benchmark transition

Candidate `dc59c2a5e92ebfb287d90a62dc3c6946c43b113c`, run `37674937014`, completed
the two-objective counterbalanced development ablation. Unmodified Super and
the phase-controlled configuration each passed 2/2. Control used 2,501 reported
tokens and 9,007ms summed task latency; the candidate used 2,063 and 9,369ms.
There were eight logical/physical/HTTP calls total, no retries, provider failures
or truncations, and no unknown-usage calls. One pair did not satisfy realized
token matching. This is live E4 interface evidence plus deterministic E3 grading,
not an accuracy gain, a latency gain, or proof that hard-task truncation is solved.
See [verified artifact receipt](../../../docs/omega/evidence/nyx-super-phase-controls-dc59c2a5.json).
Linux CI `37674937107` passed 108 suites / 11,121 checks, TypeScript 5.8.3 zero,
secret scan, package smoke and production build. Windows Device Guard was not
bypassed when it blocked the local build launcher.

BBEH is confirmed **cancelled**, not suspended/resumable. Its terminal log has
60 task records from 460 selected: 11 correct, 13 wrong-or-answer-format,
34 ungraded truncations and two ungraded provider failures. Four hundred selected
tasks have no terminal record; exact unexecuted/in-flight counts and their usage
are unknown. No final report/artifact survived cancellation, so this is not a
complete benchmark score or final cleanup proof. The watch remains paused.
See [partial cancellation receipt](../../../docs/omega/evidence/nyx-super-bbeh-cancelled-1c0bc4f8.json).
Original AIME, Ultra and earlier Super evidence is unchanged.

The official Terminal-Bench **v4.0.0 release source** is now downloaded outside
the candidate repository at pinned revision
`452bf305c6daa62fc59061d22133a7cbc7c1572e`. Only manifest/environment metadata was
inspected, not questions or solutions. Its 66 task manifests specify eight-hour
agent timeouts, 4–32GiB RAM and up to 1,024,000MiB storage; 11 have multi-container
compose definitions and three explicitly request GPUs (eight omit that field).
This is source acquisition, not Hub/prebuilt-image equivalence or execution.
See [acquisition and environment receipt](../../../docs/omega/evidence/terminal-bench-4-source-acquisition-2026-10-07.json).
Actual scoring requires an approved isolated Linux runner with enforceable storage
quotas and explicit task-scoped resource/container admission. No quota, lease,
grader, model default or authority boundary has been relaxed to obtain a score.

Protected FrontierMath Tier 4 v2 tasks/verifiers are unavailable; authorized Epoch
AI access is required. Public samples and the public Erdős acquisition are not
equivalent. No Terminal-Bench 4.0 or protected FrontierMath score is claimed.

### Public frontier benchmark acquisition and GPQA execution

The [2026-10-07 acquisition receipt](../../../docs/omega/evidence/nyx-public-benchmark-acquisition-2026-10-07.json)
pins additional author sources and distinguishes full populations from
harness-only, gated, alternate-split and missing-asset acquisitions. Downloads
remain outside the candidate repository. No vendor-private benchmark is claimed
downloaded, and no score follows from source acquisition.

`FULL_GPQA` composes the existing bounded NYX text session, provider, disposable
question repository, strict protocol, cleanup and usage accounting. All 198
GPQA Diamond rows are frozen in author CSV order. The author baseline's choice
shuffle uses Python seed 0; repeated official distractors are preserved. Archive,
CSV and complete prepared-data SHA256 pins prevent silent task/reference changes.
Only the question and four unlabeled choices reach cognition, not explanations,
validator metadata or the correct-choice label. Final A–D grading is exact;
wrong choices, format errors, truncations, provider failures, schema errors,
authorization failures and unexecuted tasks remain distinct. This is our custom
closed-book adapter, not the authors' inference harness or a sealed held-out set.

The GPQA campaign explicitly selects the authorized Super evaluation model and
phase controls; Ultra production defaults remain unchanged. It has the same
8,192-token ceiling, two logical calls, at most four HTTP attempts and 180-second
task lease as the scoped full-AIME configuration. No repair feedback or extra
reasoning turns are granted. The finite campaign deadline is 19,000,000ms;
two consecutive delivery failures stop execution with partial evidence, not a
manufactured score. Capacity waiting happens before task leases. Both workflows
share the existing campaign concurrency group and cannot compete for process-local
provider accounting. BBEH remains manual opt-in and cancellation-aware; neither
push campaign restarts it.

Local verification: 108 suites / 11,141 checks passed, five synthetic Python
projection tests passed, and TypeScript 5.8.3 remains zero. These verify the adapter
and preserved boundaries, not NYX reasoning performance. GPQA must actually
finish and be independently graded before a result is claimed.

### Full AIME phase-control campaign completed

Run `37678057740`, candidate `7d69a2ce877a03c6c01a941958f7ba2cd8f3c189`,
completed all 30 selected first attempts: **16 correct / 30 graded (53.33%)**,
14 well-formed wrong integers, zero truncations, zero provider-failure tasks,
zero schema/answer-format failures and no unexecuted tasks. It used 60 logical/
physical calls, 149,324 reported tokens, zero unknown-usage calls, no retries and
1,032,420ms campaign time. Source integrity and disposable cleanup passed.
The artifact SHA256 and all 30 terminal rows were reconciled with the final
report and progress checkpoint; see the [full sanitized receipt](../../../docs/omega/evidence/nyx-super-full-aime-phase-7d69a2ce.json).

This is a usable complete measurement, **not a measured accuracy improvement**:
the previous campaign also had 16 correct, but 11 ungraded deliveries. Thirteen
old passes repeated, three became wrong, and three old non-passes became correct.
The task population is unchanged; this public rerun is not fresh blind transfer
or a randomized matched-realized-compute comparison. Remaining wrong answers
are not reclassified as transport faults. BBEH was skipped, as requested.

Full GPQA run `37680476853` is a separate frozen 198-task campaign at candidate
`da4bb54650aa30971c51c471a263b52aed578ab4`; its terminal evidence follows below.
Both one-shot push triggers are retired after their single dispatch, preserving
manual execution without replay on later evidence commits.

### GPQA Diamond terminal evidence — incomplete grading

Run `37680476853` exhausted all **198 selected / attempted first attempts**:
**148 correct, 46 well-formed wrong choices, 194 graded, four ungraded provider
timeouts, zero unexecuted**. There were zero answer-format, truncation, schema or
authorization failures. The four timeouts occurred in answer generation after a
successful authorized question read; their usage is unknown, not zero. No HTTP
429 or 503 responses were recorded. The strict workflow correctly exited nonzero
because grading was incomplete, not because source integrity or cleanup failed.

The graded-subset accuracy is **148/194 (76.29%)**, descriptive only: it is not a
complete GPQA score, an accuracy-improvement claim or a controlled vendor-model
comparison. The 46 wrong choices are observed reasoning/knowledge failures, not
serialization failures; this evidence capture does not establish their causes.
Calibration is unsupported by the reply protocol. Public-data contamination is
unknown; the adapter is custom closed-book NYX, not the author's inference harness.

The campaign used 396 logical/physical/HTTP calls, **682,753 reported tokens plus
four calls of unknown usage**, 198 question-file reads, zero retries and zero
repairs. Campaign time was 5,059,474ms (about 84.3 minutes), including 240,704ms
of pre-task capacity waiting. Default Ultra configuration and all authority/lease
boundaries are unchanged; this is the separately labelled Super evaluation.

The downloaded artifact SHA256 matches GitHub metadata and the terminal upload
log. Its original report matches all 198 terminal rows and the progress checkpoint;
the canonical original-report digest also matches. Source integrity passed;
each recorded row follows the runner's fail-closed disposable cleanup check.
The [sanitized evidence receipt](../../../docs/omega/evidence/nyx-super-full-gpqa-da4bb546.json)
retains request attribution, per-task outcomes and resource use but omits
low-entropy reference/prediction/response hashes. It is explicitly a projection,
not a byte-identical original; the verified archive and canonical digest bind
the unmodified original. No raw questions, answers, reasoning or secrets are added.

The AIME 16/30 complete result, historical AIME failures, original Ultra and earlier
Super evidence are preserved. BBEH remains cancelled and its watch paused. This
completion watch captures evidence only and pauses after publication; it does not
launch benchmarks, repair reserved questions or promote cognition.

### General diagnosis and frozen transfer after GPQA

The 46 wrong valid choices remain reasoning/knowledge outcomes of unknown finer
cause; no GPQA answers or task-specific patches are used in this correction.
The four delivery timeouts expose a separate mechanism: a 120-second attempt
cutoff plus the required 60-second cooldown cannot fit inside a task's original
180-second lease. The prior opt-in longer timeout selected only the last shared
physical attempt, not the last usable opportunity within that lease.

`LAST_ATTEMPT_OR_NO_RETRY_WINDOW` is an opt-in host policy: let the current attempt
use the remaining original lease when a retry cannot fit. It grants neither
extra calls nor a new lease. Default inference, timeouts, cooldowns, source scope,
secret boundary and authority are unchanged. Fetch/body controlled reproductions
cover the difference, cancellation and expiry. This is delivery work, not a
cognitive-gain claim; a live server can still fail or exceed the finite lease.

The bounded live ablation compares the existing Super read-then-reply control
with an opt-in in-call `CONSTRAINT_COUNTERCHECK` procedure. Both use the same
model, high/6144 answer reasoning, 8192-token call ceiling, two logical calls,
four shared physical dispatches, single scoped question read, 180-second task
lease and strict exact-answer oracle. One-shot execution freezes four development
and eight transfer instances across Bayesian conditioning, causal adjustment,
rotation symmetry and program-state reasoning before any model results. It
counterbalances arm order and passes no development feedback into transfer.
These are implementer-authored procedural tasks, NOT independent replication or
an official benchmark. Python Decimal/Burnside/actual list semantics cross-check
all twelve host-side oracles without loading official benchmark reference data.

Record paired first-attempt outcomes, reported/unknown tokens, calls, tools,
latency and failures. Realized compute must match within 10% per pair for a
compute-controlled claim; matching ceilings alone is insufficient. No automatic
promotion, task-specific retries, answer-specific tuning or default-model change.

Benchmark sessions already start fresh per question, use no persistent-memory
store, and clean their disposable question repositories. They now explicitly
dispose local history/observation references in `finally` and reject session
reuse. This is not forensic zeroization, provider-retention deletion or model
weight unlearning. Preserve prior exposure and original GPQA/AIME evidence;
never relabel an exposed question as blind after clearing local context.

Ω Plan Coverage: directly implements evidence-over-confidence, bounded general
repair and explicit context lifetime; supports generator/detector separation and
honest compute accounting. Broader cognitive claims, official-benchmark reruns,
brain expansion, recursion and production authority are deferred. No conflicting
authority policy is superseded. Coverage remains PARTIAL / JUST-IN-TIME.

#### Terminal result — frozen candidate `6ad3c455`

[Run 37742048422](https://github.com/malekismail487-web/generous-ai-core/actions/runs/37742048422)
completed. Control and countercheck each scored **4/4 development and 8/8 fresh
transfer**: all 24 task-arm first attempts graded correctly, zero ungraded or
unexecuted. This is a saturated small procedural test, not an official benchmark
score and **not a measured reasoning improvement**. The countercheck procedure
remains opt-in/unpromoted; it does not establish that the 46 GPQA wrong choices
are fixed. Default Ultra configuration remains unchanged.

Development used 11,470 control / 13,799 candidate reported tokens. Transfer used
23,424 control / 22,840 candidate reported tokens, **plus one control dispatch of
unknown usage** after transient provider unavailability. Existing bounded recovery
completed that task: 48 logical calls, 49 physical calls total, one provider
failure/retry, no timeouts, truncations, schema/format/authorization/infrastructure
failures and no answer repair. Do not call this zero-provider-error delivery.
Only 2/4 development and 3/8 transfer pairs meet the 10% realized-compute rule;
7/8 transfer pairs were provider-stable. No controlled broad promotion follows.

The general timeout policy passed controlled fetch/body reproduction and preserved
caller expiry, cancellation and dispatch bounds. No live response exceeded the
old 120-second cutoff, so this run cannot establish elimination of the historical
live timeout class. The two live stages took 592,854ms combined. All disposable
cleanup and source-integrity checks passed. Linux production build passed in
15.21s; local Windows Vite was blocked by Device Guard, whose policy was unchanged.
Both local and Linux aggregate checks passed all 108 suites / 11,158 checks;
TypeScript 5.8.3 remained zero and the secret scan found zero issues.

The [sanitized receipt](../../../docs/omega/evidence/nyx-general-repair-6ad3c455.json)
binds the verified archive SHA256, both canonical original reports, all 24 terminal
rows and final progress checkpoints. It omits raw questions, answers, reasoning
and low-entropy answer-derived hashes. Original GPQA/AIME/Ultra evidence remains
preserved. No new official benchmark was launched and the temporary push trigger
was removed after dispatch. Next capability evaluation needs a more discriminating
fresh task population, not tuning against the now-exposed transfer questions.

### Frozen harder general-reasoning evaluation

`GENERAL_REPAIR_CHALLENGE` freezes twelve new objectives, three per domain:
latent-dependent Bayesian observations and selection; causal interventions with
mediators and outcome-dependent reporting; constrained ternary cyclic words under
non-free rotations; and Python closures/aliasing with suspended generators.
The original saturated development/transfer tasks are not rerun or relabelled
fresh. No cognitive code, model configuration, authority, answer grading, lease,
call limit, token ceiling or counterchecking text changes for this comparison.

Each challenge receives paired, counterbalanced first attempts from the existing
Super phase-contract control and optional counterchecking variant. The existing
runner records realized compute, provider stability and its 10% per-pair matching
rule; incomplete/unknown usage is not silently matched. The fixed twelve-task
selection is run once, not expanded in response to scores. No task-specific
repairs, transfer feedback, grader weakening or automatic promotion.

All host-side answers are cross-checked before inference in separate Python:
Fraction-based joint enumeration, truncated causal factorization, Burnside
fixed-period counting with memoized DP, and actual allowlisted Python generator
execution. These remain implementer-authored E3 oracles with partially correlated
assumptions, not independent replication or an official frontier benchmark.
Live model observations are E4; raw private model reasoning is not retained.

Ω coverage: evidence-driven difficulty escalation, generalization without answer
memorization, validated detectors, honest compute accounting and no self-certification.
Broad cognitive promotion, additional brain layers and production authority remain
deferred. No operational authority conflict or supersession. PARTIAL / JUST-IN-TIME.

#### Terminal harder comparison — frozen candidate `a88115fd`

[Run 37745114456](https://github.com/malekismail487-web/generous-ai-core/actions/runs/37745114456)
completed all twelve paired objectives: **control 9/12; countercheck 8/12**.
All 24 task-arm first attempts were graded: 17 correct, seven wrong valid choices,
zero ungraded or unexecuted. No provider, timeout, truncation, answer-format,
schema, authorization or infrastructure failures occurred. These are real
wrong-answer outcomes under this closed-book envelope, not unreached tests.

Domain scores (control / countercheck): Bayesian conditioning 3/3 / 3/3;
causal intervention 3/3 / 2/3; cyclic symmetry 1/3 / 2/3; program state 2/3 / 1/3.
Two objectives favored control, one favored countercheck, seven were both correct
and two both wrong. All twelve pairs were provider-stable, but only nine met the
10% realized-compute rule; that diagnostic subset tied **6/9 each**. Countercheck
is **NOT_PROMOTED**. Neither the net score nor the matched subset establishes a
cognitive gain; these are not official benchmark scores or a coding-quality test.

Control used 78,729 reported tokens and countercheck 80,983: 48 logical/physical
calls total, zero unknown-usage calls, transport retries or semantic repairs.
Epoch duration was 1,367,875ms; cumulative task latency was 695,884ms control /
671,917ms countercheck. All source-integrity and disposable-cleanup checks passed.
Both local and Linux aggregate checks passed 108 suites / 11,160 checks; TypeScript
5.8.3 remained zero, the candidate secret scan found zero issues, and Linux build
passed in 13.91s. Windows Device Guard policy was not changed.

The [sanitized receipt](../../../docs/omega/evidence/nyx-general-challenge-a88115fd.json)
reconciles the verified artifact SHA256, canonical original report, progress and
all 24 terminal rows without storing questions, answers or private reasoning.
Single draws, small population, implementer-authored oracles and order/domain
confounding limit interpretation: global alternation made BAYES/SYMMETRY
control-first and CAUSAL/PROGRAM_STATE countercheck-first. Future replication
should counterbalance within each domain; do not retroactively alter this run.

The useful new evidence is the location of failures, not a promoted reasoning
layer. Exact counting and suspended-generator state tracking merit a separate
general development experiment with independently authorized computation tools,
then fresh transfer and simpler controls. That hypothesis is not yet verified.
Do not tune against these exposed challenge answers or infer the 46 earlier GPQA
wrong choices are fixed. Default Ultra, authority and prior evidence are unchanged;
no additional official benchmark or live rerun was launched after completion.

### Shared-derivation computation transfer

`nyx-computation-transfer.ts` reuses `NyxChatSession`, the native equation schema,
`BoundedReasoningSession`, strict choice parsing, provider leases and the existing
shared-first-proposal evaluator. It does not create a second reasoning engine.
The opt-in `DERIVE_THEN_REPLY` contract permits a public native-IR proposal, then
a final reply. Only an explicitly injected, scope-bound computation session can
execute it. Normal CLI/UI and the existing GPQA adapter do not enable this path.
The existing text-benchmark envelope explicitly rejects the new tool capability.

Four development and eight fresh transfer objectives are frozen before inference:
latent-dependent Bayesian selection, selected causal interventions, coupled
state accumulation and conditional finite-population sampling. Separate Python
Fraction/full-joint/iterative oracles cross-check all twelve before execution.
These are implementer-authored numerical-modeling tasks, not official GPQA and
not evidence of improved scientific factual knowledge. No GPQA questions,
references, failure indices or private model reasoning are loaded for this work.

Both arms receive the SAME first live public derivation. Proposal-only validates
the native language but receives no computed quantities; exact execution returns
the existing bounded workbench's result. A second model call interprets the
observation and chooses an answer. The independent strict oracle grades only
after the turn; no acceptance feedback or answer repair enters cognition.
Transfer has both arm orders within every domain. The shared proposal is a
replayed proposal, never a replayed operation or a fresh live observation.

Limits: Super model unchanged, two logical calls per arm, 8192 output tokens per
call, original 180-second task lease, six total shared HTTP attempts per pair,
one prebound computation with 100,000 work units / 2000ms maximum. The second
branch subtracts the shared prefix's elapsed time; neither lease nor dispatch
budget is renewed. Only the fixed NVIDIA endpoint is authorized. No files,
source writes, shell, deployment, credentials or general network tools.

Unique provider evidence is counted once physically. Prefix tokens/requests are
allocated half to each arm, separately from logical reuse and actual dispatch.
Report 10% per-pair MODEL-compute matching, unknown usage, retries and latency;
tool work/time is additional measured compute, not silently free or matched.
Keep model-formulation errors, wrong choices, schema/native-IR failures,
authorization failures, truncations and provider failures separate. No automatic
promotion or near-100% GPQA claim follows from a small numerical pilot.

Ω coverage: reuse validated computation, explicit scoped authority, generator /
independent detector separation, common-proposal ablation and honest compute.
Scientific-knowledge improvements, GPQA promotion, new brain layers and production
authority are deferred. Corpus coverage remains PARTIAL / JUST-IN-TIME.

The first execution at `96fcf78b` (run `37757683231`) stopped before inference:
the evaluator called nonexistent `liveNvidiaCapacity.readiness` rather than the
existing `waitUntilReady(deadline, signal)`. Selected 24 task-arms, attempted /
graded / correct 0, unexecuted 24; no cognitive result or artifact was produced.
This is an evaluator integration failure, not a model failure. The normal app
TypeScript ratchet includes `src`, not this script. The corrected workflow now
also type-checks this evaluator and its imports with pinned TypeScript before
live inference. Task population, prompts, oracles, model, budgets and acceptance
checks are unchanged for the corrected execution.

### Computation pilot: no accuracy promotion; reporting corrections

Corrected candidate `a9c7e42e`, run `37758318211`, selected/attempted all 24
task-arms. Each arm graded/correct 1/4 development and 3/8 transfer. Twelve
task-arms had native-IR rejection, two truncation, and two provider lease-timeout
outcomes: 8 graded/correct, 16 ungraded, zero unexecuted. This is NOT 100%
accuracy: only 8/24 selected task-arms reached grading. Exact execution had no
acceptance advantage. Five exact computations were observed; three numerical
outputs agreed with the independent oracle and two disagreed. One correct final
choice followed a numerical disagreement. This does not independently establish
semantic model correctness or identify the disagreement's root cause.

Artifact/log reconciliation found two evaluator defects. Original
`actualUniqueModelUsage` incorrectly deduplicated content-addressed request IDs:
distinct physical inferences on identical requests can share an evidence ID.
The original report claims 28 calls / 192,687 tokens; retained per-branch counters
and allocated sums independently establish **34 actual HTTP calls / 253,810
reported tokens, plus two calls with unknown usage**. There were 46 logical calls
including 12 explicit prefix replays. Two null-category provider lease timeouts
were originally mislabeled `INTEGRATION_FAILURE`; delivery records establish
`PROVIDER_FAILURE`. Original artifact bytes and labels are preserved, not edited.
Receipt `docs/omega/evidence/nyx-computation-transfer-a9c7e42e.json` records the
audited interpretation. Seven pairs match model compute, but only one of those
also reached final grading; it tied. No cognitive promotion is supported.

The narrow correction counts actual completion callbacks (never replays),
classifies timeout delivery records, exposes only allowlisted native-compiler
findings, and tells cognition the existing native representation bounds. It
does not relax the 64-step interpreter, grant a tool to normal chat/GPQA, change
the model, expand task leases or supply oracle feedback. A four-objective fresh
`DIAGNOSTIC` cohort probes native emission under the same two-call limits. It is
development evidence, not a transfer/GPQA score or proof of general improvement.
The exact rejection causes were NOT recoverable from the pilot's generic
findings; do not claim the bounds were proven to cause every rejected program.

### Native-generation diagnostic and collection-bound correction

Candidate `37dc44bb`, run `37772516437`, attempted all eight task-arms: six
graded/correct, two ungraded. Both arms tied at 3/4. The remaining objective's
first proposal was rejected with `PHASE_BOUND`, followed by another rejection;
the precise field is not recorded. No provider failures, truncations or unknown
usage occurred: 12 actual HTTP requests, 88,622 reported tokens, 16 logical calls
including four prefix replays. Three model-compute-matched pairs exist; the two
graded matched pairs tie. Of three executed programs, one numerical output
agreed with the independent oracle and two disagreed despite correct final
choices. The legacy `computedModelCorrect` field measures this output agreement,
not semantic correctness of the entire model. Program digests alone cannot
attribute a disagreement to formulation, lowering or execution.
**No cognitive/tool advantage.**
Receipt `docs/omega/evidence/nyx-native-derivation-37dc44bb.json` preserves the
original sanitized report, archive digest and exact report/log reconciliation.
Candidate CI caught stale generated W0 inventories; refreshed inventories at
`3012bc7c` passed complete CI, 108 suites / 11,172 checks, TS zero and build.

The generation schema omitted cardinality bounds required by the independent
native compiler. An opt-in `COLLECTION_BOUNDS` profile mirrors these bounds in
JSON Schema; normal chat, default native generation, parser, compiler and
acceptance are unchanged. Independent Ajv checks reproduce twelve rejected
structures that the legacy schema admits; duplicate update semantics remain
the native compiler's responsibility even with the stronger generation schema.
NVIDIA documents [JSON-schema structured generation](https://docs.nvidia.com/nim/large-language-models/1.15.0/structured-generation.html),
but that is not proof the hosted endpoint enforces every keyword. The fresh
four-objective bounds ablation tests empirical compatibility and coverage.
Both arms receive identical exact-computation authority, model, calls, tokens,
leases and grader; only schema cardinality/numeric constraints differ. Proposals
are independent, not replayed, because the generation schema is the treatment.
Realized tokens, tool work and unmatched pairs remain explicit. These are fresh
development parameter variants, not independent replication or a GPQA score.

The frozen ablation at `86fd1b3f` is terminal in
[run 37775509813](https://github.com/malekismail487-web/generous-ai-core/actions/runs/37775509813).
Legacy schema graded/correct 2/4; bounded schema graded/correct 3/4. All eight
task-arms were attempted, five graded/correct, three ungraded. The legacy arm
had a `CYCLE_BOUND` rejection; both arms truncated their first proposal on one
objective at the unchanged 8,192-token ceiling. No provider failures, retries
or unknown usage occurred. Each arm used seven physical requests: legacy
55,103 tokens, bounded 47,785; total 102,888. **Zero pairs met the realized-model-
compute matching criterion.** The small coverage difference is not a demonstrated
cognitive gain or reproducible promotion. The optional schema remains unpromoted.
Five native computations ran: two numerical outputs agreed with the independent
oracle, three disagreed, despite five correct final choices. Final-choice grading
and numerical-output agreement remain separate; no acceptance check was changed.

Receipt `docs/omega/evidence/nyx-native-collection-bounds-86fd1b3f.json` preserves
the original report, SHA256-verified archive, exact terminal-log/row reconciliation
and physical-call accounting. CI at the same candidate passed 108 suites /
11,175 checks, TypeScript 5.8.3 zero, secret scan, Linux build and package smoke.
An ephemeral independent Python `Fraction` phase interpreter also agreed with
the existing compiler/executor on 200 generated programs / 1,200 output
comparisons, including all seven operations, dependent expressions, simultaneous
state copies, multiple phases and constant/name collisions. This is a narrow E3
execution cross-check, not model reasoning evidence or independent replication;
it does not retrospectively identify the earlier numerical disagreements.
No GPQA rerun, official-question ingestion, default change or authority increase
occurred. The original 198-selected / 194-graded / 148-correct GPQA result stands.

### Exposed GPQA failure-cohort retest

At the operator's explicit request, `GPQA_FAILURE_RECOVERY` selects **all 46
original wrong choices and all four ungraded timeouts**, using the pinned
`da4bb546` receipt's outcome/identity projection. The full 198-question source
and seed-0 choice ordering are hash-checked before selecting the 50 tasks.
Selection never consults reference choices. Every task receives one new session
under the original Super read-then-reply configuration, strict A–D grader,
two logical calls, 8,192 output-token ceiling, 180-second task lease and bounded
shared delivery allowance. No earlier response, correctness feedback or failure
identifier is supplied to cognition. Default Ultra and authority are unchanged.

This is **previously exposed, outcome-selected recovery**, not fresh transfer or
a full GPQA score. Above 90% requires at least 46/50 correct in one completely
graded epoch. Partial grading, dropped tasks, ever-correct/best-of accumulation
and combining new successes with historical 148 successes cannot satisfy it.
Previously passing tasks are not retested, so their current regression status
is unknown. Original outcomes remain immutable; physical costs and unknown usage
are retained. A low score does not authorize answer-specific repairs or an
unchanged replay-until-lucky loop. General corrections still require independent
development reproduction and fresh transfer with unchanged acceptance checks.

Ω plan coverage: directly implements evidence-linked recovery, original/repaired
outcome separation and no self-certification; supports source custody, finite
leases and honest compute. Defers cognitive promotion, fresh/full-population
recertification and production changes. The exposed-cohort mode is explicitly
separate from full-population measurement, resolving that architectural conflict
without weakening its completeness invariant. Coverage: PARTIAL / JUST-IN-TIME.

### Offline native-derivation replay — diagnostic gap repair

Prior numerical pilots stored only program digests. A wrong computed quantity
followed by a correct final choice therefore could not be attributed to a model
formulation, lowering defect or execution defect. This supporting change does
not add cognition, rerun exposed tasks or retrospectively identify those causes.

Future synthetic computation-development runs retain a bounded **public native
tool-action capsule**, not raw inference or private reasoning. Capture checks
the original problem, request, lowered-program and analysis digests before
copying only prebound constants, phase equations and returned quantities. No
question, choice, reference answer, free-form response or private inference field
is copied. Null means no admissible constructed replay was captured, not success.
Capture overhead is reported separately and still consumes the original task
lease. The model receives exactly the same observations as before; replay does
not run inside cognition or alter acceptance.

`replay-native-derivations.py` directly interprets phase equations with Python
`Fraction`, without importing the production lowering/interpreter. It enforces
finite input, iteration, operation, integer, wall-clock and work limits, and
rejects malformed, stale, duplicate-key or unsupported data. It distinguishes
execution agreement, disagreement and insufficient evidence. Agreement means
the supplied model was executed consistently, **not that it models the task
correctly**. A disagreement implicates lowering/execution collectively; further
isolation is still needed. Hashes are content bindings, not authentication.

Reproducible E3 checks cross-checked **200 generated programs / 2,000 outputs**:
all seven operations, dependent expressions, phase-local names, repeated cycles,
simultaneous state copies and constant/register-name collisions. Nine Python
test methods and five aggregate TypeScript checks cover hostile inputs, changed
outputs, resource/domain failures, oracle exclusion and capture bindings. These
are implementer-authored, separate-language checks, not independent replication
or a model-reasoning/GPQA score. No additional model calls were made.

The existing synthetic-computation workflow replays captured derivations offline
after inference, including when its final grading step failed. Missing constructed
captures, no captured execution, replay disagreement and resource/domain failure
cannot pass this check. Unexecuted rows remain explicit; successful replay is not
full-task coverage. The checker has no path back to the model or task grader.

```powershell
python -B scripts/omega/benchmarks/test-native-derivation-replay.py
node --experimental-strip-types --import ./scripts/w0rs/register-typescript-loader.mjs scripts/omega/benchmarks/native-replay-crosscheck.ts | python -B scripts/omega/benchmarks/replay-native-derivations.py
```

Ω coverage: directly implements detector validation, replayable provenance and
failure localization; supports generator/detector separation and honest resource
accounting. Defers model-formulation repair and fresh cognitive transfer. The
public-IR exception is limited to synthetic development because digests alone
proved insufficient; private reasoning and official benchmark data remain
excluded. No authority, acceptance, model, lease or rollback policy is superseded.
Coverage remains PARTIAL / JUST-IN-TIME. The frozen GPQA recovery candidate and
its quiet completion watch remain unchanged.

### GPQA failure recovery: terminal, target not reached

Candidate `e52cbb79`, [run 37779484122](https://github.com/malekismail487-web/generous-ai-core/actions/runs/37779484122),
attempted all 50 selected cases once: **47 graded, 12 correct, 35 wrong valid
choices, three ungraded provider timeouts, zero unexecuted**. Of the original 46
wrong cases, nine recovered, 34 remained wrong and three timed out. Of the four
original ungraded cases, three were correct and one was wrong. No format,
truncation, schema, authorization or infrastructure failure was recorded.
The above-90% recovery target was not reached; neither was 80%. Unchanged replay
did not resolve the cohort. This is exposed recovery, NOT a fresh transfer or
full-GPQA score. The original 148 correct / 46 wrong / four ungraded remain
unchanged; the original 148 passing cases were not retested.

The SHA256-verified artifact agrees with the terminal report, all 50 task rows
and final progress. Selection membership and every input digest agree with the
pinned original receipt. Consumption: **100 logical / 100 physical requests,
238,766 reported tokens, three unknown-usage calls**, 50 scoped file reads,
2,832,368 ms epoch duration, 180,072 ms pre-lease capacity waits and 50,667 ms
capacity waits inside provider calls. All recorded source repositories remained
unmutated; no broader authority was granted. Model/configuration, source pins,
closed-book scope, strict A-D grading, 8,192 output-token ceiling and original
180-second task lease were unchanged. The three answer timeouts hit the fixed
120-second provider limit; delivery repair is separate from wrong-choice repair.

See [sanitized recovery receipt](../../../docs/omega/evidence/nyx-super-gpqa-failure-recovery-e52cbb79.json).
Outcome-only evidence cannot identify specific scientific knowledge or reasoning
defects. Next investigate competing hypotheses and discriminating experiments
on separate development tasks, beyond the already-tested prompt-only check.
Do not read official reference answers, merge stale successes, replay until
lucky, or promote cognition from this result. Default Ultra, prior AIME/GPQA
and BBEH cancellation are preserved. The completion watch is paused after capture.

Ω coverage: evidence-linked claims, immutable first-attempt/recovery separation,
finite leases and honest compute; defers fresh transfer, full recertification and
production authority. Coverage remains PARTIAL / JUST-IN-TIME.

### Experimental finite-probability formulation — unpromoted

Numerical pilot disagreement exposed a model-formulation failure surface that
more delivery retries cannot fix. The candidate represents binary dependency
tables, observed events and interventions explicitly, then lowers enumerated
sum/product expressions into the **existing** exact-rational executor. It adds
neither a model nor a parallel execution stack. Normal NYX/default Ultra remain
unchanged. Native work, time, request, integer, 64-step and 32-register limits,
revocation, scope binding and independent acceptance still apply. Compiler work
is charged to the same session. Undefined conditioning cannot be optimized away.

The mathematical basis is marginalization of factored distributions
([Kschischang, Frey and Loeliger](https://www.isiweb.ee.ethz.ch/papers/arch/aloe-2001-1.pdf))
and explicit intervention by truncated factorization
([Pearl](https://ftp.cs.ucla.edu/pub/stat_ser/r350.pdf)). This implementation uses
bounded exact enumeration, not loopy belief propagation or a biological brain.
Scientific validity of the model/causal assumptions is **not** established by
executing it. No improvement on GPQA or broad scientific reasoning is yet proven.

Development and frozen transfer each contain four synthetic objectives in
collider diagnosis, confounded actions, selected causal chains and reliability
mixtures. Transfer changes graph topology as well as numerical parameters.
They are implementation-authored E3 research, not official benchmarks or an
independent replication. A separate Python Fraction full-joint oracle checks
200 generated models and all eight reference objectives before live inference.

The existing computation runner compares bounded phase IR with the declarative
model using the same Super configuration, objective, two-call ceiling, 8,192
output tokens/call, 180-second task lease, tool authority and unchanged grader.
Both arms use independent inference; model tokens/calls, provider disruption,
compiler failures and additional native work remain explicit. Only pairs meeting
the existing 10% realized-model-compute tolerance qualify as compute-matched;
equal ceilings alone do not. A correct final choice and a correct computed
quantity are measured separately and jointly. Public synthetic model/action
capsules permit independent execution replay without storing private reasoning
or reference answers. No best-of accumulation or grader feedback enters cognition.

Ω coverage: directly implements structured model formulation, generator/detector
separation, evidence-bound execution and fresh comparison; supports resource
leases and causal-assumption visibility. Defers cognitive promotion, official
benchmark retesting, general causal discovery and production deployment. Resolves
the representation/executor boundary by reusing one native execution capability.
Coverage remains PARTIAL / JUST-IN-TIME. The ≥80% cross-benchmark goal is not met.

### Finite-probability development result: no promotion

Frozen candidate `0eaca83b`, [run 37813542513](https://github.com/malekismail487-web/generous-ai-core/actions/runs/37813542513),
completed all eight task-arms: seven graded/correct, one ungraded, none unexecuted.
The bounded phase-IR baseline jointly passed **4/4**; declarative probability
jointly passed **3/4**. Joint acceptance requires both the final choice and the
native quantity to be correct. There were no wrong valid final choices, provider
failures, truncations or unknown-usage calls. Candidate selection failed first
with `derivation_ir_invalid / QUERY`, then exhausted its original one-request
native allowance. This is not a demonstrated hidden-case reasoning failure.
The original coarse diagnostic cannot establish whether fields, ID syntax or a
duplicate query ID caused rejection; the rejected proposal was not retained.

Consumption: **16 logical/physical model calls, 54,636 reported tokens** and
338,195 ms. Baseline used 30,319 tokens; candidate used 24,317. All four pairs
were provider-stable, but **none** met the frozen 10% realized-model-compute
tolerance. Lower token use with lower acceptance is not cognitive promotion.
Three constructed probability models and four phase-IR programs agree with
separate-language Python execution. That checks computation, not formulation
validity or independent replication. Source integrity and authority were preserved.

The SHA256-verified archive, report, progress and all terminal rows agree; see
[sanitized receipt](../../../docs/omega/evidence/nyx-probability-development-0eaca83b.json).
Its original native-work total is incomplete: a rejected compiler invocation
spent budget but returned no analysis, so the old runner recorded zero for it.
The follow-up reads existing host session counters, preserves first denial
separately from terminal outcome, and records unreturned elapsed time as unknown.
`QUERY_SHAPE`, `QUERY_ID` and `QUERY_DUPLICATE` now distinguish future failures;
query-field/unique-ID instructions clarify existing constraints without relaxing
them. These are reliability/measurement repairs, not measured cognitive gains.
The already-frozen topology-changing transfer corpus remains byte-unchanged.
One follow-up transfer comparison will retain the original budgets and grader;
no exposed official benchmark question or answer enters the mechanism.

Ω coverage: detector validation, first-attempt preservation, failure localization
and honest resource accounting; supports bounded leases and fresh transfer.
Defers promotion, official benchmark retesting and production authority. No
authority or acceptance rule is superseded. Coverage: PARTIAL / JUST-IN-TIME.

### Topology-changing probability transfer and bounded relevance repair

Frozen candidate `d1955688`, [run 37815945575](https://github.com/malekismail487-web/generous-ai-core/actions/runs/37815945575),
completed all eight selected task-arms: six graded, five correct, two ungraded,
none unexecuted. Declarative probability jointly accepted **3/4**; phase IR
accepted **2/4**, under the unchanged final-choice AND native-quantity oracle.
All four pairs were provider-stable, but **zero** met the frozen 10% realized
model-compute tolerance. There is no cognitive promotion or official benchmark
score. The candidate also remained 3/4 from development to transfer.

The baseline produced one wrong native quantity/valid choice and one
`LOWERED_STEP_BOUND` rejection. Probability produced one `STEP_BOUND` rejection,
followed by native-request exhaustion; both causal order and original terminal
classification remain preserved. Rejected proposal structures were not retained;
their precise algebra cannot be inferred from digests. Three admitted probability
models and three phase-IR programs replay exactly. That verifies execution, not
the scientific validity of the proposed models.

The run spent 16 logical/physical calls and **89,177 reported model tokens**,
with zero provider failures, retries or unknown-usage calls. Native counters
include all eight consumed requests and **5,723 work units**, including rejected
compilation. Native elapsed time totals remain unknown: 10 ms was returned and
two rejected analyses returned no time. Artifact, logs, progress, input bindings
and source hashes agree; the [receipt](../../../docs/omega/evidence/nyx-probability-transfer-d1955688.json)
preserves the original result separately from subsequent changes.

Compiler version `nyx-finite-probability-lowering/3` now prunes variables outside
the ancestors of each query's event/evidence in the intervened DAG. This is exact
normalized-factor marginalization, not approximation or relaxed acceptance
([Sontag, lecture 6, slides 4–6](https://people.csail.mit.edu/dsontag/courses/inference14/slides/lecture6.pdf)).
All original variables/tables are validated first. Intervention conflicts,
impossible evidence, unused query guards, expiry/revocation and the original
64-step/32-register/work/request limits remain enforced.

On 200 separate fixed-seed development models, the pinned predecessor admitted
112 declarations; the new compiler admitted 198, with 86 newly admitted and
zero admission regressions. Admission is not necessarily a defined probability:
undefined conditioning still fails closed. All 409 admitted/special cases agree
with the unpruned separate-language Fraction oracle. A separate 600-model stress
check admitted 583: 365 constructed exact results, 218 correctly undefined cases;
17 still hit the unchanged step bound, zero unexpected execution failures.
These are E3 native execution/coverage gains, **not live-model cognitive gains**
or independent replication. The rejected live proposals have not been repaired
or rerun, and the frozen tasks/oracle are unchanged.

Reproduce the additional multi-query/intervention check from the repository root:

```powershell
node --experimental-strip-types --import ./scripts/w0rs/register-typescript-loader.mjs scripts/omega/benchmarks/check-probability-relevance.mjs
```

Ω coverage: directly implements query-relevant exact inference and preserves
negative transfer evidence; supports generator/detector separation and unchanged
leases/authority. Defers live reasoning promotion and production deployment.
No security/acceptance rule is superseded. Coverage: PARTIAL / JUST-IN-TIME.
The ≥80% cross-benchmark goal remains unachieved. The next evaluation priority
is the existing actual-benchmark path, not another speculative cognitive layer.

### Actual ARC Super configuration transfer — frozen protocol

`NYX-ARC-SUPER-CONFIGURATION-FRESH-TRANSFER-001` reuses the existing engineering
cognition, R3 bounded repair loop, disposable repository session and independent
exact-grid scorer. It adds no cognition/execution stack. The primary/default
Ultra configuration and historical results are unchanged. Super requires an
explicit host-owned evaluation opt-in; unknown controls, wrong models and
unbounded/incompatible reasoning budgets fail before dispatch.

The next eight lexicographic public evaluation identities after the ten already
exercised tasks are frozen in `ARC_SUPER_CONFIGURATION_SELECTION`, at official
revision `f3283f727488ad98fe575ea6a5ac981e4a188e49`. Selection uses paths only,
not content or correctness. The treatment is native hosted `none` versus native
hosted `high` with a finite 4,096-token reasoning budget, using the same Super
model. These controls follow the
[NVIDIA Super API contract](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-super-120b-a12b-infer).
Both arms keep the same prompt construction/public task data, source-lines schema and array bounds, total
8,192 output-token cap per call, two physical calls per task including retries,
155-second task lease, tool/mutation envelope, public-example repair feedback,
quality checks and withheld-output oracle. The experiment configuration digest
binds common settings **and the explicitly different per-arm treatment**; it
does not claim that arm inference configurations are identical.

Equal caps do not establish equal realized compute. Reports retain physical and
logical calls, reported/unknown tokens, tool work, latency, first candidates,
repairs, provider/serialization/syntax/quality/functional outcomes and strict
10% realized-compute pairing. Two consecutive provider failures stop dispatch
without erasing unexecuted tasks. Public evaluation is not a sealed/protected
leaderboard, and unknown pretraining exposure remains. No accuracy, cognitive
promotion, >=80% confidence or full-benchmark score is claimed before evidence.

The preceding CI failure was a test-only TypeScript union-narrowing error at
`omegaNyxTextBenchmark.test.ts`: a quantitative replay fixture accessed `cycles`
without asserting that its union member contained that field. The assertion now
narrows the type and independently checks the expected fixture shape. It does
not change model inference or any acceptance criterion. Generated package and
repository inventories are refreshed for source consistency, not a release.

Ω coverage: directly implements controlled inference-configuration comparison
and fresh transfer evaluation; supports generator/detector separation, explicit
substrate identity, compute accounting, provenance and negative-capability
preservation. Defers cognitive promotion, protected/full benchmark claims,
production authority, recursion and biological expansion. No inherited safety
constraint or original scored outcome is superseded. PARTIAL / JUST-IN-TIME.

Frozen candidate `7b3c0f894254ab3bcc5871a817a3520a7ce8bedb` was published after
109 suites / 11,418 checks, TypeScript 5.8.3 zero diagnostics, full CI script
typecheck, build, package consistency/smoke, inventory checks and secret scan
(1,284 tracked text files, zero findings). Its
[single live configuration run](https://github.com/malekismail487-web/generous-ai-core/actions/runs/37821316792)
was confirmed started. The temporary push trigger is removed in the follow-up
checkpoint; manual dispatch remains available but no replay is authorized by
this record. Launch/preflight evidence is not terminal benchmark evidence.

### Compute-parity accounting correction (separate from the frozen ARC run)

A synthetic two-control reproduction had exact known, equal model/tool/scorer
usage and a matching per-task pair, but `matchedRealizedCompute=false`: the
global calculation incorrectly included an unconfigured reference arm. The
corrected coordinator measures only explicitly configured non-raw controls,
requires at least two, retains every unused arm's blocked record, and still
rejects missing/partial/unknown/provider-unstable observations. It additionally
requires each task to satisfy the unchanged 10% tolerance: equal grand totals
cannot hide opposite per-task imbalances. Raw-model-only and single-control
runs cannot claim equivalent-tool parity. These are accounting checks, not
model capability evidence or permission to promote an unsuccessful candidate.

The correction is not applied to frozen candidate `7b3c0f89` or its original
report. Original outcomes and flags remain historical evidence; any later
interpretation must distinguish recorded flags from independently recomputed
pair accounting. Functional/private oracles, model calls, task selection,
budgets, authority, default Ultra and quality thresholds are unchanged.
Verification: 109 suites / 11,433 checks, zero failures; population accounting
39 checks and capability harness 162 checks; TypeScript 5.8.3 remains zero.
### ARC Super configuration comparison — terminal evidence

The [frozen run](https://github.com/malekismail487-web/generous-ai-core/actions/runs/37821316792)
completed all eight selected tasks in both configured arms: **16 attempted
observations, zero independently graded, zero accepted**. No hidden-case score
or cognitive improvement is established. The unused raw/reference records are
not additional requested model work.

Native `none` ended with five schema failures and three public-functional
failures. Native bounded `high` ended with six public-functional failures and
two resource-exhausted observations. All eight current observations and seven
of eight candidate observations encountered a schema rejection during their
bounded interaction; missing required evidence references were recurrent.
Four current and six candidate proposals reached public execution; none passed.
Thus unreached hidden tests are not hidden-case reasoning failures.

Current used 16 physical/logical calls and 166,993 reported tokens with no
provider failures or unknown usage. Candidate used 16 physical / 15 logical
calls, 175,915 reported tokens, three unknown-usage calls, three provider
failures and one retry. Only **1/8 pairs** met the existing strict realized
compute check; equal caps did not produce a matched campaign. Wall time was
1,079,058 ms. All source/cleanup checks passed.

Artifact SHA256:
`d7cae9ffc2540f33dd846b44a2190d445aeb9bf9875192637da00f24efc31051`.
The [receipt](../../../docs/omega/evidence/nyx-arc-super-configuration-7b3c0f89.json)
records artifact/log/progress agreement, frozen source/configuration identities,
original outcomes and the original false global parity flag without rewriting
the report. The later accounting fix does not make these pairs matched.

Code inspection identified a general generation/local-contract mismatch:
the hosted schema requires only `decision` and `diagnosis`, while
`PROPOSE_EDIT` locally requires causal hypothesis, evidence references,
invariant, expected result, counterexamples and changes. Prompt instructions
alone did not reliably supply the missing obligations. The next correction
must reproduce this on separate development intents and align generation
requirements without inventing citations or relaxing local validation.

NVIDIA's [model guidance](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-super-120b-a12b)
recommends temperature 1.0 / top-p 0.95. Its
[reproduction configuration](https://github.com/NVIDIA-NeMo/Evaluator/blob/main/packages/nemo-evaluator-launcher/examples/nemotron/nemotron-3-super/local_nemotron-3-super-120b-a12b.yaml)
uses much larger output/time budgets and repeated samples. Those settings are
research context, not evidence of a NYX improvement, a comparable score, or
permission to change this frozen run. Default Ultra, acceptance oracles,
authority and historical benchmark outcomes remain unchanged.

### Decision-required generation contract — bounded fresh transfer

The opt-in `DECISION_REQUIRED_FIELDS` grammar derives one complete generation
branch per existing allowed decision from NYX's existing required-field map.
It does not fill evidence references, fabricate hypotheses, alter local parsing,
relax semantic/source/quality checks, or authorize execution. Omission keeps the
historical grammar and default Ultra configuration unchanged. Independent AJV
development checks reproduce the optional-wire/local-required mismatch and
verify branch obligations, target/evidence enumeration, bounds and rejection.

The one-shot experiment composes the existing R3 repository session, repair
loop and private exact scorer on four newly authored tasks: transactional
allocation, finite-state interpretation, exact arithmetic and Unicode dynamic
programming. Two development and two validation tasks are frozen before any
inference. Test-only reference solutions establish oracle/executor viability;
they are never model inputs. This is not an official benchmark or independent
institutional replication. The original ARC questions are not retested here.

Both arms use separately labeled Super native `none`, temperature 0, 8,192
output-token caps, two logical AND two physical calls including retries, two
candidate iterations, three verifier executions, 155-second task leases and
the same 12,000-byte mutation envelope. Only the generation schema changes.
Report first-call/repaired acceptance, schema diagnostics, hidden-case and
quality failures, known/unknown usage, actual calls/tokens/verifier work,
latency and cleanup. Equal caps are not actual parity: retain the existing
10% realized-compute test and separately report any acceptance gain requiring
no more measured compute on any accounted axis. No raw generated source or
private model reasoning is persisted. Live benefit is unverified until the
frozen run completes; no capability promotion follows from E3 grammar tests.

Ω plan coverage: directly implements generator/detector contract alignment,
evidence-over-confidence and no self-certification; supports bounded repair
and action provenance; defers cognition/brain expansion and production
promotion. No architectural conflict identified. Coverage remains
`PARTIAL / JUST-IN-TIME`; no total corpus coverage or authority increase.

### Decision-required contract — terminal fresh-transfer evidence

The [frozen live run](https://github.com/malekismail487-web/generous-ai-core/actions/runs/37853689629)
at `69dea278e2156a6894ddaf46529123a8f8376197` completed all four tasks in
both arms with zero provider failures, retries or unknown-usage calls. Hosted
Super accepted the new grammar. Schema-rejected interactions fell **6 -> 1**;
final functional acceptance improved **1/4 -> 4/4**, and full quality acceptance
**0/4 -> 2/4**, both newly accepted tasks on the first model call. However,
validation quality acceptance remained **0/2 -> 0/2**: this is an observed
interface repair, not a general cognitive or broad coding-quality promotion.

Baseline used eight calls / 35,428 reported tokens; treatment used six calls /
31,652 tokens, but more verification/scoring work and longer aggregate latency.
**0/4** pairs met strict realized-compute parity; no all-axis compute dominance
was observed. Equal caps are not equal work. The arithmetic validation proposals
passed every functional case but exceeded the unchanged declaration limit
(6 vs 4). The Unicode repair passed every functional case but exceeded it
(7 vs 4). One arithmetic repair also emitted an overlong diagnosis. Private
scores were never repair feedback. Original and repaired outcomes are retained.

Artifact SHA256:
`7028a51436cbf979a73c0939f4270b9e26ebb0fb15fe324e7644e65680e7138b`.
The [receipt](../../../docs/omega/evidence/nyx-decision-contract-transfer-69dea278.json)
records frozen/log/artifact agreement, all 15 source hashes, task/oracle identities,
resource accounting, acceptance and cleanup. Candidate CI passed 109 suites /
11,515 checks, TypeScript zero, build, packaged launch, native replay and security
checks. Automatic launch was removed; no production or default Ultra change.
Next: investigate structural quality-feedback interpretation using existing
measured/declaration-site guidance and fresh controlled tasks, not task-specific
patches, looser quality gates or another cognitive layer.

### Fresh ARC decision-contract / quality-feedback transfer

`NYX_ARC_DECISION_QUALITY_COMPARISON=1` reuses the existing ARC epoch, R3
repository session, bounded repair loop and exact withheld-grid scorer. The
eight task identities are frozen as the next lexicographic paths after the
eighteen previously exercised public evaluation tasks, before inspecting their
contents. Public pretraining exposure remains unknown; this is neither sealed
evaluation nor the full ARC population. No task-specific algorithm is added.

Both arms use separately labeled Super, native reasoning `none`, temperature
zero, 8,192 output tokens, the repaired `DECISION_REQUIRED_FIELDS` generation
grammar, and identical existing authority, tools, time/call/patch limits and
strict functional/static-quality acceptance. `CURRENT_NYX` receives existing
public quality findings; `CANDIDATE_NYX` enables the already implemented
`STRUCTURE_SITES` explanation only after a bound quality rejection. It exposes
current declaration locations, the cumulative original-state limit and the
required reduction, not hidden answers, candidate code solutions or authority.
First-attempt treatment payloads are identical. No cognitive layer, production
change, default Ultra change or quality-threshold relaxation is introduced.

Hypothesis: existing source-linked feedback lets the model translate static
rejections into valid architectural repairs on unseen benchmark tasks. Measure
first-attempt and repaired full acceptance separately; retain schema, syntax,
functional, hidden-grid, quality, provider and resource failures separately.
Each trace records numeric public quality findings and the actual treatment.
Equal limits are not matched realized work: report per-task and total calls,
tokens, verification work, latency and unknown usage before interpreting gains.
No gain, no exercised quality-repair pathway, provider instability or inadequate
compute matching cannot support promotion. Lower schema rejection alone remains
interface reliability, not cognitive improvement. The one-shot push trigger is
removed immediately after confirming the single launch; artifacts also retain
an explicitly partial checkpoint if execution is interrupted.

### ARC source-linked quality transfer — terminal evidence

The [frozen live run](https://github.com/malekismail487-web/generous-ai-core/actions/runs/37855788646)
at `b4ea88c0a94e6b74533d628ea000e34210ce9049` completed eight fresh tasks
in both arms with zero provider failures, retries or unknown-usage calls.
Both used repaired decision-required grammar, native Super reasoning `none`
and unchanged budgets and acceptance. Neither arm reached hidden-grid grading:
**0/8 accepted and 8/8 ungraded per arm**, not a complete ARC score. All twenty
public candidate executions failed; no quality assessment occurred. Therefore
the source-linked quality-feedback treatment was **not exercised**, and its
causal benefit is unestablished. First-attempt and repair successes were both zero.

Current final failures: three schema, two truncation, three functional.
Treatment final failures: four schema, four functional; one earlier truncation
was preserved even though its final outcome was functional failure. Intermediate
diagnostics include six invalid counterexample-item observations, two overlong
causal hypotheses, one no-op repair and one syntax rejection. The current
`invalid_item` code cannot establish whether an item was empty or overlong.
Public mismatch versus runtime errors is also unresolved by retained diagnostic
digests. Ungraded hidden cases are not hidden-case reasoning failures.

Both used sixteen calls and eighty tool-work units; current reported 238,982
model tokens versus 220,429 for treatment, with aggregate task latencies 222,054
and 176,149ms. Only **1/8** pairs met strict realized-compute parity; the entire
epoch took 398,238ms. Equal caps and provider stability do not prove matching or
cognitive improvement. No broad promotion is justified.

Artifact SHA256:
`0a212a05a076a3c027cfa50908c77ad9525e137a2e582ef8053546b73864a673`.
The [receipt](../../../docs/omega/evidence/nyx-arc-decision-quality-b4ea88c0.json)
records log/artifact/progress agreement, all 134 source-file hash bindings,
configuration, selection, original and repaired outcomes, independent accounting,
cleanup and unchanged source. Hosted CI passed 109 suites / 11,541 checks,
TypeScript zero, secret scan, production build without deployment and packaged
launch checks. Automatic launch is removed; default Ultra and authority remain
unchanged. Next: reproduce the remaining nonempty/text-bound generation/parser
mismatch on independent development intents, not these exposed ARC problems.
No additional cognitive layer or weaker oracle is warranted by this result.

Independent development intents now reproduce five residual contract gaps in
`omegaR3DNyxNemotronCognition.test.ts`. Decision-required portable grammar admits
empty/overlong counterexample strings and overlong causal prose that the full
local JSON schema rejects. Whitespace-only entries and an empty required array
are further semantic rejections even when the full local schema permits them.
All five fail unchanged local validation with no proposal or authority. These
are synthetic interface reproductions, not benchmark performance or a correction.
Any proposed hosted string-bound treatment must retain independent semantic
validation and demonstrate compatibility at the actual endpoint before transfer.

### Bounded decision grammar — experimental delivery correction

`DECISION_REQUIRED_FIELDS_AND_BOUNDS` is an opt-in refinement of the existing
shared cognition, not a reasoning layer or new executor. It derives string and
array bounds from the local request contract, adds decision-specific nonempty
arrays and excludes whitespace-only intent prose. It preserves admitted targets,
evidence enumerations, complete-source reconstruction (including blank lines),
the unchanged local parser, syntax checks, static quality, leases and authority.
The original optional and decision-required policies remain unchanged controls.
Unicode code-point versus UTF-16 lengths and semantic truth still require local
checks; an inference grammar never certifies correctness or authorizes an action.

The hosted compatibility probe uses three synthetic development action shapes,
paired with the previous decision-required policy, through the existing provider,
cognition and disposable repository session. At most six physical calls, 2,048
output tokens per call, 65-second provider timeouts and a nine-minute epoch are
allowed. A rejected hosted schema stops the probe; no silent keyword stripping or
fallback is permitted. Raw responses, reasoning and credentials are not persisted.
This is E4 delivery compatibility plus E3 local admission, not a benchmark score,
general capability gain or proof of universal hosted enforcement. Fresh transfer
requires an observed compatible result and unchanged acceptance checks.

Research: [NVIDIA structured generation](https://docs.nvidia.com/nim/large-language-models/1.15.0/structured-generation.html)
documents guided schemas but not this hosted model's deployed backend version.
[JSON Schema strings](https://json-schema.org/understanding-json-schema/reference/string)
defines length/pattern semantics; backend support must be observed, not inferred.

Ω plan coverage: **PARTIAL / JUST-IN-TIME**. Direct: generator requires detector,
no self-certification, evidence outranks confidence, capability is not authority.
Supporting: original-state quality comparison and exact historical source binding.
Deferred: cognitive promotion, extra connectome layers, production and unrestricted
execution. Conflict: richer hosted keyword support is unknown; retain independent
local checks and reject incompatible delivery rather than weaken them. Superseded
operational approach: silently treating portable grammar acceptance as complete
semantic acceptance; historical results and controls remain preserved.

Initial compatibility run [37998536356](https://github.com/malekismail487-web/generous-ai-core/actions/runs/37998536356)
at `0cdae3e5ddfb4848f81b0b23bf4e1bb95216826e` reached four actual model calls.
Both bounded edit and uncertainty shapes were locally admitted with HTTP 200.
The two evidence-request cases correctly failed before inference: the probe
mistakenly supplied the policy both as observed and as unobserved. Therefore
full hosted compatibility remains **NOT_YET_VERIFIED**, not a provider failure.
The portable edit also failed unchanged source-line validation on an embedded
terminator. No candidate was applied and no reasoning performance was measured.

The original report is preserved. Its generic usage reducer counted the two
`NOT_INVOKED` rejections as calls with unknown usage. Independent dispatch and
delivery evidence establish four physical calls, 13,321 reported tokens and zero
unknown-usage calls (not the report's two). The [receipt](../../../docs/omega/evidence/nyx-bounded-contract-0cdae3e5.json)
verifies the ZIP SHA256, exact report/log agreement, six source hashes and cleanup.
One focused probe correction withholds unobserved policy and fixes zero-dispatch
accounting without changing model, budgets, grammar or local acceptance.

Corrected probe [37999196649](https://github.com/malekismail487-web/generous-ai-core/actions/runs/37999196649)
at `0bb4662259a00858b10fc84934d08961de9b47ce`: **OBSERVED_COMPATIBLE**.
All three bounded action shapes passed independent JSON Schema and unchanged
local admission, while the prior grammar admitted none locally (one embedded
source terminator and two overlong diagnoses). Six physical calls, 18,975 tokens,
zero provider failures and zero unknown usage; dispatch/delivery accounting agrees.
The [receipt](../../../docs/omega/evidence/nyx-bounded-contract-0bb46622.json)
preserves both controls, ZIP/report hashes, source identities and cleanup.
No candidate was applied: this remains a small delivery result, not functional
engineering acceptance, cognitive promotion or a frontier benchmark score.

Next frozen transfer uses `NYX_BOUNDED_CONTRACT_COMPARISON=1` in the **existing**
source-representation runner: VERSIONED-EVENT-PROJECTION, HALF-OPEN-LOAD-PROJECTION,
SIGNED-SPARSE-CONVOLUTION and LEXICOGRAPHIC-PARTIAL-ORDER. Two development and two
unseen validation objectives; no exposed ARC or earlier engineering task is reused.
Identical Super/native-none, temperature zero, LINES source, 8,192 output tokens,
two physical calls including retries per arm/task, three verification calls,
155-second task leases and unchanged exact functional and cumulative-original-state
quality checks. Arm order is balanced before results; strict realized calls/tokens/
verifier-work matching still uses 10% tolerance. First-call versus repaired results,
schema/source failures, public/hidden failures and quality rejection remain distinct.
Test-only independent references and scorer adversarial checks run before inference.
Fixture expected answers and references are never model inputs. Same-session
authorship and unproven hostile-code network isolation remain limitations.

Frozen transfer [37999962307](https://github.com/malekismail487-web/generous-ai-core/actions/runs/37999962307)
at `4905f4ffab9cdc7572e9e36a9460681a81f6f7d7` **falsified promotion**.
Prior grammar: 1/4 quality accepted; bounded grammar: 0/4. All eight bounded
interactions were rejected for duplicate counterexamples before execution, so
unreached functional/hidden checks are not reasoning failures. The single-item
compatibility probe had not exercised this defect. Prior grammar also exposed
one recurring hidden-case failure, two functionally correct but quality-rejected
candidates, and a syntax-invalid final repair. First and repaired outcomes remain
separate; a prior passing iteration is not a passing final revision.

All four pairs were provider-stable, but none met the frozen realized-compute
match. Fifteen physical calls, 65,294 reported tokens, zero unknown usage,
provider failures or retries. The [receipt](../../../docs/omega/evidence/nyx-bounded-transfer-4905f4ff.json)
verifies ZIP/report hashes, exact log agreement, sixteen source hashes, cleanup
and clean-candidate CI (109 suites / 11,638 checks). No default change or cognitive
gain is promoted. These four objectives are now exposed: a correction must be
developed on generic synthetic inputs and evaluated on fresh transfer tasks,
not presented as fresh progress by repeating this selection.

Synthetic differential diagnosis [38001146471](https://github.com/malekismail487-web/generous-ai-core/actions/runs/38001146471)
at `aea71894fba4f8bb079301ddef35333d95634b66` reproduced two interface defects.
The unanchored non-whitespace pattern yielded one-character strings in both cases
despite `minLength=8`; the whole-string pattern yielded 74-97-character strings
despite `maxLength=64`. The length-only control passed both. Six physical calls,
589 reported tokens, zero unknown usage/provider failures. The [receipt](../../../docs/omega/evidence/nyx-generation-pattern-aea71894.json)
verifies artifact/log/source identities. These are generic development prompts,
not benchmark questions, and only sanitized shape statistics are retained.

This behavior is consistent with a documented [XGrammar limitation](https://github.com/mlc-ai/xgrammar/pull/896),
but the hosted backend/version remains **UNKNOWN**. Version 2 of the opt-in
bounded grammar encodes request-derived limits in the whole regex itself and
requires informative prose to start with a non-whitespace character. It does
not trim, deduplicate, invent or silently rewrite returned intent. Local semantic,
syntax, cumulative quality and authorization checks stay unchanged; source blank
lines and historical/default grammars remain intact. AJV 6 regex quantifiers use
UTF-16 rather than Unicode mode, so Unicode/code-point and host-dialect residuals
are explicitly tested and still guarded locally. Hosted correction and fresh
engineering transfer must be observed separately before promotion.

Ω coverage: **PARTIAL / JUST-IN-TIME**. Direct: generator requires a validated
detector, evidence outranks confidence, no self-certification or authority delta.
Supporting: independent dialect reproduction and preservation of negative results.
Deferred: cognitive promotion and new reasoning layers. Conflict resolved: standard
JSON Schema substring-pattern assumptions differ from observed hosted generation;
use an explicit, versioned generation normal form without weakening local admission.

Hosted correction [38001803320](https://github.com/malekismail487-web/generous-ai-core/actions/runs/38001803320)
at `35a3e13f43b06bb322bcdc23887e37e6d4a51aa3`: both repaired-pattern cases
and both length-only controls were informative, distinct and within bounds.
Four physical calls / 422 tokens / zero unknown usage. The [receipt](../../../docs/omega/evidence/nyx-generation-pattern-repair-35a3e13f.json)
verifies exact artifact/log agreement and four source hashes. This is development
delivery verification, not fresh cognitive improvement; prior failures stay intact.

Next frozen transfer (`NYX_PATTERN_TRANSFER_TASKS=1` with the existing bounded
comparison) uses four new objectives: typed leaf paths, stable null-aware ordering,
signed modular matrix products and deadline/capacity selection. Same model/native
none, source representation, budgets, quality thresholds and exact private scorer.
Independent test-only references pass existing Omega execution and strict quality.
That preflight found a fixture defect: embedding serialized JSON directly as a
JavaScript object literal silently changed a `__proto__` key into prototype syntax.
The shared fixture generator now parses a quoted JSON data string, preserving exact
input identity without exposing expected answers or relaxing any acceptance check.
The counterexample remains a regression test; old receipt bytes are not rewritten.

Fresh transfer [38002507576](https://github.com/malekismail487-web/generous-ai-core/actions/runs/38002507576)
at `e71123b05a80cf6fbb27880a149f66529e01c8dc` **falsified promotion again**.
Prior policy: 4/4 functionally accepted, 2/4 quality accepted (one first-call,
one repaired); two remaining candidates exceeded unchanged declaration limits.
Bounded-pattern policy: 0/4, with all eight responses failing JSON parsing before
execution. The plain-sentence diagnostic had not established full intent escaping
compatibility. Unreached checks are not hidden-case reasoning failures.

Fifteen physical calls / 78,773 reported tokens / zero unknown usage or provider
failures. All pairs provider-stable, none matched realized compute; treatment used
more tokens in every pair. The [receipt](../../../docs/omega/evidence/nyx-pattern-transfer-e71123b0.json)
verifies artifact/log/source identity, cleanup and clean-candidate CI (109 suites /
11,719 checks). These objectives are now exposed and no default/cognitive promotion
is admitted. Next diagnostic must isolate quotation, backslash and control-character
generation on generic synthetic data, not loosen JSON parsing or repair benchmark
answers to force a passing result.
