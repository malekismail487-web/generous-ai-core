# NYX benchmark capability program

This is a reproducible **data/evaluation harness**, not a new executor or a new model. It does not claim a cognitive improvement, an official leaderboard score, or near-perfect readiness. Its format tests are development fixtures, never NYX performance evidence.

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
