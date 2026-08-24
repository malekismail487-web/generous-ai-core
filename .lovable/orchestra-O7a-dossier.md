# ORCHESTRA O7a Dossier — Engine Core, the Eyes, and First Light

> Status: DELIVERED (O7a + perception remaster of O6).
> Regression at delivery: **385 assertions / 0 failures across 11 harnesses**;
> strict tsc clean. Live scene verdict: **PASS on all six perception
> channels** (`evidence/o7/attempt-3.perception.json`).

## What exists now (all real, all on this machine)

### Pure cores (`src/lib/codelab/engine/`)
- `rng.ts` — seeded integer-only PRNG (xmur3+mulberry32). Rapier's
  determinism doc warns Math.sin-class functions break cross-platform
  replay; all generated worlds seed through here.
- `linter.ts` — static pre-run gate R1–R5 (no Math.random/Date, physics
  timestep marker, color pipeline pinned, camera frustum sanity).
- `loopKernel.ts` — Closed Loop state machine with owner law §4.5:
  repair budget → RECOVERING (never exit); honest exit structurally
  impossible without a tested hypothesis in a real recovery round.
- `perception.ts` — THE WORKERS' EYES (pure half): frozen thresholds +
  judges for motion/palette/edges/physics/audio/playtest. Rate-based loop
  liveness (fps, environment-robust); palette diagnosis ordered
  dark/blown→degenerate; physics = replay-hash equality + spurious-energy
  gain + tunneling.

### O6 remaster (institution pass, first slice)
- Probe vocabulary extended: `animation`, `audio`, `playtest` — mapped into
  the P0 channel fabric so perception feeds aggregateVerdict AND the
  Delivery Gate from ONE source of truth. All 28 O6 assertions still green.

### The rig (`o7rig/`, browser half of the eyes)
- `eyes.mjs` — injected battery: canvas frame sampling → motion energy,
  8-bucket palette histogram, Sobel-style edge density; scene-hooked
  physics replay; fuzz driver (120 synthetic events), rAF-based input
  latency, crash watch from BEFORE first script runs.
- `run.mjs` — lint → launch headless Edge → inject → collect → screenshots
  + perception JSON.
- `generator.mjs` — the GEN wiring: gateway implementation (OpenAI-compatible,
  scaffold contract + prompt + prior critique) that activates the moment
  `ORCHESTRA_GATEWAY_URL` + `ORCHESTRA_MODEL_KEY` exist; explicit
  `NO_MODEL_CREDENTIALS` failure otherwise — no fake autonomy, ever.

### The scene (`canyon-v3.html`) — Crystal Canyon at Dusk
Seeded fBm canyon (steep walls), 26 pulsing emissive crystals with additive
glow billboards + cyan point lights, 1400 drifting pollen sprites, camera
dolly, **real Rapier physics** (10 seeded shards, 240-step double replay),
**real synthesized audio** (Dm add9 swell through compressor, offline
render).

## The proof chain
1. Rig caught a REAL WebGL trap (preserveDrawingBuffer) — black-frame
   blindness diagnosed and fixed via evidence, not guesswork.
2. Formal verdict initially FAIL on playtest — exposed a threshold
   calibration flaw (absolute frames vs fps); fixed in the pure core.
3. Final: `PASS animation alive · PASS palette healthy · PASS edges rich ·
   PASS physics deterministic_stable · PASS audio rendered · PASS playtest
   responsive`.
4. Physics replay hash `fa0f0a6d` == `fa0f0a6d` — determinism demonstrated
   on this machine, twice per run, every run.

## Honest wiring status
- The GEN phase is BUILT but credential-gated. With
  `ORCHESTRA_GATEWAY_URL`/`ORCHESTRA_MODEL_KEY` set, the same runner
  generates scenes from prompts through the gateway; until then attempts
  run in explicitly-labeled manual mode. No pretense of autonomy.
- Rig runs on SwiftShader (software GL): ~21fps at 720p on the canyon —
  the fps gate is calibrated for this and will only improve on hardware GL.

## Handed to O7b
Post-processing stack (god-rays/bloom/DoF), starfield sky, crystal vein
interior shading, deeper physics (terrain heightfield colliders), and the
flagship choreography: prompt → gateway GEN → loop → Delivery Gate.
