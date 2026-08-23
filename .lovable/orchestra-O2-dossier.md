# ORCHESTRA O2 Dossier — Virtual Swarm & Capacity Planner

> Status: DELIVERED. Harness: `npx tsx scripts/orchestraO2.test.ts` → 43/43.
> Full regression at delivery: O0 53/53 · O1 36/36 · P0 protocol 19/19 ·
> P0 reducer 55/55 · strict tsc clean. Zero existing files modified.

## Delivered

### `src/lib/codelab/orchestra/capacity.ts`
- **Capacity Planner** implementing owner law §0a.1 (no ceilings): every
  parent/worker/lane number is derived from the workload profile of the
  plan itself.
- Demand model documented in the module header; integer-only math;
  deterministic; total validator with typed rejections.
- Linearity is a PINNED property: ×10 task units ⇒ exactly ×10 lane and
  worker demand on the harness fixture. A 50M-unit scenario plans
  proportionally without complaint (`workerCount === round(50M × 0.65)`).
- Rationale string (≤400 chars) records the derivation for Eyes audit.

### `src/lib/codelab/orchestra/swarm.ts`
- **Event-sourced family ledger**: `family_founded`, `spawn_batch`,
  `unit_completed`, `escalated`, `budget_burned`, `family_frozen`,
  `family_resumed`, `family_closed`.
- **THE CLONE PROOF** (pinned): spawning 30,000,000 logical workers is ONE
  ledger append — measured effectively instant; worker ids mint
  deterministically via `mintWorkerId(familyId, index)`. Identity ranges are
  contiguous by enforcement (gaps/duplicates rejected as counted events).
- **Genesis gate inside founding**: `foundFamily()` runs the O1 activation
  gate internally — no certificate or drifted charter ⇒ unfoundable. No
  bypass constructor exists.
- **Per-family epochs**: freeze/resume bump only the target family's
  generation; pre-freeze traffic stale-drops deterministically; sibling
  families unaffected. Double-freeze and skip-ahead freezes rejected.
- **Escalation ladder enforced structurally**: t1→t2→orchestrator only;
  skips are counted rejections.
- **Budget = visibility-only** (owner decision §0a.3): burn accumulates and
  exposes ratios; no cost wall ever blocks a family — quality is protected
  by the DELIVERY LOCK instead.
- **`scheduleWave` fairness kernel**: deterministic fair-share quantum
  round-robin over oldest-founded families. Pinned: smaller families are
  never starved (pending-1 family receives its unit alongside a 10k giant),
  frozen/closed families receive zero, lane capacities exact, identical
  inputs ⇒ identical assignment lists.
- Fold determinism + associativity pinned across every split point of the
  lifecycle corpus.

## Design decisions recorded
1. Batch-minted identity ranges over individual birth events — the only way
   "clone N times instantly" survives contact with an append-only log while
   staying fully replayable.
2. Fairness quantum `ceil(left / eligibleCount)` per rotation pass — fixed
   during development when the first greedy implementation could let family
   #1 drain a whole lane before family #2 was consulted (caught by the
   harness design review BEFORE it ever ran green falsely).
3. Founding is the single chokepoint for the activation gate; the event
   cannot be hand-constructed lawfully elsewhere.

## Contracts handed to O3 (MiniAgent Protocol)
1. Minis are spawned through the same `spawn_batch` machinery with
   count=1 against their creator's family; their identity comes from
   `mintWorkerId`.
2. Mini proposals travel ONLY via O0 router envelopes addressed to their
   creator's-parent family channel (`proposal` kind); the up-chain flow
   mini→parent→ADP→policy must be built on `attemptRecord` auditing.
3. Escalation events (`reason` tokens) should be reused by minis flagging
   stuck creators; ladder validity rules already reject skips.
4. All mini lifecycle events MUST carry the family's CURRENT epoch —
   post-freeze stragglers will drop exactly as pinned here.
