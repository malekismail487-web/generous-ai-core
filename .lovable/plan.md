# Plan: Visual Lecture Generator + Notes Tab Redesign

Two coordinated changes:

## 1. Visual Lecture Generator (Subjects / Lectures)

A new generator surface that produces a structured lecture with one high-quality image per paragraph, generated in parallel.

### Flow
1. User picks **Topic** (free text), **Subject** (existing 12-subject list), and **Expertise**: Basic / Intermediate / Advanced / Expert.
2. Click **Generate Lecture**.
3. Stage A — *Outline pass* (fast, ~3-5s):
   - One call to `google/gemini-3-flash-preview` returns JSON: `{ title, intro, paragraphs: [{ heading, body, image_prompt }], conclusion, key_takeaways[] }`.
   - Body = 5-8 paragraphs × 4-7 sentences. `image_prompt` is a self-contained, photorealistic prompt tuned to the expertise level.
4. Stage B — *Parallel image pass* (~15-30s):
   - All paragraph `image_prompt`s fired concurrently to `google/gemini-2.5-flash-image` (Nano Banana) via the AI Gateway through a new edge function.
   - Per-image timeout (25s) + one retry. If an image still fails, slot is marked `failed` with a per-paragraph **Retry** button — the rest of the lecture still renders.
5. UI shows live progress: `Writing lecture… → Generating image 3 / 7…`.

### Edge functions (new)
- `lecture-outline` — single call, structured JSON via tool calling, raw LaTeX preserved (no pre-rendering).
- `lecture-image` — accepts `{ prompt, expertise }`, returns base64 data URL from Nano Banana. Stateless so the client can fan out N parallel calls.

### Frontend
- New `src/components/student/LectureGenerator.tsx` (replaces current ad-hoc subject lecture flow inside `SubjectsSection`).
- Inline reader: serif body (Source Serif 4), centered images ≥800px wide with `loading="lazy"`, raw LaTeX rendered only at display time via existing `MathRenderer`.
- Per-paragraph **Retry image** button.
- **Download PDF** via existing `lectureExport` (extended to embed base64 images).
- Hooked into `SubjectsSection` as the primary lecture path; legacy text-only generator removed.

### Performance
- Outline + 7 parallel images target: ≤45s end-to-end on Nano Banana Flash.
- No sequential awaits; `Promise.allSettled` for image fan-out.

## 2. Notes Tab Redesign (file → AI essay)

Current Notes tab duplicates Subjects. Replace with a **file-driven note generator**:

- Upload PDF / DOCX / PPT / image (reuse existing 50MB pipeline + `explain-file` edge function).
- AI produces a long-form, structured **essay-style notes** document (intro, 6-10 sections, key terms, summary, takeaways) — same depth contract as Subjects lectures.
- Saved into the existing `notes` table so the user keeps a library; raw LaTeX preserved, rendered on display.
- Same depth contract reused inside SAT generation and Subjects generation so all three (Subjects / SAT / Notes) share a single "comprehensive essay" prompt module.

### Files
- Edit `src/components/NotesSection.tsx` → file uploader + generated essay viewer + library.
- New helper `src/lib/comprehensiveEssayPrompt.ts` shared by Subjects, SAT, Notes generators.
- Reuse `explain-file` edge function with the new shared prompt.

## Out of scope (call out, don't build)
- Per-paragraph "make longer / add examples" inline edits — defer to a follow-up unless you want it now.
- Sharing links — defer; PDF download covers the main export need.

## Risks / cost note
Nano Banana image calls are billed per image. A 7-paragraph lecture = 7 image calls per generation. If that's a concern I can default to 5 paragraphs (still meets the 5-8 range) and let "Expert" go up to 8.

Confirm and I'll build it.
