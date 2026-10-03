# NYX benchmark capability program

This is a reproducible **data/evaluation harness**, not a new executor or a new model. It does not claim a cognitive improvement, an official leaderboard score, or near-perfect readiness. Its format tests are development fixtures, never NYX performance evidence.

## Actual composition

Existing Nemotron-backed NYX cognition → existing typed Omega execution → candidate artifact → independent benchmark verifier → this harness's bound, sanitized record → general capability-gap investigation.

`BenchmarkAdapter.invoke` is a **trusted integration seam**. It receives only allowlisted model-facing input, remaining resource limits and sanitized feedback. It does not receive `PreparedTask`, its private scorer, expected answers or authority tokens. A provider-only integration must be named `RAW_MODEL`; it must not be passed off as current NYX. Actual current/candidate NYX adapters must call existing NYX/Omega machinery. They are not yet implemented for these official task formats.

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
| ARC-AGI-2 | Strict grid input, private test output custody, official-compatible exact two-guess scoring/export | Actual NYX grid-reasoning adapter; official protected run |
| HLE | Question/image input only, response export, independent judge result import | NYX expert-answer/multimodal adapter; authorized independent judge |
| FrontierMath | Problem-only input, normalized external receipt, honest sample/variant distinction | Authorized protected tasks and variant-specific verifier/NYX integration |

Pinned upstream format sources are in `upstream-pins.json`; no official tasks were downloaded for contract development. Local inspection found no Docker command on this Windows host. This blocks local official container runs; it does not establish an inability to solve the tasks. Existing Windows Python aliases were not treated as proven runtimes.

SWE-bench cache reuse is keyed by run/instance, so every campaign/arm/task/attempt/artifact gets a unique run identity. Imported reports bind campaign, exact task, source version, artifact, attempt, evaluator version/source, environment and raw report digest. The receipt is `CALLER_ATTESTED_NOT_AUTHENTICATED`, not a signature or independent management-plane proof. FrontierMath's normalized receipt is explicitly **not** an invented Epoch official schema. Unsupported multi-step Harbor reports fail closed.

## Measurements and promotion

Four requested arm slots always remain in the population, including unavailable arms. Report first-attempt accepted, repaired accepted, final accepted, quality accepted/not evaluated, actual logical/physical calls, HTTP attempts, tokens and unknown usage, tool work, latency, retries and distinct failure classes. A missing verifier/environment/authority is not PASS, FAIL or a guessed cognitive score. Unreached hidden tests are not hidden-case reasoning failures.

Equivalent-tool controls must share exact model/configuration/authority/tool envelope. Raw model intentionally lacks equivalent tools and is reported separately. Matched realized compute requires complete usage, provider stability and prospectively frozen tolerance for calls/tokens/tool work (maximum 10%, default experimental choice may be zero); nominal equal budgets alone are insufficient. Replay correctness is not evidence of model quality. Functional SWE success is `quality=NOT_EVALUATED` until the existing independent engineering-quality oracle also executes. HLE official calibration is not replaced by our separately named binary Brier statistic.

Independent verifier consumption is recorded separately and included in realized-compute checks. An external judge without usage evidence leaves verifier usage unknown and prevents a full compute-match claim. The native ARC verifier's work unit is tested outputs, not CPU cycles or all hashing overhead. False acceptance remains unknown until a separate audit executes, not a fabricated zero.

No automatic broad promotion exists. Review requires fresh, non-contaminated task populations, independent evaluation, matched controls, replication and actual capability gains. The target of near-100% remains an aspiration, not a score inferred from architecture.
