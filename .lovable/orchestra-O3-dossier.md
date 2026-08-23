# ORCHESTRA O3 Dossier — MiniAgent Protocol

> Status: DELIVERED. Harness: `npx tsx scripts/orchestraO3.test.ts` → 45/45.
> Full regression at delivery: O0 53/53 · O1 36/36 · O2 43/43 · P0 19/19 +
> 55/55 · strict tsc clean. Zero existing files modified.

## Delivered

### `src/lib/codelab/orchestra/mini.ts`
- **THE ONE-TIME LAW as state**: `MiniRegistry` is a pure event-sourced
  fold; a worker's second mini for the same `(workerId, taskUnitId)` is a
  counted rejection regardless of the mini id offered. Id collisions
  rejected independently.
- `deriveMiniIdentity()` implements O2 contract #1 — minis hold their
  creator's family slot, `roles:['mini']`, plus the creatorId link for
  dossier access.
- Retirement lifecycle (`proposal_filed | timeout | no_finding`); stale
  per-family epochs drop deterministically; fold associativity pinned.

### `src/lib/codelab/orchestra/policy.ts`
- **Admissibility**: `validateProposal` makes citations MANDATORY (blueprint
  §7/§9) — http(s) URLs or internal `artifact://` refs, claims bounded,
  confidence ∈ [0,1]. Uncited findings cannot enter the pipeline.
- **Up-chain contracts**: `ParentReport` (parent's own assessment before
  escalation) validated separately from the proposal — separation of duties
  between the mini's finding and the parent's judgment.
- **Scope-classified decisions** with exact conditional requirements:
  `reject` (record-only) / `private_worker` / `family` / `group_public`
  (fan-out ≤ transport frame bound) / `global_rule`.
- **`broadcastPolicy()`** routes verdicts through the O0 fabric:
  - global rules → `chan:public` on DEFAULT orchestrator grants (the
    owner's "rule for all agents" flow, proven delivered)
  - family-scoped doctrines REQUIRE the genesis dispatch grant — without it
    the attempt is audited with a typed `no_write_grant`, never silently
    dropped (O1 contract proven live)
  - fan-out message ids derive deterministically (`${decisionId}:${n}`) so
    replays reproduce identical audit trails
- **DoctrineBook**: accepted rules persist event-sourced; global rules ring-
  capped at a memory bound (not a swarm cap); family rules keyed per family.
  This book is what Genesis injects into every future charter — closing the
  owner's loop: mini idea → ADP → doctrine that outlives its family.

## Design decisions recorded
1. Private-worker delivery rides the FAMILY channel with artifact-scoped
   targeting — private channels are engraved MEMORY per blueprint §6, not
   delivery targets; nobody may write another agent's private log.
2. Decision digests (`decisionDigest`) bind verdicts to exact content for
   O4's ADP calibration records.

## Contracts handed to O4 (Adversarial Deliberation Protocol)
1. ADP consumes `(MiniProposal, ParentReport)` pairs only through these
   validators; uncited input never reaches a panel.
2. Panel verdicts MUST emit `PolicyDecision`s via `validateDecision` and
   route exclusively through `broadcastPolicy` — no side-channel policy.
3. Calibration records key on `decisionDigest`; dissents attach by
   `decisionId`.
4. Doctrine text published to the book is immutable post-publication
   (digest-pinned); corrections arrive as NEW decisions.
