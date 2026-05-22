# Cinematic PPTX upgrade for Lumina Lecture Studio

Goal: when a student or teacher generates a lecture, the exported `.pptx` looks and *moves* like the reference video — dark editorial deck, a recurring cutout "hero subject" that appears to fly, rotate and zoom between slides via PowerPoint Morph, ring/circle framing, and large serif typography. Same Studio, same button — only the output gets dramatically better. Add an in-app interactive slide preview so the user can actually feel the deck before downloading.

This is a frontend + edge-function + exporter change only. No DB or auth changes.

## What the reference video is actually doing

- Pure 2D PowerPoint with the **Morph** slide transition.
- One **transparent-background "hero" image** (a marble bust) is placed on every slide with the *same shape name*, but at different size / position / rotation / crop. Morph then animates the camera-like motion between slides.
- Editorial dark theme: pure black background, off-white serif headlines, thin circular ring SVG, generous negative space, a small "chapter number" mark.
- Content slides use a **2×2 quadrant** layout around the hero, or a half-bleed hero with a stacked text column.
- Cover and section dividers are full-bleed hero with a single huge serif title.

Lumina already returns aesthetic + palette + transition from `lecture-outline`. We extend that contract and rebuild the PPTX exporter around it.

## Scope

1. New "cinematic" aesthetic option + cinematic master template
2. Real Morph transitions via shared shape IDs
3. A reusable transparent "hero subject" image per lecture
4. New PPTX slide layouts (hero cover, ring portrait, quadrant, half-bleed, chapter divider, takeaways)
5. In-app interactive slide preview (HTML/CSS, mirrors the PPTX look, click-through + arrow keys + Morph-style FLIP animation between slides)
6. Wire it for both student and teacher Studio modes — no separate tool

## Files to change / add

```
supabase/functions/lecture-outline/index.ts        (extend schema)
supabase/functions/lecture-image/index.ts          (add hero-subject mode, transparent bg)
src/components/shared/LectureStudio/types.ts       (new aesthetic + slide_plan types)
src/components/shared/LectureStudio/LectureStudio.tsx
src/components/shared/LectureStudio/SlidePreview.tsx       NEW (interactive preview)
src/components/shared/LectureStudio/slideLayouts.ts        NEW (layout picker)
src/components/shared/LectureStudio/exporters/pptx.ts      (rewrite around layouts + Morph)
```

No changes to `docx.ts`, `pdf.ts`, DB schema, RLS, or auth.

## 1. Outline contract additions

`lecture-outline` already returns `aesthetic`, `palette`, `transition`. We add:

- `hero_subject_prompt`: one self-contained prompt for the recurring transparent cutout subject (e.g. "marble bust of Apollo, studio lighting, isolated"). The model must pick a subject that *makes sense* across all paragraphs of the lecture (a molecule for chemistry, a brain for neuroscience, a Roman column for history, etc.).
- per-paragraph `slide_layout`: `"cover" | "chapter" | "ring_portrait" | "quadrant" | "half_bleed_left" | "half_bleed_right" | "stat_callout" | "takeaways"` — model picks the best layout per beat.
- per-paragraph `hero_motion`: `{ scale, x, y, rotate, crop }` normalized 0-1 — the *camera frame* for the hero on that slide. This is what drives Morph.

We add `"cinematic_editorial"` to the `aesthetic` enum and instruct the model to default to it when the topic is humanities / history / art / literature, and to pick another aesthetic otherwise.

## 2. Hero subject generation

`lecture-image` gains a `mode: "hero_subject"` flag. When set, it requests a **transparent-background** PNG (Gemini image with prompt suffix "isolated on pure transparent background, no shadow, no ground, studio cutout"). The Studio generates the hero **once** at outline-load time, then reuses it on every slide. This is the trick that makes Morph feel 3D — same object, different camera.

The per-paragraph illustrations stay as they are (used only on layouts that have a secondary illustration slot).

## 3. PPTX exporter rewrite

New file structure inside `exporters/pptx.ts`:

```text
exportLectureAsPPTX(outline, images, heroSubjectUrl)
  ├─ buildTheme(aesthetic, palette)       → fonts, colors, master bg
  ├─ addCoverSlide()
  ├─ for each paragraph: addContentSlide(layout, heroMotion, paragraph, image)
  ├─ addTakeawaysSlide()
  └─ (teacher) addLessonPlanSlides()
```

