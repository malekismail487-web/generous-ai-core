# CodeLab → Agentic Coding Engine — Master Plan (v2)

> Status: Phase 0 IN PROGRESS. This revision supersedes v1 and incorporates
> six architectural directives from the product owner (Malek), restated in
> §1. Nothing in this file is generated at runtime; it is the human-facing
> contract that `src/lib/codelab/**` and its test harnesses implement.

---

## 0. Mission

Transform CodeLab from a one-shot code generator ("dump files → pray for
fenced blocks → apply") into an **agentic coding engine**: a system that

```
RECON ─→ mutable PLAN ─→ ACT ─→ OBSERVE ─→ RE-PLAN ─→ VERIFY ─→ DONE
   ↑                                                        │
   └────────────── failure diagnosis feeds back ─────────────┘
```

…using the same structural skeleton as frontier coding agents: **model +
tools + loop + context manager + independent verifier**, engineered to run
entirely on Lumina's existing stack (Lovable AI gateway, Supabase edge
functions, Monaco, sandboxed iframe preview).

---

## 1. Architectural directives (binding)

1. **Adaptive lifecycle, not rigid planning.** The agent performs *recon*
   (reads project state via tools) *before* committing to a plan; the plan
   is mutable and evolves through explicit `plan_update` events as work
   progresses and new information is discovered.
2. **First-class `plan_update` and `verification` events** exist in the
   event protocol from day one — they are not UI-side effects or implied
   state.
3. **The verifier is an architecturally independent component** even while
   actor and verifier are initially backed by the same model. The verifier
   consumes only `(original goal, resulting diff, evidence)` through an
   explicit input contract (`src/lib/codelab/verifier/`); it never reads
   actor internals, scratch state, or rationale events.
4. **No raw chain-of-thought is exposed or persisted.** Model reasoning
   surfaces only as bounded, structured `status` events with a fixed phase
   vocabulary (`recon`, `planning`, `editing`, `running`, `verifying`,
   `failure_diagnosed`, …) plus a concise rationale string. Non-frame model
   output is discarded at the transport layer (counted, never stored).
5. **Verification is broader than console errors.** Six channels, each an
   explicit evidence record: `syntax`, `types`, `unit`, `integration`,
   `runtime` (preview/console), `behavioral` assertions, plus the final
   `goal`-vs-result assessment performed by the verifier.
6. **Everything is event-sourced, deterministic where possible, replayable,
   abortable, and independently testable** — same discipline as LSE
   (`lse/*`): pure reducers, frozen collections, monotonic versions,
   injectable clocks/id factories, self-contained `scripts/*.test.ts`
   harnesses.

---

## 2. Event protocol (v2 vocabulary)

Single append-only log per session. Every event carries
`(seq, epoch)`; `seq` assigned by the session loop in canonical order,
`epoch` identifies the abort generation (see §4).

| Event kind      | Purpose | Key fields |
|---|---|---|
| `goal_set`     | Session opens with the student's goal | `goal`, `acceptance?` |
| `status`       | Bounded progress/rationale signal (no CoT) | `phase`, `rationale ≤ LIMITS.rationaleMaxChars` |
| `plan_update`  | Mutable plan evolution | `ops[]`: replace / add_step / remove_step / set_status / reorder |
| `tool_call`    | Agent requests a tool execution | `callId`, `tool`, `argsJson` |
| `tool_result`  | Structured observation returned to the loop | `callId`, `ok`, `summary`, `resultJson?` |
| `file_delta`   | Materialized change to the virtual FS | `path`, `op(write/delete)`, `contentAfter?` |
| `verification` | One verifier run's verdict + per-channel evidence | `runId`, `verdict(pass/fail/inconclusive)`, `channels[]` |
| `error`        | Recoverable fault surfaced to the log | `scope`, `message` |
| `done`         | Actor declares completion | `summary` |
| `aborted`      | Epoch bump; invalidates stale events | `newEpoch = epoch+1`, `reason` |

Transport format: sentinel-delimited JSON frames
(`@@AGENT_FRAME@@ {json} @@/AGENT_FRAME@@`) streamed by the edge function;
parsed incrementally by a total, non-throwing parser
(`src/lib/codelab/agent/protocol.ts`). Prose outside frames is discarded
(directive 4).

---

## 3. Verifier independence (directive 3)

```
src/lib/codelab/
  agent/       ← actor world: loop, tools, plan state
  verifier/    ← independent world: contracts only
    types.ts   ← VerifierInput / VerifierOutput / ChannelEvidence
                 aggregateVerdict(evidence)  (pure)
                 buildVerifierInput(state)   (pure projection from session state)
```

Contract: `evaluate(input: VerifierInput): Promise<VerifierOutput>`.

* Input = `(sessionId, goal, diff summary, evidence[])`. Nothing else.
* In later phases the same gateway model may power both roles, but calls,
  prompts, budgets, and state slices remain separate so the verifier can be
  swapped (stronger model, deterministic checker suite, human review)
  without touching the actor.
