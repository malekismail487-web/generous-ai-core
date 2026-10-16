# Global benchmark acquisition — 2026-10-16

Base: `d2d2016cdc0a581c43296e037a0796b32a4db287`, branch
`sol/omega-institutional-spine`. Development goal remains **paused**. This is an
acquisition/preparation milestone, not a benchmark score or cognitive promotion.

## Outcome and boundaries

The missing public assets listed below were actually downloaded into the durable
cache, not merely catalogued. Important recovered gaps include ScienceAgentBench's
verified archive, PaperBench's real LFS data, MedXpertQA's images, BixBench's
capsules, the separate Omni-MATH rule evaluator and Omni-Judge weights, and the
FrontierMath Open Problems ZIP. No model inference or benchmark campaign was
launched. No account terms, paid access, cloud provisioning, production change,
NYX authority expansion, or goal resumption occurred.

The consolidated receipt rehashes **1,743 retained artifacts / 27,924,123,422
bytes** and binds 51 supporting receipts plus exact package/version inventories
for 14 isolated Python environments. This byte count includes retained archives,
data and judge weights; it is not a unique-question count, total installation
footprint, or claim that every requested dataset is present.

**Full acquisition is not complete.** The unresolved rows are real restrictions:
gated HF access, absent Kaggle authorization, private/paid verifiers, SciCode's
publisher-side download quota, insufficient capacity for BixBench3's full raw
inputs, and missing approved Linux/container execution. These have not been
relabelled as successful downloads or waived to produce green readiness labels.

Persistent cache on this machine:
`C:/Users/loka3/Documents/Codex/2026-08-20/h/benchmark-data`.
Nothing in this cache is automatically visible to a NYX task. Approved input
projections and oracle projections are in separate `evaluation-views/inputs`
and `evaluation-views/oracles` directories; directory segregation itself is
**not** an ACL or sandbox guarantee. Future executors must mount only the approved
input view, never the entire cache. Protected answers, grader models, historical
model outputs and gold programs are not training data or task context.

## Master inventory / readiness

`READY` below is scoped to retained data and the existing offline text-grading
path, not live provider health, NYX capability certification, or new authority.
`DATA READY` does not claim the full evaluator/runtime was exercised. Separate
variants and public/private populations remain distinct.

