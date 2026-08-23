# ORCHESTRA O6 Dossier — Evidence Harness

> Status: DELIVERED. Harness: `npx tsx scripts/orchestraO6.test.ts` → 28/28.
> Full regression at delivery: P0 19+55 · O0–O5 all green.
> GRAND TOTAL: 347 assertions, 0 failures · strict tsc clean.
> Zero existing files modified.

## Delivered

### `src/lib/codelab/orchestra/harness.ts`
The AI Playground's probe CONTRACT — the shape every browser-side probe
runtime (iframe injection, postMessage bridges) must emit when the UI
phases land:

- **Eight-probe vocabulary** (frozen): console · network · perf · fuzz ·
  visual · physics · a11y · api_contract — "every minor aspect" per
  blueprint §10, from console noise to physics energy drift.
- **Digest-signed Evidence Packs**: FNV-1a over canonical JSON;
  `verifyPack` gives certificate-grade tamper evidence; the ledger refuses
  forged packs at the door.
- **Honest metrics law**: NaN/Infinity rejected; declared budget with a
  MISSING metric FAILS (`metric_missing`) — absence of measurement is never
  success, matching Eyes' drift humility.
- **Frozen probe→channel map** (O5 contract #1): console/network/perf/
  physics → runtime; fuzz/visual/a11y → behavioral; api_contract →
  integration. ONE projection feeds `aggregateVerdict` AND the Delivery
  Gate — single source of truth proven end-to-end in tests.
- **Two semantics pinned during verification**:
  1. A channel reports `skipped` ONLY when nothing ran; skipped+pass ⇒ pass.
  2. A probe ERROR projects as channel FAIL — a crashed probe is
     demonstrable build breakage, not mere inconclusiveness.
  (Both were caught by the harness BEFORE shipping green — the Delivery
  Lock applied to our own work.)
- **Findings derivation** (O5 contract #2): failed probes become oversight
  findings with artifact refs valid BY CONSTRUCTION; error⇒urgent,
  fail⇒concern; passes stay silent (noise discipline).
- **Ledger**: idempotent-by-rejection dedupe, ring cap at published bound,
  newest-per-family query that returns null rather than guessing.

## Verification highlights
- End-to-end pipeline proven: pack → channel projection →
  aggregateVerdict(expectedChannels) ⇒ PASS on clean, FAIL on errored.
- Budget boundaries exact (minFps equality passes; heap over-limit reports
  measured value).
- Forged pack (status mutated post-signing) fails verifyPack and cannot
  enter the ledger.

## Contracts handed to O7 (Engine Kit)
1. Kit scenes MUST emit physics/perf/visual packs through this contract;
   determinism-replay and tunneling metrics land as `physics` probe keys.
2. CODE/3D/HYBRID mode selection gates which probes are REQUIRED for the
   delivery gate (3D mode demands physics+perf+visual; code mode does not).
3. Kit Parts compose into builds referenced by `buildRef` — packs are bound
   to exact build artifacts, never to families in the abstract.