Per-layout renderers (`layouts/cover.ts`, `layouts/ringPortrait.ts`, `layouts/quadrant.ts`, etc.) each:

- draw the master background (black with subtle vignette for cinematic)
- place the hero image with `name: "lumina_hero"` and `{x,y,w,h,rotate}` derived from `hero_motion` — **same name on every slide is what triggers Morph to animate it**
- place an optional thin SVG ring with `name: "lumina_ring"` (also morphs)
- place title / body / bullets using the aesthetic's font stack
- write `slide.transition = { type: "morph" }` (pptxgenjs supports it; we already wrap defensively)

Quadrant layout: hero centered, 4 short bullets in the corners with hairline connectors. Ring-portrait: hero centered inside a thin circle, single column of body text on the right. Chapter divider: hero pushed off-frame with only a huge serif chapter title visible — the next slide's Morph then reveals the new composition.

Diagrams stay on their own dedicated slide (current behavior), but use the cinematic master.

## 4. In-app interactive preview

New `SlidePreview.tsx` mounted in `LectureStudio` after generation. Pure React + Framer-Motion-free CSS:

- Renders each slide as an HTML composition that mirrors the PPTX layout exactly (same hero image, same ring SVG, same fonts, same coordinates scaled to a 16:9 box).
- Arrow keys / on-screen prev-next / dot pager to navigate.
- Between slides, the hero `<img>` and ring `<svg>` are absolutely positioned with a shared `layoutId`-style key; on slide change we read both bounding boxes and animate `transform: translate/scale/rotate` with a 600ms cubic-bezier — a hand-rolled FLIP, no extra deps. This is the on-screen equivalent of PowerPoint's Morph and is what gives the "3D" feel in the app itself.
- "Download .pptx" button stays where it is; preview is shown above it. The preview makes the value visible *before* the user downloads.

## 5. Aesthetic guardrails

We force the cinematic aesthetic to:

- background `#000000`, surface `#0A0A0A`, primary `#F5F1E8` (warm off-white), accent picked by model
- heading font `"Cormorant Garamond"` (PPTX: `"Cormorant Garamond"` with `"Georgia"` fallback), body `"Inter"` with `"Calibri"` fallback
- transition forced to `morph`
- ring stroke 1pt, opacity 60%
- no decorative under-title accent lines (per design memory rule)

Other aesthetics keep current behavior so existing decks don't regress.

## 6. Student + teacher parity

`LectureStudio` already mounts in both `SubjectsSection` (student) and the teacher AI Lectures tab. No new wiring — both modes get the new exporter and the new preview automatically. Teacher lesson-plan slides keep their existing dedicated slides but adopt the cinematic master when the aesthetic is cinematic.

## Out of scope (intentionally)

- Real 3D (WebGL / three.js) inside PPTX — not possible in the file format.
- Native PowerPoint 3D Models (`.glb`) — pptxgenjs has no API for it and it would break LibreOffice fallback.
- Auto-generated speaker-notes audio.
- Changing DOCX or PDF exporters.

## Verification

- `tsc --noEmit` clean.
- Generate a sample lecture ("The Museum of Ancient Art") in student mode, open the in-app preview, step through slides, confirm hero animates between frames.
- Download `.pptx`, open in PowerPoint desktop, confirm Morph transitions actually animate the bust between slides (this is the real success criterion).
- Open same file in LibreOffice to confirm it doesn't crash even if Morph degrades to fade.
- Repeat in teacher mode and confirm lesson-plan slides still render.

## Technical notes for implementation

- pptxgenjs Morph: set `slide.transition = { type: "morph" }`. For shape morphing, pptxgenjs honors the `name` field on shapes/images when present; we set `name: "lumina_hero"` and `name: "lumina_ring"` consistently. If a runtime check shows the installed pptxgenjs version doesn't write the name attribute, we write a tiny post-process step that patches the generated XML in-memory before `writeFile` to inject `<p:nvSpPr><p:cNvPr name="lumina_hero"/>` — kept behind a feature flag.
- Hero image is fetched once, converted to base64, and embedded into every slide via `data:` (per skill guidance — never `path:`).
- Preview uses `requestAnimationFrame` + cached bounding rects; no animation library added.
- must generate at least one 3-D object in a presentation 
- Lumina must read its lectures that it has generated and try to decide a theme based off of the lecture, and this is a must
- Presentations must be equally balanced no slide should be word heavy and little to no pictures and no slides should be one picture and little words every slide it creates must be balanced
- Do not rush any codes and make this professional