| # / benchmark | Official source | Dataset / assets | Expected / verified population | Data status | Grader status | Runtime status | Restriction / next action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01 FrontierMath Tiers 1–4 | [Epoch](https://epoch.ai/frontiermath/tiers-1-4/about) | [Public examples](https://epoch.ai/frontiermath/tiers-1-4/benchmark-problems) | 12 public examples retained; not the private benchmark | Public page and linked supporting PDFs acquired | Private official evaluation | Not installed for private evaluation | **PRIVATE** full benchmark; operator may send the inquiry below |
| 02 FrontierMath Open Problems | [Catalog](https://epoch.ai/frontiermath/open-problems) | [Official ZIP](https://epoch.ai/data/open_problems_data.zip) | 49 unique problem IDs; 50 prompt variants, all joined to metadata | Public ZIP complete; published update Oct. 7, 2026; structured local catalog built | Paid/private solution verifiers not acquired | Public data readable | **DATA READY**; verifier access is a separate **PAID PREREQUISITE** |
| 03 MATH-500 | [Dataset](https://huggingface.co/datasets/HuggingFaceH4/MATH-500) | Same, revision `6e4ed1a2a79af7d8630a6b768ec859cb5af4d3be` | 500 / 500 | Complete, rehashed; inputs/oracles separated | Mathematical equivalence development checks 6/6; exact rational, symbolic and unit checks pass | Isolated Python environment installed; arbitrary model-expression sandbox admission not claimed | **DATA READY**; use an approved confined grader execution profile |
| 04 AIME 2026 | [MathArena](https://matharena.ai/) | [Canonical](https://huggingface.co/datasets/MathArena/aime_2026), [supplement](https://huggingface.co/datasets/96kevinli29/aime2026-en) | Preserved 30 / 30; supplemental statements match 30/30, zero reference disagreements | Canonical population unchanged | Existing strict integer grader; text benchmark suite 238/238 | Existing Node path available | **READY** offline; live delivery not retested |
| 05 Additional AIME | [MathArena source](https://github.com/eth-sri/matharena) | [2025](https://huggingface.co/datasets/MathArena/aime_2025), [2024 II](https://huggingface.co/datasets/MathArena/aime_2024_II) | 30 + 15 / 30 + 15 required records; additional year/part files retained separately | Complete public files | Existing strict integer checks preserved | Existing text-grading path | **READY** for these named populations; combined and part datasets are not summed as unique questions |
| 06 MathArena | [Repository](https://github.com/eth-sri/matharena) | [Author datasets](https://huggingface.co/MathArena) | 56 non-output/non-training dataset repositories; 186 files verified | Public acquisition complete for the observed catalog | Author parser/grader source retained | Scoped package installed; full declared inference stack fails on missing native/CUDA build prerequisites | **DATA READY**; approved compatible Linux/build environment for full author stack |
| 07 Omni-MATH | [Repository](https://github.com/KbsdJames/Omni-MATH) | [4428 dataset](https://huggingface.co/datasets/KbsdJames/Omni-MATH), [rule evaluator](https://github.com/KbsdJames/omni-math-rule), [Omni-Judge](https://huggingface.co/KbsdJames/Omni-Judge) | 4,428 / 4,428; rule subset separately 2,821 | Complete questions and rule sources; four judge weight shards acquired | Author rule development cases 3/3; judge index agrees with 291 tensors / 16,060,522,496 tensor bytes | Author-vendored parser installed; judge inference not run | **DATA READY**; rule subset is not full-set grading; configure a permitted independent judge runtime |
| 08 miniF2F | [Original](https://github.com/openai/miniF2F), [maintained](https://github.com/facebookresearch/minif2f) | Pinned originals plus separately retained Lean 4 port | Original 488-task split identity preserved; raw theorem counts include helper declarations and are not a task count | Statements, matching dependency sources and versioned toolchains acquired | Formal-kernel development proof acceptance/rejection demonstrated on Lean 3.42.1 and Lean 4.9.0-rc1 | Full Mathlib/project compilation and confined untrusted-proof execution not demonstrated | **DATA READY**; complete the approved formal execution environment, do not mix ports |
| 09 ProofNet | [Original](https://github.com/zhangir-azerbayev/ProofNet), [Lean 4](https://github.com/rahul3613/ProofNet-lean4), [audited variant](https://github.com/marcusm117/ProofNet-Verified) | [Original HF](https://huggingface.co/datasets/hoskinson-center/proofnet) plus distinct source ports | Original 185 valid + 186 test / all 371; port source inventories retained separately | Complete original data and requested port sources | Lean 3.50.3 development kernel checks pass; not a proof score | Lean 4.20.0 loader blocked by Code Integrity; later new binaries deferred pending host policy review | **DATA READY**; approved Linux/formal environment; variant equivalence not assumed |
| 10 PutnamBench | [Repository](https://github.com/trishullab/PutnamBench) | Frozen author source | Lean 672, Isabelle 640, Coq 412 / file counts match the author's respective populations | All public source formats acquired | Independent benchmark proof checking not yet admitted | Lean 4.33.1 and dependency sources downloaded; full project runtime unverified | **DATA READY**; prioritize confined Lean path; Coq/Isabelle remain separate configurations |
| 11 FrontierScience | [Official data](https://huggingface.co/datasets/openai/frontierscience) | Same | 160 / 100 Olympiad + 60 research | Complete public release; groups and references separated | Official methodology retained; full independent answer-judging path not exercised | Data/scientific libraries available | **DATA READY**, not the unreleased private evaluation |
| 12 SciCode | [Repository](https://github.com/scicode-bench/SciCode) | [Dataset](https://huggingface.co/datasets/SciCode1/SciCode), [author numeric assets](https://drive.google.com/drive/folders/1W5GZW6_bdiDAiipuFMqdUhvUaHIj6-pR) | 15 dev + 65 test main problems present; subproblems remain nested, not conflated | Public question files complete; `test_data.h5` NOT acquired | Author package installed | Numerical dependencies installed; full code execution needs confinement | **PARTIAL**: normal public download reaches Google Drive quota-exceeded page; wait for quota reset or obtain an author-approved mirror |
| 13 DiscoveryBench | [Repository](https://github.com/allenai/discoverybench) | [Author HF](https://huggingface.co/datasets/allenai/discoverybench) plus full source tree | Real: 239 test + 25 train questions; synthetic: 200 test + 153 dev + 550 train | All actual task-relative dataset paths resolve; one editor-checkpoint reference separately excluded | Official evaluation tools retained; no model judge invoked | Author-pinned Python dependencies installed; agent code execution requires confinement | **DATA READY**; 80 non-UTF8 source metadata files explicitly decoded losslessly as CP1252, raw bytes preserved |
| 14 ScienceAgentBench | [Repository](https://github.com/OSU-NLP-Group/ScienceAgentBench) | [Verified split](https://huggingface.co/datasets/osunlp/ScienceAgentBench) and author's normal download link | 102 / 102; all named gold/evaluator files resolve | Verified archive recovered: 1,769,478,786 bytes compressed; 4,071,815,117 expanded; 845 files independently checked | Official evaluator/gold assets present, no benchmark programs executed | Linux/container execution still required | **DATA READY**; old access failure is superseded by this successful observation, not erased |
| 15 GPQA Diamond | [Author](https://github.com/idavidrein/gpqa) | Existing pinned author-derived preparation; [HF](https://huggingface.co/datasets/Idavidrein/gpqa) is not silently substituted | 198 / 198 unique IDs, seed 0 and exact prepared digest unchanged | Reused and verified, no re-acquisition | Existing strict A–D grading; 238/238 text-suite checks | Existing Node path available | **READY** offline; all original Super/Ultra outcomes preserved |
| 16 BixBench | [Repository](https://github.com/Future-House/BixBench) | [Official HF](https://huggingface.co/datasets/futurehouse/BixBench) | 205 / 205 question records; 64 published capsule ZIPs | All public repository assets acquired; all 64 ZIP CRCs pass; 5,909,709,385 compressed bytes | Author runner and grader source retained | Dedicated Python package installed; container execution not available locally | **DATA READY**; capsule count is not question count or a score |
| 17 BixBench3 | [Repository](https://github.com/EdisonScientific/BixBench3) | [Gated HF](https://huggingface.co/datasets/EdisonScientific/BixBench3); published GCS release v1.0.0 | 20 task identities inventoried; gated prompt records not acquired | Public input metadata: 42 files; public grading objects: 158 files / 208,642,218 bytes. Complete raw inputs NOT acquired | Public deterministic grader installed; CLI help works | Google Cloud SDK 589.0.0 installed/checked without authentication or resource creation | **NEEDS AUTHORIZATION**; raw input inventory is 1,397,767,614,312 bytes, exceeding local free space; see checklist for storage, HF and optional GCP/licenses |
| 18 PaperBench | [Repository / install](https://github.com/openai/frontier-evals/tree/main/project/paperbench) | `project/paperbench/data/**` Git LFS | All 20 official `all.txt` papers present, plus 3 supplementary directories | 441/441 scoped LFS files hydrated and SHA256 matched; 535,358,201 bytes; pinned RICE judge-eval reference tar also prepared | Independent grader code and judge-eval assets present; no judge inference | Package/dependencies installed; actual reproducer requires Linux/Docker; some paper-specific data/models require separate access | **PARTIAL** overall execution; public paper/rubric acquisition is complete, not every reproduction workload |
| 19 RE-Bench | [Repository](https://github.com/METR/RE-Bench) | Frozen author task suite | Seven task families retained | Public source/protected assets retained without publishing or unprotecting solutions | Official grader source retained | GPU/container/task-specific dependencies not operational on this host | **PARTIAL**; approved compatible runtime and author usage/privacy conditions before evaluation |
| 20 MLE-bench | [Repository](https://github.com/openai/mle-bench) | [Official acquisition documentation](https://github.com/openai/mle-bench#dataset) | 75 competitions and 22 Lite verified; competition datasets NOT downloaded | Source plus 82 required competition LFS files / 5,521,616 bytes; all checksums/graders inventoried | `mlebench` 1.0.0 installed; prepare help works | Dedicated 131-dependency environment installed | **NEEDS AUTHORIZATION**: no Kaggle session; per-competition rules/eligibility needed. No `prepare --all`, no submissions |
| 21 SciBench | [Repository](https://github.com/mandyyyyii/scibench) | Original files and [author-linked HF](https://huggingface.co/datasets/xw27/scibench) | Retained revision: 580 main records across 10 textbook groups, 112 separate solution/example records; 354 image files | Complete acquired source/data snapshot; groups not blindly summed as disjoint questions | Author numerical protocol uses 5% relative tolerance and supplied-unit handling; not replaced by a new score oracle | Numerical/symbolic/unit libraries installed; full model execution not exercised | **DATA READY**; text and image scopes remain explicit |
| 22 SciEval | [Repository](https://github.com/OpenDFM/SciEval) | Official dev/valid/test and dynamic files | 70 dev, 1,441 valid, 13,011 test; separate 2,000 chemistry / 890 physics dynamic records verified | Complete public files; test and test-local not double counted | Author evaluator passes 12 authored development cases; original parsing semantics unchanged | Standard Python path available | **READY** for scoped offline author grading; no NYX benchmark score claimed |
| 23 ChemBench | [Repository/docs](https://lamalab-org.github.io/chembench/) | [Official HF](https://huggingface.co/datasets/jablonkagroup/ChemBench) | 2,785 records / nine categories | Complete public HF snapshot and full pinned author source; not MaCBench | Author metrics tests 5/5 | `chembench` 0.3.0 installed in its own environment; live NYX adapter not exercised | **DATA READY**; separate dataset/package identity and end-to-end adapter admission |
| 24 MedXpertQA | [Repository](https://github.com/TsinghuaC3I/MedXpertQA) | [Official HF](https://huggingface.co/datasets/TsinghuaC3I/MedXpertQA) | Text 2,450 test + 5 dev; MM 2,000 test + 5 dev | All 2,858 referenced images extracted and decoded successfully | Author MCQ parser checked on valid/malformed development outputs | Published dependencies and NLTK assets installed; NYX multimodal path not demonstrated | **DATA READY** overall; do not label a text-only run multimodal |
| 25 CritPt | [Repository/site](https://critpt.com/) | [Official HF](https://huggingface.co/datasets/CritPt-Benchmark/CritPt) | 70 / 70 public records | Complete public questions/source | Official submission classes round-trip 70 synthetic items offline; no grading quota consumed | Dependencies installed; interpreter declaration handled separately from pip packages | **DATA READY**; full grading needs authorized [remote service](https://artificialanalysis.ai/documentation#critpt-api), complete 70-item batches and its current quota/pricing |
| 26 HLE | [Repository](https://github.com/centerforaisafety/hle) | [Gated official dataset](https://huggingface.co/datasets/cais/hle) | 2,500 expected; gated population/media not acquired | Gate respected; source/harness retained | Published judging dependencies installed | Dedicated environment installed, no judge called | **NEEDS AUTHORIZATION**; approved HF account/session required, evaluation-only/no redistribution constraints retained |
| 27 FrontierMath Erdős | [Project](https://epoch.ai/benchmarks/frontiermath-erdos), [author scaffold](https://github.com/epoch-research/LeanOpenProblems) | Pinned source, both required FormalConjectures revisions, Comparator, lean4export and Landrun sources | Canonical Bloom selection 50 + 18 = 68; unfiltered 147-record source is NOT substituted for it | Required public formal sources/scaffold acquired separately from other FrontierMath families | Independent comparator/exporter source pins retained; no benchmark proofs run | Python 3.13.15 / `apn` environment installed; Linux/Landlock/container checker not built | **DATA READY**; approved compatible isolated formal runtime needed |

## Verified retained assets and failures repaired during preparation

- FrontierMath Open Problems ZIP SHA256:
  `fa9bb3b8a155fa6bd55619b10ac4e12974e53f3427cad9e922fa402605380678`.
  All prompt IDs match metadata IDs; 10 solved and 39 unsolved records remain
  distinguishable. Published changelog/status metadata is not a verifier.
- ScienceAgentBench archive SHA256:
  `46e715d3b2196d459d2dff52aa487f506a95ec44b44262e82208d086ea879610`.
  Its normal `download=1` option works; no account bypass or alternate credential
  was used. Author-published passphrase was handled in memory/stdin, not source,
  command-line arguments or receipts. Gold programs remain outside NYX context.
- MedXpertQA images ZIP SHA256:
  `ca5d539b9ee18861cc73cf1dc249916e3989de6810130ed68975b43809e25500`.
  Every image reference resolves and all 2,858 unique referenced images decode.
- All 205 BixBench question records resolve to acquired capsule archives; their
  59 referenced capsule identities remain distinct from the 64 published ZIPs.
- PaperBench's initial partial clone caused thousands of avoidable small promisor
  fetches. Restored 3,274 exact Git blobs from the already verified source archive,
  checking every byte against HEAD's Git blob identity, without changing author
  commits or index. Then completed normal LFS fetch/checkout and verified all 441
  file hashes. No arbitrary-descendant or README-only completeness assumption.
- Recovered Omni-MATH's **separate** rule repository from the official project
  page. Corrected its environment to use the author's vendored ANTLR-compatible
  `latex2sympy2` 1.9.0, rather than the incompatible PyPI selection. Did not alter
  the evaluator's answer-acceptance rules or pretend its 2,821 subset is 4,428.
- `math-verify`'s internal Windows multiprocessing timeout was not functional in
  this environment. Fixed development checks use strict equivalence unchanged
  inside an outer 10-second subprocess bound. This does not admit arbitrary
  model expressions to an unrestricted host parser.
- Correctly distinguished decoded HTTP gzip bytes from wire `Content-Length`
  while preparing Google Cloud SDK. Preserved and CRC-verified the already
  downloaded ZIP instead of fetching it twice. Two non-runtime test-directory
  aliases stay in the verified ZIP rather than creating host links. SDK version
  commands succeed; no login, billing change, VM, disk, or cloud job was created.
- Archive handling rejects traversal, case-colliding entries, host reparse
  targets, unsupported aliases, mismatched existing files, bad resumes and
  incorrect expected hashes. Reviewed internal **file** aliases can be copied
  with identical target content and an explicit manifest entry; no host symlink
  is created. All original archives remain preserved.
- Lean 3.42.1, 3.50.3 and 4.9.0-rc1 accept an authored valid proof and reject an
  authored invalid proof. Lean 4.20.0 is genuinely host-policy blocked:
  `libleanshared.dll`, Code Integrity events 3033/3077,
  `VerifiedAndReputableDesktop`, status `0xC0E90002`. A 4.28 version probe also
  timed out. Further affected-host probing is deferred, not represented as a
  failed proof or a successful kernel check. Windows Security is unchanged.
- Full MathArena package installation was actually attempted: after fixing
  transient download contention/timeouts, its inference dependency `tilelang`
  could not build without native compiler/CUDA prerequisites. Scoped package and
  mathematical dependencies are installed; full runtime readiness is **not**
  claimed. A loader failure is never counted as rejection of an invalid proof.

## Human action checklist — only actions Codex cannot legitimately perform

1. **HF gates:** visit [HLE](https://huggingface.co/datasets/cais/hle) and
   [BixBench3](https://huggingface.co/datasets/EdisonScientific/BixBench3), review
   their conditions and obtain access using an eligible authorized account.
   Then configure the supported `hf auth login` session locally; do not paste
   tokens into chat. No authorized HF session was configured here. The gate
   pages did not publish a purchase price; do not assume payment grants access.
   HF's [account terms](https://huggingface.co/terms-of-service) specify a natural
   person age 13+ or an authorized registered legal entity. Dataset-specific
   conditions remain additional requirements.
2. **Kaggle:** configure an authorized account/API credential using the
   [official API instructions](https://github.com/Kaggle/kaggle-api#api-credentials),
   and individually review/accept only the competitions you intend to acquire.
   The per-competition URLs are in `mlebench-competition-inventory.json` in the
   cache. [Kaggle minor-consent rules](https://www.kaggle.com/consent-minors-process)
   require eligible competitions and parent/guardian consent where applicable;
   account-use consent and competition consent are separate. No rules were
   accepted here. Author storage estimates: Lite ~158 GB, full ~3.3 TB. Full
   `prepare --all` still needs your explicit authorization. Data access does not
   imply permission to submit to live competitions. Current fees/eligibility
   must be checked for the chosen competitions, not assumed globally free.
3. **Approved execution environment:** provide/approve a Linux/Docker runner
   suitable for confined scientific code and formal proof checking. This Windows
   host has no Docker executable and WSL is not installed. Keep host security
   enabled; use an approved compatible environment or have the actual blocked
   DLL reviewed through normal administrator/vendor policy. Do not disable
   Windows Security to make a readiness check pass. Formal project/Mathlib builds,
   supported container images and task-specific dependencies still need execution
   there. GPU/large-memory workloads require appropriate hardware or separately
   approved compute costs; nothing was rented here.
4. **BixBench3 storage / optional cloud execution:** supply sufficient durable
   storage for the **1.40 TB raw input inventory plus working space** (a suitably
   provisioned 2 TB-or-larger destination is appropriate), or explicitly select a
   staged subset. The machine had ~752 GB free at campaign start, so the full
   release cannot fit. The published GCS inputs and grading objects are public;
   they are not falsely called private. For the author's cloud runner, separately
   authorize a GCP billing-enabled project, Compute Engine access and the stated
   `n2-standard-32` quota, and personally review the required
   [Cell Ranger](https://www.10xgenomics.com/support/software/cell-ranger/downloads/previous-versions)
   and [Cell Ranger ARC](https://www.10xgenomics.com/support/software/cell-ranger-arc/downloads/previous-versions)
   licenses. [GCP terms](https://cloud.google.com/terms) and current regional
   usage prices apply; no fixed execution price is established by this receipt.
5. **SciCode numeric assets:** wait for the author's Google Drive quota to reset,
   or authorize contacting the maintainers for an accessible official mirror of
   `test_data.h5`. The normal public confirmation flow was followed and reported
   quota exceeded. No permission bypass, account-copy workaround or unreviewed
   third-party answer mirror was attempted. An unsent draft is below.
6. **External verifiers:** if desired, authorize sending the Epoch inquiries
   below and obtaining [CritPt service](https://artificialanalysis.ai/documentation#critpt-api)
   access. Exact eligibility, quotas and any prices remain author/service
   controlled. Do not pay or submit solutions until separately approved.
7. **Conditional reproduction resources:** selected PaperBench/RE-Bench tasks
   may require ImageNet, Llama-family model access, compatible GPUs or other
   upstream resources. Review the selected task's own conditions first; public
   paper/rubric acquisition is not a blanket grant to all underlying resources.

## Unsent author-contact packet

No messages have been sent. No purchase, agreement or account creation occurred.

### Epoch — FrontierMath Tiers 1–4

To: `math_evals@epoch.ai` (published evaluation contact)

Subject: Independent NYX evaluation on FrontierMath Tiers 1–4

Hello Epoch AI team,

We are preparing a reproducible, independently graded evaluation of NYX, a
research engineering system. We have retained the public examples separately
and are not claiming possession of your private benchmark. Could you advise on
eligibility, supported solver interfaces/tool permissions, current benchmark
versions, submission and reporting requirements, confidentiality/anti-contamination
conditions, and any evaluation costs? We would seek explicit approval before
any paid service or solution submission.

Regards,
Malek / NYX project

### Epoch — Open Problems verifiers

To: `math@epoch.ai`

Subject: FrontierMath Open Problems — independent verifier access inquiry

Hello Epoch AI team,

We have acquired your public Open Problems data release, currently published as
updated October 7, 2026, while keeping it distinct from the solution verifiers.
Could you provide current verifier pricing, eligibility, supported submission
formats, independent evaluation options, resource limits, acceptable tool use,
reporting requirements and anti-contamination obligations? We have not submitted
solutions or authorized a purchase.

Regards,
Malek / NYX project

### SciCode — temporary public numeric-asset quota

To: SciCode maintainers, via the contact route they choose on the
[official project](https://github.com/scicode-bench/SciCode) (no unverified email
address is invented).

Subject: Authorized alternate download for SciCode numeric test data

Hello SciCode team,

We have retained your public dataset and installed the published evaluation
package in an isolated environment. The README-linked Google Drive folder is
visible, but the normal download for `test_data.h5` reports quota exceeded.
Could you provide an accessible official mirror, a recommended retry schedule,
and a published checksum/version identifying the numeric data compatible with
the released dev/test splits? We will preserve the benchmark's split and grading
semantics and will not redistribute protected evaluation material.

Regards,
Malek / NYX project

### ScienceAgentBench

No access-recovery email is currently necessary: the author's published link
worked through its normal download option, and the verified archive was acquired,
decrypted and checked locally. Preserve the earlier failure receipt as historical
evidence rather than sending an obsolete claim that the archive is inaccessible.

## Reproduction / retained receipts

The committed JSON receipt indexes the cache's per-file manifests, source pins,
declared licenses, actual file sizes/digests, environment distributions, and
development-check outputs. The large manifests, data, model weights, PDFs and
protected files stay outside Git. They are durable on this machine, not assumed
to survive merely because a CI job once downloaded them.

Utilities in `scripts/omega/benchmarks/`:

- `acquire-global-assets.py`: supported anonymous HF acquisition, bounded/resumable
  public downloads, fixity checks, safe extraction and exact cached Git-blob reuse.
- `check-global-assets.py`: population/media/canonical GPQA checks, supplemental
  AIME provenance comparison and narrowly whitelisted input/oracle projections.
- `prepare-scienceagent-assets.py`: authorized verified-archive extraction,
  independent CRC/SHA256 and 102-task reference checks; no benchmark code runs.
- `grade-global-development.py`: fixed synthetic mathematical fixtures in bounded
  subprocesses; not arbitrary model-code execution admission.
- `check-formal-runtimes.py`: synthetic valid/invalid proofs, with host launch
  blocks distinguished from proof rejection and known policy blocks not retried.
- `test_global_acquisition.py`: development-only path, alias, reuse, length,
  decoded-transport and resume integrity tests; no benchmark questions.
- `build-global-acquisition-receipt.py`: rehashes retained acquisitions, binds
  supporting receipts and exact environment versions, and records unresolved
  authorization/runtime/storage prerequisites without promoting capability.

No full-project TypeScript baseline was raised. TypeScript remains 5.8.3 with
baseline/current/new diagnostics `0/0/0`. Existing NYX text checks pass 238/238;
acquisition tests pass 15/15. No benchmark threshold or acceptance oracle was
weakened. Unrelated eight-file UI work is preserved and excluded from this change.

## Remaining work / plan coverage

Codex can continue the blocked acquisitions after the exact prerequisite changes:
approved HF/Kaggle sessions, an accessible author SciCode asset, sufficient storage,
and an approved compatible execution environment. It cannot obtain a private
benchmark, accept account/license terms, invent eligibility, purchase verifier
access, disable host security or provision billable resources on its own.

Directly implemented principles: evidence over confidence; reality over prediction;
source/runtime/grader/score separation; scope/provenance; no self-certification;
blocked is distinct from failed or passed; no authority increase from research.
Supporting: frozen populations, preserved first-attempt results, independent
verification and reference isolation. Deferred: new model evaluations, capability
promotion, architectural changes, recursion, production integration and SEC-003.
No architectural conflict was resolved by weakening an existing boundary.
Coverage remains **PARTIAL / JUST-IN-TIME**; total Ω corpus coverage is not claimed.
