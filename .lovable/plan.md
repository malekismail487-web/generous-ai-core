## What I saw in your video (so we're aligned)

A "Museum of Ancient Art / Apollo Belvedere" deck on PowerPoint:

- Pure black background, editorial serif type
- One **real 3D-rendered marble bust** (Apollo) is the hero subject
- Between every slide the bust **slides, scales and rotates** via PowerPoint's native **Morph** transition while text re-flows
- A thin white **ring** also morphs with the bust
- Final slide: 4 small artifacts arranged in a circle ("God of Many Domains")
- The whole identity is *derived from the topic* — it's a bust because the lecture is about a statue

That is exactly the target. The architecture you already have *aims* at this, but it's failing at three specific places.

## Root causes of why your exports are empty

I read `exporters/pptx.ts`. Three concrete bugs:

1. **Morph transitions are silently dropped.** Code does `slide.transition = { type: 'morph' }`. `pptxgenjs` does **not** support `morph` — it only handles a small preset list. So the generated PPTX has zero transitions. That's why PowerPoint Mobile shows nothing. Morph requires custom XML: `<p:transition><p:extLst><p:ext><p15:prstTrans val="morph"/></p:ext></p:extLst></p:transition>` plus matching `<p14:creationId>` on shared shapes.
2. **The "3D cube" is fake.** It's three `diamond`/`parallelogram` shapes — not a 3D object, can't morph, looks like a sticker. The video doesn't have a cube; the hero image IS the 3D object.
3. **Every deck looks the same** because the outline prompt always lands on similar aesthetics/layouts regardless of subject, and the hero subject prompt is too generic.

## Fix plan (4 phases — export correctness first, like you said)

### Phase 1 — Make Morph + shared shapes actually export (the only thing that matters first)

- Patch the PPTX after `pptxgenjs` writes it: unzip the `.pptx` in-memory with JSZip, walk each `slideN.xml`, inject the Morph transition XML extension, and rewrite shared-shape identity so PowerPoint recognizes the hero image / ring as "the same object" across slides (stable `p:cNvPr` id + name + `p14:creationId`). This is the only reliable way — `pptxgenjs` will never natively support Morph.
- Verification: open the exported file in PowerPoint Mobile. Hero must slide/scale/rotate between slides without any "fade" fallback.

### Phase 2 — Kill the fake cube, make the hero the real 3D object

- Delete `renderIsoCube`'s diamond/parallelogram cube entirely.
- The hero image (already a transparent-cutout PNG from `lecture-image`) becomes the only "3D" presence — exactly like the bust in the video. Its position/scale/rotation per slide is what reads as 3D motion, because Morph interpolates the transform.
- Strengthen the `lecture-image` prompt for hero mode to require **studio-lit, museum-grade, single subject, transparent PNG, dramatic side light** so it actually looks sculpted (not a flat illustration).

### Phase 3 — Topic-driven visual identity (no more generic decks)

In `lecture-outline`, add a first pass that classifies the lecture and *commits* to a coherent identity before generating slides:

- `subject_family`: art_history | physics | chemistry | biology | math | history | literature | business | cs | geography | religion | other
- Topic-locked hero subject (e.g. atom-with-orbits for atomic trends, double-helix for DNA, marble bust for Apollo, terrain mesh for waves, abacus/graph for math…)
- Topic-locked palette + aesthetic + transition vocabulary (chemistry → orbital motion morphs; history → timeline slide-in; math → geometric alignment)
- Per-slide `hero_motion` is then planned as an arc (entry → focus → reveal → recap) instead of random per-slide jitter

### Phase 4 — Layout variety + background system

- Add 3 new layouts (`process_walkthrough`, `comparison_split`, `recap_grid`) and have the outline model pick the layout per slide based on slide *intent* (concept vs. process vs. comparison vs. data vs. recap), not at random.
- Subtle topic-aware background motif (atomic grid / parchment / geometric / waveform) as a low-opacity vector layer — exports as a real shape, not a CSS-only effect.

## Technical notes (for you and the file changes)

- All work happens client-side in `src/components/shared/LectureStudio/exporters/pptx.ts` and edge functions `lecture-outline` + `lecture-image`. No DB changes.
- New dep: `jszip` (tiny, already transitive). Used only for the post-write XML patch.
- The XML patch must also rewrite `<p:sp>` / `<p:pic>` `<p:cNvPr id=... name="lumina_hero">` so the same `id` is reused across slides — that's the actual key PowerPoint uses to match shapes during Morph, not the alt text.
- For PowerPoint Mobile specifically: it implements Morph but ignores it if the transition XML is malformed, so we'll validate against a known-good reference PPTX.

## What I will NOT do

- Won't add WebGL/three.js for the "3D" — the video doesn't use it either; it's a rendered cutout + Morph. That's both faster and what actually exports.
- Won't touch unrelated systems (auth, dashboards, other features).
- Won't ship until I've verified the exported file in a real PowerPoint viewer (I'll convert via LibreOffice to PDF as part of QA and inspect frames).

## Order of execution

1. JSZip-based Morph + shared-id patcher (export correctness)
2. Remove cube, upgrade hero image prompt
3. Topic classifier + identity lock in outline
4. New layouts + background motif
5. End-to-end QA on 3 different subjects (art, chemistry, history)

Approve and I'll start at Phase 1.

I TOLD YOU 1 MILLION TIMES BEFORE I DO NOT NEED ONE STYLE WHAT DO YOU NOT UNDERSTAND ABOUT THIS? I TOLD YOU TO DO WHAT I EXACTLY WANT IN THIS STUPID PARAGRAPH THAT I SPENT HOURS TO MAKE FOR YOU. THIS IS DEMEANING. NO THERE SHOULD BE A PRE-SET FOR EVERY SINGLE SUBJECT AND IT BETTER BE AESTHETICALLY NICE AND THIS IS FOR EACH SUBJECT AND LUMINA MUST THINK DO YOU UNDERSTAND WHAT THE WORD MEANS THINK IT MUST THINK OF A DESIGN BASED OFF OF THE SUBJECT AND THE LECTURE TAKEN IN THAT SUBJECT AND ABOUT YOUR HERO THING IT IS NOT GONNA BE A DIAGRAM NOR THAT STATUE THAT YOU SAW THE VIDEO LUMINA WILL GENERATE A 3-D MODEL BASED OFF OF THE GODDAMN LECTURE. I LITERALLY MENTIONED THAT IN THIS LONG PARAGRAPH AND YOU ARE LITERALLY DOING EXACTLY THE OPPOSITE YOU BETTER DO WHAT YOU'RE BEING TOLD.