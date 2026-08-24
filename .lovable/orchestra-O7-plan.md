# ORCHESTRA O7 — Engine Kit Master Plan (v1.1 · PLANNING)

> Status: PLANNING — Substrate Doctrine APPROVED (§0a); failure semantics
> REVISED by owner (§4.5 Recovery Task); flagship defined (§11).
> Owner requirements (verbatim intent): real 3D · real physics · animation ·
> sound · voices · AAA-grade quality bar · **fully dynamic generation** ·
> institutional precision · screenshots as proof.
>
> This document is the result of a deliberate self-scan (§1) plus targeted
> research (§2). Whether O7 is straightforward or eternal depends on the
> contracts frozen here.

---

## 0. The one-line answer to the hard requirement

**We ship capability primitives and deterministic scaffolds — never content.
Every visible, audible, playable thing is generated code, written per
project by the swarm, verified by evidence loops before it may ship.**

Libraries provide only SUBSTRATE (a rasterizer and a rigid-body solver —
the browser's own equivalents are WebGL/WebGPU and WASM); all content,
materials, animation systems, audio graphs, game logic, and shaders are
bespoke generated implementations. That is the honest engineering reading
of "dynamic": generation from mathematical primitives upward, not template
lookup downward.

---

## 1. THE SELF-SCAN — how I (the model) actually fail at 3D

This is the section the owner demanded. Each failure mode is real,
observed behavior of LLM-driven 3D generation; each has an architectural
countermeasure that O7 builds in. **The plan exists because of this table.**

| # | Failure mode (honest) | Why it happens | Countermeasure (built into O7) |
|---|---|---|---|
| F1 | **Blindness** — I cannot see renders. Black screens, cameras inside objects, lights missing, objects at 0.00001m scale | No visual channel during generation | CLOSED LOOP (§4): headless run → luminance histograms, coverage %, draw-call counts, screenshot pixel stats fed back as text evidence. A scene ships only when evidence says pixels exist and move |
| F2 | **Scale/unit drift** — mixed units, Z-up confusion, camera near/far absurdity | Prose-trained priors vs strict SI world | Generation Scaffold mandates meters/Y-up/near-far ranges; static lint pass rejects violations pre-run |
| F3 | **Wrong-looking color** — flat, washed-out or crushed output | sRGB/linear mismanagement | Scaffold pins renderer output color space + ACES tonemapping + IBL environment by default; histogram contrast gate in evidence pack |
| F4 | **Physics tuning blindness** — jitter, explosive stacks, tunneling | Cannot feel simulations | Fixed-timestep scaffold (60Hz + substeps + interpolation), energy-drift probe, tunneling raycast sweeps, sleep audits — all O6 `physics` probe keys |
| F5 | **Non-deterministic worlds** — same seed, different results | Math.random, Date.now, unordered construction | Seeded PRNG (integer/hash-based only — Rapier docs warn Math.sin etc. are NOT cross-platform deterministic [R]); ordered spawn manifests enforced |
| F6 | **Animation jank & foot-sliding** — hand-authored keyframes are where LLM output dies | Authoring curves blind is hopeless | PROCEDURAL-FIRST doctrine: gait generators (phase-coupled sine rigs), spring-damper cameras, two-bone IK, state machines — math I can reason about exactly. Easing validators + root-motion vs ground-speed check |
| F7 | **Silent runtime death** — WebGL context loss, shader compile errors swallowed | Errors off the main thread path | Console/network probes extended: context-loss events, program-link status, first-render framebuffer readback checksum |
| F8 | **Memory leaks across iterations** — disposed-geometry leaks in long sessions | Regeneration churn | Disposal audit in fuzz probe: heap growth budget per iteration count |
| F9 | **Overconfidence without evidence** — declaring "done" on unrunnable code | Language-model prior | Delivery Gate already blocks unevidenced claims (O5); O6 packs become REQUIRED per mode (§7) |

Meta-conclusion of the scan: **my weakness is perception, not synthesis.**
I can write correct three.js/Rapier/WebAudio code when consequences are
measurable and fed back; I fail when shipping blind. Therefore O7 is, at
its heart, an *evidence-per-generation* architecture. This is why the O6
Evidence Harness was built BEFORE O7 — the sequencing was chosen so this
plan could stand on it.

---

## 2. Research findings (grounding)

- **Rapier determinism [R]**: fully cross-platform deterministic given
  identical initial conditions AND identical body/collider/joint
  CONSTRUCTION ORDER. Critical caveat: `Math.sin`, `Math.cos` and other
  transcendental functions are NOT cross-platform deterministic ⇒ all
  initial conditions must derive from integer arithmetic / hash-mixing
  (our seeded PRNG), never from floating-point trig at init time.
- **three.js field knowledge [D3]**: the canonical failure checklist is
  literally published ("Help! Why can't I see anything?"): black background
  vs missing light vs frustum clipping vs camera-inside-object vs
  microscopic scale. SI units everywhere (1 unit = 1m). Color management
  (sRGB output encoding, linear-working) is the difference between
  "generated" and "good-looking". Perf canon: few direct lights (shader
  recompiles on add/remove — use visibility/intensity instead),
  MSAA beats post-process AA on cost/quality, transparency is expensive
  (prefer alphaTest), draw-call counting as primary health metric,
  instancing for repetition, LOD for distance, pixel-ratio caps on mobile,
  explicit disposal discipline.
- **Web Audio [MDN]**: complete modular DSP graph in-browser — oscillators
  incl. custom `PeriodicWave`, noise buffers, BiquadFilter/IIR, WaveShaper
  distortion, ConvolverNode reverb (with GENERATED impulse responses),
  DynamicsCompressor buses, PannerNode spatialization tied to the 3D scene,
  AudioWorklet for bespoke DSP threads, and crucially
  **OfflineAudioContext**: render audio graphs offline at full speed into a
  buffer we can analyze NUMERICALLY (RMS, peak, spectral centroid) — sound
  becomes evidence-checkable like pixels. Autoplay policy requires a user
  gesture before AudioContext resumes (scaffold handles).
- **SpeechSynthesis [MDN]**: built-in multi-voice TTS (`getVoices` async
  via voiceschanged, pitch/rate controls) — zero-cost voice baseline;
  quality varies per platform ⇒ tiered voice strategy (§6.6).

---

## 3. The Substrate Doctrine (resolving "not a set of libraries")

Three layers, with a hard rule between them:

```
L0 SUBSTRATE   three.js renderer · Rapier solver · WebAudio graph ·
               browser standards          ← LOADED, never hand-modified
─────────────── rule: nothing user-visible lives here ───────────────
L1 GENERATED   ALL geometry math (fBm terrain, SDF shapes, CSG) ·
               ALL materials/shaders (PBR params, GLSL/WGSL) ·
               ALL animation systems (procedural rigs, state machines) ·
               ALL audio graphs (synth voices, generated IRs, music) ·
               ALL game logic/UI                              ← 100%
               written fresh per project by worker agents
─────────────── rule: no prefab scenes, no asset packs, no template games
L2 CONTENT     parameters/seeds/scripts produced by the swarm per request
```

What this means practically: there is no `TerrainKit.presetForest()`.
There is a *generation contract* that says "terrain = fBm noise with domain
warping over a seeded permutation grid; you choose octaves/lacunarity/
warp strength; the harness measures silhouette variance and collision-
mesh agreement." Two requests for "forest world" produce two different
worlds, both passing the same evidence bars. **Dynamic by construction.**

---

## 4. THE CLOSED LOOP — the actual machine

The loop is O7's core invention, assembled entirely from phases P0–O6:

```
 ┌─▶ GEN      worker agents emit project files against the Scaffold
 │   RUN      headless preview executes N seeded frames (+ audio offline render)
 │   EVIDENCE O6 pack: console/network/perf/fuzz/visual/physics/a11y/api
 │            + luminance/coverage histograms · draw-call & triangle counts ·
 │            physics energy-drift & tunneling metrics · audio RMS/centroid
 │ CRITIQUE   structured diff vs previous attempt (what changed, which gates
 │            flipped) — bounded rationale events only (P0 directive 4)
 │ REPAIR     targeted edits (edit_file semantics, never full rewrites unless new)
 └── loop until gates PASS or revision budget exhausts → honest failure report
        then: Eyes end-state assessment → ADP review (high-stakes) → DELIVERY GATE
```

Loop laws:
1. **No generation without measurement.** Every attempt produces a pack.
2. **RECOVERY BEFORE EXIT — owner law (§4.5).** Exhausted repair cycles do
   NOT end a task; they trigger the Recovery Task protocol. Honest exit
   exists ONLY for literal impossibility and must be rare by design.
3. **Determinism spine**: seed → manifest → ordered construction → replay
   equality asserted by the physics probe on every run.
4. All critique travels as Phase-0 `status` events (fixed phase vocabulary)
   — no raw chain-of-thought anywhere in logs.

### 4.5 The Recovery Task protocol (owner amendment, replaces simple honest-exit)

```
repair cycles exhaust
      ▼
RECOVERY TASK  (not an exit — a research phase)
  1. web research: known solutions, prior art, platform constraints [A]
  2. hypothesis generation: N candidate theories for WHY the gates fail,
     each with a falsifiable predicted evidence delta
  3. experimental patches: one hypothesis at a time through the SAME
     Closed Loop (gen → run → pack) — theories are tested, not debated
  4. iterate recovery rounds while hypotheses remain untested
      ▼ (only if the hypothesis space is exhausted AND first principles
         say the goal is unreachable on this substrate)
HONEST EXIT — expected to be RARE; report enumerates every theory tried,
every evidence result, and names the specific impossibility
(e.g. "requires hardware outside browser substrate X").
```

Recovery Task laws:
- Research citations are mandatory in the recovery report (same
  admissibility rules as mini proposals).
- Each round produces real packs — no theory is accepted without its
  predicted evidence delta materializing.
- Recovery rounds are budgeted separately from repair cycles and are
  counted generously (institutions over cost — §0a.3).
- An honest exit WITHOUT a full recovery record is itself a governance
  violation Eyes will flag.

---

## 5. Generation Scaffolds (contracts, not content)

Every generated 3D/HYBRID project must import-and-fill these skeletons;
they exist to neutralize failure modes F2–F5 structurally:

| Scaffold | Pins |
|---|---|
| `loop.scaffold.ts` | fixed-timestep accumulator (60Hz, max-substep clamp) + interpolation alpha + pause semantics |
| `units.scaffold.ts` | meters/Y-up constants, near/far sanity bounds, scale assertions on loaded/generated bounds |
| `color.scaffold.ts` | output color space, ACES tonemap, IBL environment loading hook, exposure uniform |
| `rng.scaffold.ts` | seeded hash-mixing PRNG (integer-only); bans `Math.random`/trig-at-init via lint |
| `audio.scaffold.ts` | gesture-gated context resume, master compressor bus, listener rig bound to camera |
| `dispose.scaffold.ts` | ownership registry; leak audit hooks consumed by the fuzz probe |

Scaffolds contain ZERO gameplay/content code — they are load-bearing
plumbing with holes the swarm fills. They are versioned, tested artifacts
of O7 itself (deterministic unit tests like everything else).

---

## 6. Subsystem plans

### 6.1 Rendering (visuals)
- Geometry generation: fBm + domain-warped heightfields (terrain), SDF
  compositing (organic shapes), extrusion/lathe/CSG (structures), tri-planar
  mapped procedural textures drawn to canvas (POT sizes per [D3]).
- Materials: MeshStandardMaterial parameter sets + generated GLSL chunks
  (onBeforeCompile) for stylized responses; sky via generated gradient/
  Rayleigh-ish shader; environment lighting via PMREM from a generated
  scene (no HDR downloads needed).
- Post stack (the AAA look): ACES tonemapping, bloom, vignette, DoF,
  color-grading LUTs GENERATED per art-direction brief.
- Budgets (gate-enforced): ≤ ~1500 draw calls desktop-class, instancing
  mandatory above 200 repeats, pixelRatio cap 2, MSAA on, transparency
  audited.

### 6.2 Animation
Procedural-first: phase-coupled oscillator gaits, two-bone IK limb solvers,
spring-damper camera rigs, blend-tree-less state machines with authored
transition predicates, tween/easing library generated per project from
curve specs (validated monotonic/bounded). Skeletal glTF import remains
available as substrate use, but no clip libraries ship with ORCHESTRA.
Foot-sliding metric (root motion vs ground velocity) enters the visual probe.

### 6.3 Physics
Rapier compat build; mandated construction-order manifests; seeded init
only; CCD enabled for fast bodies (tunneling probe verifies); joint motors
for machinery; character controller kinematics for avatars. Evidence keys:
energy-drift ΔE/E over N steps, tunneling hit-rate, sleep-count stability,
replay hash equality (two runs, same seed ⇒ identical snapshot hash [R]).

### 6.4 Sound (fully procedural — no sample libraries)
Synth SFX: oscillator stacks + FM, noise bursts through generated envelope/
filter chains, impacts via filtered-noise + body-resonance models; reverb
via ConvolverNode with GENERATED impulse responses (decaying-noise IRs
shaped per space acoustics); dynamics bus via compressor. Music: generative
engine — seeded chord-progressions, arpeggio patterns, markov melody lines
over synthesized instruments. Evidence: OfflineAudioContext renders short
sequences; probes assert non-silence, RMS within range, spectral centroid
in expected band, clipping absent.

### 6.5 Voice
Tier V0: SpeechSynthesis (free, instant, per-platform quality variance;
voiceschanged handled). Tier V1: gateway TTS (same BYOK/gateway pattern as
the existing `generate-ambient-music` edge function — ElevenLabs key
already referenced in repo env contract). Character chain: pitch/formant
shaping + reverb sends via WebAudio so even T0 voices sit inside the mix.
Lipsync: viseme-amplitude approximation driving jaw-scale bones (procedural,
evidence-checked as animation metric).

### 6.6 Integration surface (CodeLab UX)
Mode selector CODE | 3D | HYBRID (blueprint §11). 3D/HYBRID add required
probes to the Delivery Gate: physics + perf + visual + (if audio present)
offline-audio checks. Preview pane gains evidence drawer (histograms,
counts, replay hash) rendered beside the canvas.

---

## 7. Quality bar — "AAA" operationalized (gate-enforced, not vibes)

| Axis | Gate (all measured, all in packs) |
|---|---|
| Frame stability | ≥ 58 FPS median over 10s fuzz session; p99 frame < 33ms |
| Scene health | luminance histogram non-degenerate (not black/blown); coverage ≥ threshold |
| Draw calls | ≤ budget per platform class; instancing ratio audited |
| Physics | replay-hash equality ×2 runs; energy-drift ≤ bound; tunneling ≈ 0 |
| Color | sRGB pipeline asserted; contrast band present |
| Audio | non-silent, RMS band, no clipping, gesture-gated start |
| Input latency | < 100ms click-to-effect via injected fuzz driver timestamps |
| Memory | heap growth ≤ budget across regeneration churn |
| Honesty | console clean of errors; network failures = declared externals only |

Honesty clause: this bar defines TECHNICAL AAA-grade execution on the web.
It does not promise shipped-game art parity with decade-long human studio
productions — it promises the engineering floor beneath such productions,
enforced by evidence rather than adjectives.

---

## 8. Delivery ordering (O7a → O7b → O7c)

| Stage | Delivers | Exit criteria |
|---|---|---|
| **O7a** | Scaffolds (tested) + Closed Loop kernel (GEN→RUN→EVIDENCE→CRITIQUE event types, pure cores) + mode gating in deliveryGate | Loop kernel folds deterministically; scaffolds lint-pass a reference scene; gates reject black-screen fixture |
| **O7b** | Visual & physics evidence upgrades: histogram/coverage/draw-call probes, replay-hash & tunneling probes, audio offline-render analysis | Reference generated scene passes FULL pack; black-scene and exploding-stack fixtures correctly FAIL |
| **O7c** | Full swarm choreography on a real brief: families generate a complete 3D scene w/ procedural animation, synth audio, TTS voice; Eyes end-state + ADP sign-off through Delivery Gate | One flagship demo ships through the entire governance chain, evidence public |

Each stage lands with its own `scripts/orchestraO7*.test.ts` harnesses and
`.lovable/orchestra-O7*-dossier.md`.

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Generated scenes consistently fail visual gates (F1) | Critique step carries HISTOGRAM deltas, not just pass/fail — direction, not verdict, feeds repair |
| Physics determinism broken by trig-init (F5/[R]) | rng.scaffold lint is a hard pre-run gate; replay-hash test catches escapes |
| Audio autoplay breaks headless runs | OfflineAudioContext path bypasses gesture policy for evidence; live path gated separately |
| Revision budgets exhausted on ambitious briefs | Honest-exit reports + scope-reduction proposals routed through ADP (owner sees tradeoffs, never silent butchery — §0a.2) |
| Scope explosion | O7a/O7b are prerequisites for ANY flagship attempt; no freehand skipping |

---

## 10. Owner decisions — RESOLVED (v1.1)

1. Substrate Doctrine: **APPROVED** as the definition of "dynamic, no
   libraries".
2. Failure semantics: **REVISED** — Recovery Task protocol adopted (§4.5);
   honest exit only at literal impossibility, expected rare.
3. Flagship proof: **DEFINED** (§11) — owner demands real rendered
   SCREENSHOTS of a maximal generated scene: lighting, complex geometry,
   colors, shaders, textures, RT-grade lighting, storyline narration,
   sound. Line count is explicitly not a constraint; institutional
   precision is.

---

## 11. The flagship prompt (owner-delegated, recorded here)

> "A lone bioluminescent guardian awakens inside a crystal canyon at dusk.
> God-rays cut through drifting pollen motes; procedural canyon walls carry
> glowing mineral veins; reflective pools mirror the sky. A four-legged
> guardian creature walks the ridge with a spring-damper gait while a
> synthesized orchestral score swells with its steps and a narrator's voice
> recounts the canyon's origin story. Orbit and walk modes; day-night
> dial."

Delivery form: **actual PNG screenshots captured from the running scene in
a real browser on this machine** (headless Chrome/Edge driving the built
bundle), plus the full O6 evidence pack per capture — histograms, draw-call
counts, physics replay hashes, offline-audio spectral analysis. Screenshots
without evidence packs are considered marketing, not delivery.

RT honesty note: browsers do not expose hardware ray-tracing pipelines to
web content generally; the flagship pursues RT-GRADE lighting via generated
raymarched shader passes (soft shadows, screen-space GI approximation,
reflection probes) within WebGL/WebGPU constraints — measured, not claimed.