* The reducer holds verification state in an isolated slice
  (`state.verification`) mutated only by `verification` events; actor fields
  are untouched by them and vice versa. Slice independence is asserted by
  tests.

---

## 4. Abortability & epochs

* `initialState(sessionId, epoch = 0)`.
* Events with `epoch < state.epoch` are **stale**: counted, otherwise
  ignored (deterministic drop — replay-safe under post-abort races).
* `aborted` requires `newEpoch === state.epoch + 1`; bumps the generation.
  The loop controller reads `state.epoch` and discards in-flight results
  from superseded generations.
* Malformed-but-well-typed events (bad abort payload, unknown plan step in
  ops, seq gaps) are **counted as rejected**, never thrown mid-replay —
  mirrors the "malformed frame must not tear down the subscription" rule
  from LSE A5. Cross-session ids throw (same as LSE lessonId guard).

---

## 5. Verification matrix (directive 5)

| Channel | Source (phase) | Evidence shape |
|---|---|---|
| `syntax` | Worker-based JS/TS parse check (P4) | status + first error |
| `types` | TS transpile diagnostics (P4) | status + diagnostics list |
| `unit` | `*.test.js` convention files run in sandbox worker (P4) | pass/fail counts |
| `integration` | Multi-file runtime scenario scripts (P5) | pass/fail counts |
| `runtime` | Preview iframe console/error postMessage bridge (P1/P4) | error list |
| `behavioral` | Declarative assertions authored by agent/student (P5) | assertion results |
| `goal` | Verifier model call vs goal+diff+all-evidence (P4) | verdict + bounded assessment |

A `verification` event without all applicable channels may carry
`skipped` channel statuses — the aggregator treats missing coverage as
`inconclusive`, never silently `pass`.

---

## 6. Delivery phases

| Phase | Scope | Status |
|---|---|---|
| **P0** | Event types, streaming protocol parser, pure reducer, verifier contracts, deterministic harnesses | **IN PROGRESS** |
| P1 | Tool system: fs tools, `run_js` worker, preview console bridge; loop controller wiring `codelab-agent` edge fn | pending |
| P2 | Budgets & cost guard (step/token caps, `check_and_increment_cost`), stop/resume UX plumbing | pending |
| P3 | Planner surface: live checklist UI, recon-before-plan enforcement | pending |
| P4 | Verification implementation: channels `syntax/types/unit/runtime/goal`; retry-with-diagnosis policy | pending |
| P5 | Context management: project map, progressive disclosure, history compaction; integration/behavioral channels | pending |
| P6 | Agent Console UX: timeline, inline diffs, budget meters, session persistence | pending |
| P7 | Lumina differentiators: adaptive params injection, Build vs Teach mode, effort tiers, BYOK | pending |
| P8 | Governance: approval modes, rate limits, audit trail, content scan hook | pending |

Each phase lands with its own `scripts/codelabAgent*.test.ts` harnesses and,
where applicable, a `.lovable/codelab-agent-P<n>-dossier.md`.

---

## 7. Phase 0 scope (this delivery)

Files added:

```
src/lib/codelab/agent/types.ts      — event/state vocabulary + limits + guards
src/lib/codelab/agent/protocol.ts   — frame serializer + incremental parser (total, bounded)
src/lib/codelab/agent/reducer.ts    — initialState/reduce/fold/foldFrom/statesEqual/isStale
src/lib/codelab/verifier/types.ts   — VerifierInput/Output, aggregateVerdict, buildVerifierInput
scripts/codelabAgentProtocol.test.ts
scripts/codelabAgentReducer.test.ts
```

Guarantees pinned by harnesses:

1. Protocol round-trip determinism; frame recovery at **every byte-split
   offset** of a multi-frame stream; prose contamination discarded and
   counted; malformed/oversize frames rejected without parser death.
2. Reducer purity (frozen inputs survive), fold determinism, associativity
   across every split point, per-kind semantics (plan ops, file deltas,
   verification slice isolation), epoch/stale-event semantics, timeline
   ring bounds, cross-session guard.

Non-goals for P0 (explicitly deferred): concrete tool implementations, any
network/model calls, React/UI, persistence, prompt construction.

---

## 8. Contracts Phase 1 must respect (decided now)

1. Tools are named by plain strings with JSON-string args (`argsJson`);
   the registry lives in Phase 1 but validation helpers already exported
   from `protocol.ts`.
2. The loop assigns `seq` and `epoch`; producers never do. Draft events
   from the parser carry neither.
3. `file_delta` events are the *only* sanctioned record of FS mutation;
   tool results reference paths but never embed full file bodies beyond
   `LIMITS.resultJsonMaxBytes`.
4. Verifier input is built exclusively via `buildVerifierInput()`; no other
   module may read `state.verification` except UI projections.
5. All new modules stay browser/edge/node-safe: no `Date.now()`,
   no `Math.random`, no I/O inside `lib/codelab/**` pure layers.
